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
  run: runAgent,
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

const runAgent = vi.fn(async (input: string, runtime: DemoRuntime) => {
  expect(input).toBe("Refund invoice inv_123");
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
});

describeEval("pi-ai harness adapter", {
  data: async () => [
    {
      input: "Refund invoice inv_123",
    },
  ],
  harness: piAiHarness({
    agent: createAgent,
    tools,
  }),
  test: async ({ run, session }) => {
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(run.output).toEqual({
      status: "approved",
    });
    expect(run.artifacts).toBeUndefined();
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
    tools: {
      lookupInvoice: {
        execute: async ({ invoiceId }: { invoiceId: string }) => {
          throw new Error(`Invoice ${invoiceId} not found`);
        },
      },
    } satisfies PiAiToolset<string, DemoCase>,
    task: async ({ runtime }) => {
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

test("task can own agent creation while receiving wrapped runtime tools", async () => {
  const taskHarness = piAiHarness({
    tools,
    task: async ({ input, runtime }) => {
      expect(input).toBe("Refund invoice inv_123");
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

  const run = await taskHarness.run("Refund invoice inv_123", {
    caseData: {
      input: "Refund invoice inv_123",
    },
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(run.output).toEqual({
    status: "approved",
  });
  expect(toolCalls(run.session)).toMatchObject([
    {
      name: "lookupInvoice",
      arguments: {
        invoiceId: "inv_123",
      },
    },
  ]);
});

test("direct run and setup use the same execution lifecycle", async () => {
  const run = vi.fn(async () => ({
    decision: {
      status: "approved",
    },
  }));
  const createAgent = vi.fn(() => ({
    run,
  }));
  const harness = piAiHarness({
    agent: createAgent,
  });
  const context = {
    caseData: {
      input: "Refund invoice inv_123",
    },
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  };

  await harness.run("Refund invoice inv_123", context);
  const execution = await harness.setup?.();
  await execution?.run("Refund invoice inv_123", context);

  expect(createAgent).toHaveBeenCalledTimes(2);
  expect(run).toHaveBeenCalledTimes(2);
});

test("normalizes domain results that resemble harness runs", async () => {
  const harness = piAiHarness({
    task: async () => ({
      session: {
        id: "domain-session",
      },
      usage: {
        totalTokens: 7,
      },
      errors: [],
      decision: {
        status: "approved",
      },
    }),
  });

  const run = await harness.run("Refund invoice inv_123", {
    caseData: {
      input: "Refund invoice inv_123",
    },
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(run.output).toEqual({
    status: "approved",
  });
  expect(run.session.messages).toEqual([
    {
      role: "user",
      content: "Refund invoice inv_123",
    },
    {
      role: "assistant",
      content: {
        status: "approved",
      },
    },
  ]);
  expect(run.usage.totalTokens).toBe(7);
});

test("normalizes undefined object properties without dropping array positions", async () => {
  const harness = piAiHarness({
    task: async () => ({
      decision: {
        status: "approved",
        reason: undefined,
        nested: {
          skipped: undefined,
        },
        values: [1, undefined, 3],
        empty: {},
      },
    }),
  });

  const run = await harness.run("Refund invoice inv_123", {
    caseData: {
      input: "Refund invoice inv_123",
    },
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(run.output).toEqual({
    status: "approved",
    nested: {},
    values: [1, null, 3],
    empty: {},
  });
  expect(run.session.messages[run.session.messages.length - 1]).toEqual({
    role: "assistant",
    content: {
      status: "approved",
      nested: {},
      values: [1, null, 3],
      empty: {},
    },
  });
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
    tools: {
      lookupInvoice: {
        replay: true,
        execute,
      },
    } satisfies PiAiToolset<string, DemoCase>,
    task: async ({ runtime }) => {
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
  expect(recordingPath).toMatch(/^\.tmp-pi-replay-/);
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
    tools: {
      lookupInvoice: {
        replay: true,
        execute,
      },
    } satisfies PiAiToolset<string, DemoCase>,
    task: async ({ runtime }) => {
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
