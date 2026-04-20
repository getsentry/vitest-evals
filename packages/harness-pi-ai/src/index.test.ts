import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { describeEval, getHarnessRunFromError, toolCalls } from "vitest-evals";
import { piAiHarness, type PiAiRuntime, type PiAiToolset } from "./index";

type DemoCase = {
  input: string;
};

const createAgent = vi.fn(() => ({
  id: "refund-agent",
}));

const tools = {
  lookupInvoice: {
    execute: async ({ invoiceId }: { invoiceId: string }) => ({
      invoiceId,
      refundable: true,
    }),
  },
} satisfies PiAiToolset<string, DemoCase>;

type DemoRuntime = PiAiRuntime<typeof tools, string, DemoCase>;

let replayDir: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (replayDir) {
    rmSync(replayDir, { recursive: true, force: true });
    replayDir = undefined;
  }
});

const runAgent = vi.fn(
  async ({
    agent,
    input,
    context,
    runtime,
  }: {
    agent: { id: string };
    input: string;
    context: { setArtifact: (name: string, value: string) => void };
    runtime: DemoRuntime;
  }) => {
    context.setArtifact("agentId", agent.id);
    await runtime.tools.lookupInvoice({
      invoiceId: "inv_123",
    });
    runtime.events.assistant("approved");

    return {
      decision: {
        status: "approved",
      },
      metrics: {
        provider: "pi-ai",
        model: "pi-refund",
        totalTokens: 12,
      },
    };
  },
);

describeEval("pi-ai harness adapter", {
  data: async () => [
    {
      input: "Refund invoice inv_123",
    },
  ],
  harness: piAiHarness({
    createAgent,
    run: runAgent,
    tools,
  }),
  test: async ({ run, session }) => {
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(run.output).toEqual({
      status: "approved",
    });
    expect(run.artifacts).toEqual({
      agentId: "refund-agent",
    });
    expect(toolCalls(session)).toMatchObject([
      {
        name: "lookupInvoice",
        arguments: {
          invoiceId: "inv_123",
        },
        result: {
          invoiceId: "inv_123",
          refundable: true,
        },
      },
    ]);
    expect(session.outputText).toBeUndefined();
    expect(run.usage.totalTokens).toBe(12);
  },
});

test("attaches a partial run when the harness errors", async () => {
  const erroringHarness = piAiHarness({
    createAgent: () => ({ id: "refund-agent" }),
    tools: {
      lookupInvoice: {
        execute: async ({ invoiceId }: { invoiceId: string }) => {
          throw new Error(`Invoice ${invoiceId} not found`);
        },
      },
    } satisfies PiAiToolset<string, DemoCase>,
    run: async ({ runtime }) => {
      await runtime.tools.lookupInvoice({
        invoiceId: "inv_missing",
      });

      return {
        decision: {
          status: "approved",
        },
      };
    },
  });

  const error = await erroringHarness
    .run("Refund invoice inv_missing", {
      caseData: {
        input: "Refund invoice inv_missing",
      },
      task: {
        meta: {},
      },
      artifacts: {},
      setArtifact: vi.fn(),
    })
    .catch((caughtError) => caughtError);

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("Invoice inv_missing not found");

  const run = getHarnessRunFromError(error);
  expect(run).toBeDefined();
  expect(run?.usage.toolCalls).toBe(1);
  expect(run?.errors).toEqual([
    {
      type: "Error",
      message: "Invoice inv_missing not found",
    },
  ]);
  expect(toolCalls(run!.session)).toMatchObject([
    {
      name: "lookupInvoice",
      arguments: {
        invoiceId: "inv_missing",
      },
      error: {
        type: "Error",
        message: "Invoice inv_missing not found",
      },
    },
  ]);
});

test("records and replays opt-in tools in auto mode", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-pi-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const execute = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));

  const replayHarness = piAiHarness({
    createAgent: () => ({ id: "refund-agent" }),
    tools: {
      lookupInvoice: {
        replay: true,
        execute,
      },
    } satisfies PiAiToolset<string, DemoCase>,
    run: async ({ runtime }) => {
      await runtime.tools.lookupInvoice({
        invoiceId: "inv_123",
      });

      return {
        decision: {
          status: "approved",
        },
      };
    },
  });

  const firstRun = await replayHarness.run("Refund invoice inv_123", {
    caseData: {
      input: "Refund invoice inv_123",
    },
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(execute).toHaveBeenCalledTimes(1);
  const firstCall = toolCalls(firstRun.session)[0];
  expect(firstCall.metadata?.replay).toMatchObject({
    status: "recorded",
  });

  const recordingPath = (
    firstCall.metadata?.replay as { recordingPath: string }
  ).recordingPath;
  const recording = JSON.parse(
    readFileSync(join(process.cwd(), recordingPath), "utf8"),
  ) as {
    input: { invoiceId: string };
    output: { invoiceId: string; refundable: boolean };
  };
  expect(recording.input).toEqual({
    invoiceId: "inv_123",
  });
  expect(recording.output).toEqual({
    invoiceId: "inv_123",
    refundable: true,
  });

  execute.mockImplementation(async () => {
    throw new Error("tool should not execute after the recording exists");
  });

  const secondRun = await replayHarness.run("Refund invoice inv_123", {
    caseData: {
      input: "Refund invoice inv_123",
    },
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(execute).toHaveBeenCalledTimes(1);
  expect(toolCalls(secondRun.session)[0].metadata?.replay).toMatchObject({
    status: "replayed",
  });
});

test("errors when strict mode is missing a recording", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-pi-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "strict");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const execute = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));

  const replayHarness = piAiHarness({
    createAgent: () => ({ id: "refund-agent" }),
    tools: {
      lookupInvoice: {
        replay: true,
        execute,
      },
    } satisfies PiAiToolset<string, DemoCase>,
    run: async ({ runtime }) => {
      await runtime.tools.lookupInvoice({
        invoiceId: "inv_123",
      });

      return {
        decision: {
          status: "approved",
        },
      };
    },
  });

  const error = await replayHarness
    .run("Refund invoice inv_123", {
      caseData: {
        input: "Refund invoice inv_123",
      },
      task: {
        meta: {},
      },
      artifacts: {},
      setArtifact: vi.fn(),
    })
    .catch((caughtError) => caughtError);

  expect(execute).not.toHaveBeenCalled();
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(
    "Missing replay recording for lookupInvoice",
  );
});
