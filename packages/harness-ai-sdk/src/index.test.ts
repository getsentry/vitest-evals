import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ToolExecutionOptions } from "ai";
import { afterEach, expect, test, vi } from "vitest";
import { describeEval, toolCalls } from "vitest-evals";
import { z } from "zod";
import { aiSdkHarness, type AiSdkToolset } from "./index";

type DemoCase = {
  input: string;
};

let replayDir: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (replayDir) {
    rmSync(replayDir, { recursive: true, force: true });
    replayDir = undefined;
  }
});

const generateTextLikeResult = {
  text: '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123"}',
  steps: [
    {
      stepNumber: 0,
      model: {
        provider: "openai",
        modelId: "gpt-4o-mini",
      },
      text: "",
      content: [],
      reasoningText: undefined,
      finishReason: "tool-calls",
      rawFinishReason: "tool_calls",
      toolCalls: [
        {
          type: "tool-call",
          toolCallId: "call_lookup",
          toolName: "lookupInvoice",
          input: {
            invoiceId: "inv_123",
          },
        },
        {
          type: "tool-call",
          toolCallId: "call_refund",
          toolName: "createRefund",
          input: {
            invoiceId: "inv_123",
            amount: 4200,
          },
        },
      ],
      toolResults: [
        {
          type: "tool-result",
          toolCallId: "call_lookup",
          toolName: "lookupInvoice",
          input: {
            invoiceId: "inv_123",
          },
          output: {
            invoiceId: "inv_123",
            refundable: true,
          },
        },
        {
          type: "tool-result",
          toolCallId: "call_refund",
          toolName: "createRefund",
          input: {
            invoiceId: "inv_123",
            amount: 4200,
          },
          output: {
            refundId: "rf_inv_123",
            status: "submitted",
          },
        },
      ],
      usage: {
        inputTokens: 10,
        inputTokenDetails: {
          noCacheTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 4,
        outputTokenDetails: {
          textTokens: 4,
          reasoningTokens: 0,
        },
        totalTokens: 14,
      },
      response: {
        messages: [],
      },
    },
    {
      stepNumber: 1,
      model: {
        provider: "openai",
        modelId: "gpt-4o-mini",
      },
      text: '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123"}',
      content: [],
      reasoningText: undefined,
      finishReason: "stop",
      rawFinishReason: "stop",
      toolCalls: [],
      toolResults: [],
      usage: {
        inputTokens: 3,
        inputTokenDetails: {
          noCacheTokens: 3,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 4,
        outputTokenDetails: {
          textTokens: 4,
          reasoningTokens: 0,
        },
        totalTokens: 7,
      },
      response: {
        messages: [],
      },
    },
  ],
  totalUsage: {
    inputTokens: 13,
    inputTokenDetails: {
      noCacheTokens: 13,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokens: 8,
    outputTokenDetails: {
      textTokens: 8,
      reasoningTokens: 0,
    },
    totalTokens: 21,
  },
} as const;

describeEval("ai-sdk harness adapter", {
  data: async () => [
    {
      input: "Refund invoice inv_123",
    },
  ],
  harness: aiSdkHarness({
    run: async () => ({
      ...generateTextLikeResult,
      object: {
        status: "approved",
        invoiceId: "inv_123",
        refundId: "rf_inv_123",
      },
    }),
  }),
  test: async ({ run, session }) => {
    expect(run.output).toEqual({
      status: "approved",
      invoiceId: "inv_123",
      refundId: "rf_inv_123",
    });
    expect(run.usage).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      totalTokens: 21,
      toolCalls: 2,
    });
    expect(session.provider).toBe("openai");
    expect(session.model).toBe("gpt-4o-mini");
    expect(session.outputText).toBe(
      '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123"}',
    );
    expect(toolCalls(session)).toMatchObject([
      {
        id: "call_lookup",
        name: "lookupInvoice",
        arguments: {
          invoiceId: "inv_123",
        },
        result: {
          invoiceId: "inv_123",
          refundable: true,
        },
      },
      {
        id: "call_refund",
        name: "createRefund",
        arguments: {
          invoiceId: "inv_123",
          amount: 4200,
        },
        result: {
          refundId: "rf_inv_123",
          status: "submitted",
        },
      },
    ]);
  },
});

describeEval("ai-sdk harness adapter custom entrypoint", {
  data: async () => [
    {
      input: "Generate structured output",
    },
  ],
  harness: aiSdkHarness({
    createAgent: () => ({
      generate: async () => ({
        object: {
          status: "approved",
        },
        steps: [
          {
            stepNumber: 0,
            model: {
              provider: "openai",
              modelId: "gpt-4o-mini",
            },
            text: '{"status":"approved"}',
            content: [],
            reasoningText: undefined,
            finishReason: "stop",
            rawFinishReason: "stop",
            toolCalls: [],
            toolResults: [],
            usage: {
              inputTokens: 5,
              inputTokenDetails: {
                noCacheTokens: 5,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              outputTokens: 2,
              outputTokenDetails: {
                textTokens: 2,
                reasoningTokens: 0,
              },
              totalTokens: 7,
            },
            response: {
              messages: [],
            },
          },
        ],
        totalUsage: {
          inputTokens: 5,
          inputTokenDetails: {
            noCacheTokens: 5,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokens: 2,
          outputTokenDetails: {
            textTokens: 2,
            reasoningTokens: 0,
          },
          totalTokens: 7,
        },
      }),
    }),
  }),
  test: async ({ run, session }) => {
    expect(run.output).toEqual({
      status: "approved",
    });
    expect(session.outputText).toBe('{"status":"approved"}');
  },
});

test("records and replays opt-in tools in auto mode", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-ai-sdk-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const execute = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));

  const replayHarness = aiSdkHarness({
    tools: {
      lookupInvoice: {
        replay: true,
        inputSchema: z.object({
          invoiceId: z.string(),
        }),
        execute,
      },
    } satisfies AiSdkToolset<string, DemoCase>,
    run: async ({ tools }) => {
      const lookupInvoice = tools?.lookupInvoice;
      if (!lookupInvoice?.execute) {
        throw new Error("lookupInvoice execute() was not available");
      }

      const toolInput = {
        invoiceId: "inv_123",
      };
      const toolOutput = await lookupInvoice.execute(toolInput, {
        toolCallId: "call_lookup",
        messages: [],
      } satisfies ToolExecutionOptions);

      return {
        text: '{"status":"approved"}',
        object: {
          status: "approved",
        },
        steps: [
          {
            stepNumber: 0,
            model: {
              provider: "openai",
              modelId: "gpt-4o-mini",
            },
            text: '{"status":"approved"}',
            content: [],
            reasoningText: undefined,
            finishReason: "stop",
            rawFinishReason: "stop",
            toolCalls: [
              {
                type: "tool-call",
                toolCallId: "call_lookup",
                toolName: "lookupInvoice",
                input: toolInput,
              },
            ],
            toolResults: [
              {
                type: "tool-result",
                toolCallId: "call_lookup",
                toolName: "lookupInvoice",
                input: toolInput,
                output: toolOutput,
              },
            ],
            usage: {
              inputTokens: 5,
              inputTokenDetails: {
                noCacheTokens: 5,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              outputTokens: 2,
              outputTokenDetails: {
                textTokens: 2,
                reasoningTokens: 0,
              },
              totalTokens: 7,
            },
            response: {
              messages: [],
            },
          },
        ],
        totalUsage: {
          inputTokens: 5,
          inputTokenDetails: {
            noCacheTokens: 5,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokens: 2,
          outputTokenDetails: {
            textTokens: 2,
            reasoningTokens: 0,
          },
          totalTokens: 7,
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
  expect(recordingPath).toMatch(/^\.tmp-ai-sdk-replay-/);
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
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-ai-sdk-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "strict");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const execute = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));

  const replayHarness = aiSdkHarness({
    tools: {
      lookupInvoice: {
        replay: true,
        inputSchema: z.object({
          invoiceId: z.string(),
        }),
        execute,
      },
    } satisfies AiSdkToolset<string, DemoCase>,
    run: async ({ tools }) => {
      const lookupInvoice = tools?.lookupInvoice;
      if (!lookupInvoice?.execute) {
        throw new Error("lookupInvoice execute() was not available");
      }

      await lookupInvoice.execute(
        {
          invoiceId: "inv_123",
        },
        {
          toolCallId: "call_lookup",
          messages: [],
        } satisfies ToolExecutionOptions,
      );

      return {
        text: '{"status":"approved"}',
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
