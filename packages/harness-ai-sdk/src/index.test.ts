import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ToolExecutionOptions } from "ai";
import { afterEach, expect, test, vi } from "vitest";
import { describeEval, getHarnessRunFromError, toolCalls } from "vitest-evals";
import { z } from "zod";
import { aiSdkHarness, type AiSdkToolset } from "./index";

type DemoMetadata = {
  scenario?: string;
};

let replayDir: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (replayDir) {
    rmSync(replayDir, { recursive: true, force: true });
    replayDir = undefined;
  }
});

function createHarnessContext<TMetadata extends Record<string, unknown>>(
  metadata: TMetadata,
) {
  return {
    metadata,
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  };
}

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

describeEval(
  "ai-sdk harness adapter",
  {
    harness: aiSdkHarness({
      task: async () => ({
        ...generateTextLikeResult,
        object: {
          status: "approved",
          invoiceId: "inv_123",
          refundId: "rf_inv_123",
        },
      }),
    }),
  },
  (it) => {
    it("normalizes explicit harness runs", async ({ run }) => {
      const result = await run("Refund invoice inv_123");

      expect(result.output).toEqual({
        status: "approved",
        invoiceId: "inv_123",
        refundId: "rf_inv_123",
      });
      expect(result.usage).toMatchObject({
        provider: "openai",
        model: "gpt-4o-mini",
        totalTokens: 21,
        toolCalls: 2,
      });
      expect(result.session.provider).toBe("openai");
      expect(result.session.model).toBe("gpt-4o-mini");
      expect(result.session.outputText).toBe(
        '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123"}',
      );
      expect(toolCalls(result.session)).toMatchObject([
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
    });
  },
);

describeEval(
  "ai-sdk harness adapter custom entrypoint",
  {
    harness: aiSdkHarness({
      agent: () => {
        const generate = vi.fn(
          async (
            _input: string,
            runtime: { tools: Record<string, never> },
          ) => ({
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
        );

        return {
          generate,
        };
      },
    }),
  },
  (it) => {
    it("supports custom agent entrypoints", async ({ run }) => {
      const result = await run("Generate structured output");

      expect(result.output).toEqual({
        status: "approved",
      });
      expect(result.session.outputText).toBe('{"status":"approved"}');
    });
  },
);

test("default agent run receives wrapped runtime tools", async () => {
  const execute = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));
  const run = vi.fn(
    async (
      _input: string,
      runtime: {
        tools: {
          lookupInvoice: {
            execute: NonNullable<
              AiSdkToolset<string, DemoMetadata>["lookupInvoice"]["execute"]
            >;
          };
        };
      },
    ) => {
      const output = await runtime.tools.lookupInvoice.execute?.(
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
                input: {
                  invoiceId: "inv_123",
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
                output,
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
      };
    },
  );

  const harness = aiSdkHarness({
    agent: () => ({
      run,
    }),
    tools: {
      lookupInvoice: {
        replay: true,
        inputSchema: z.object({
          invoiceId: z.string(),
        }),
        execute,
      },
    } satisfies AiSdkToolset<string, DemoMetadata>,
  });

  const result = await harness.run(
    "Refund invoice inv_123",
    createHarnessContext({}),
  );

  expect(run).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(result.output).toEqual({
    status: "approved",
  });
  expect(toolCalls(result.session)).toMatchObject([
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
});

test("attaches partial runtime tool calls when a task errors", async () => {
  const execute = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));
  const harness = aiSdkHarness({
    tools: {
      lookupInvoice: {
        inputSchema: z.object({
          invoiceId: z.string(),
        }),
        execute,
      },
    } satisfies AiSdkToolset<string, DemoMetadata>,
    task: async ({ runtime }) => {
      await runtime.tools.lookupInvoice.execute?.(
        {
          invoiceId: "inv_123",
        },
        {
          toolCallId: "call_lookup",
          messages: [],
        } satisfies ToolExecutionOptions,
      );

      throw new Error("agent failed after tool call");
    },
  });

  const error = await harness
    .run("Refund invoice inv_123", createHarnessContext({}))
    .catch((caughtError) => caughtError);
  const run = getHarnessRunFromError(error);

  expect(execute).toHaveBeenCalledTimes(1);
  expect(run).toBeDefined();
  expect(run?.usage.toolCalls).toBe(1);
  expect(toolCalls(run!.session)).toMatchObject([
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
  ]);
  expect(run?.session.messages).toMatchObject([
    {
      role: "user",
      content: "Refund invoice inv_123",
    },
    {
      role: "assistant",
      toolCalls: [
        {
          id: "call_lookup",
          name: "lookupInvoice",
        },
      ],
    },
    {
      role: "tool",
      content: {
        invoiceId: "inv_123",
        refundable: true,
      },
      metadata: {
        name: "lookupInvoice",
        toolCallId: "call_lookup",
        isError: false,
      },
    },
  ]);
});

test("creates a fresh agent for each explicit run", async () => {
  const run = vi.fn(async () => ({
    object: {
      status: "approved",
    },
  }));
  const createAgent = vi.fn(() => ({
    run,
  }));
  const harness = aiSdkHarness({
    agent: createAgent,
  });
  const context = createHarnessContext({});

  await harness.run("Refund invoice inv_123", context);
  await harness.run("Refund invoice inv_123", context);

  expect(createAgent).toHaveBeenCalledTimes(2);
  expect(run).toHaveBeenCalledTimes(2);
});

test("normalizes domain results that resemble harness runs", async () => {
  const output = vi.fn(
    ({
      context,
      result,
    }: {
      context: { metadata: DemoMetadata };
      result: { object: { status: string } };
    }) => {
      expect(context.metadata.scenario).toBe("refund");
      return result.object;
    },
  );
  const session = vi.fn(
    ({
      input,
      result,
    }: {
      input: string;
      result: { object: { status: string } };
    }) => ({
      messages: [
        {
          role: "user" as const,
          content: input,
        },
        {
          role: "assistant" as const,
          content: result.object,
        },
      ],
    }),
  );
  const harness = aiSdkHarness({
    task: async () => ({
      session: {
        messages: [],
      },
      usage: {
        totalTokens: 7,
      },
      errors: [],
      object: {
        status: "approved",
      },
    }),
    output,
    session,
  });

  const run = await harness.run(
    "Refund invoice inv_123",
    createHarnessContext({ scenario: "refund" }),
  );

  expect(run.output).toEqual({
    status: "approved",
  });
  expect(output).toHaveBeenCalledTimes(1);
  expect(session).toHaveBeenCalledTimes(1);
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

test("aggregates per-step usage when total usage is missing", async () => {
  const harness = aiSdkHarness({
    task: async () => ({
      text: "approved",
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
          toolCalls: [],
          toolResults: [],
          usage: {
            inputTokens: 3,
            inputTokenDetails: {
              cacheReadTokens: 1,
            },
            outputTokens: 2,
            outputTokenDetails: {
              reasoningTokens: 1,
            },
            totalTokens: 5,
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
          text: "approved",
          content: [],
          reasoningText: undefined,
          finishReason: "stop",
          rawFinishReason: "stop",
          toolCalls: [],
          toolResults: [],
          usage: {
            inputTokens: 4,
            inputTokenDetails: {
              cacheReadTokens: 2,
            },
            outputTokens: 6,
            outputTokenDetails: {
              reasoningTokens: 3,
            },
            totalTokens: 10,
          },
          response: {
            messages: [],
          },
        },
      ],
    }),
  });

  const run = await harness.run(
    "Refund invoice inv_123",
    createHarnessContext({}),
  );

  expect(run.usage).toMatchObject({
    provider: "openai",
    model: "gpt-4o-mini",
    inputTokens: 7,
    outputTokens: 8,
    reasoningTokens: 4,
    totalTokens: 15,
    metadata: {
      cacheReadTokens: 3,
    },
  });
});

test("normalizes arrays and empty objects without dropping positions", async () => {
  const harness = aiSdkHarness({
    task: async () => ({
      object: {
        values: [1, undefined, { skipped: undefined }, 3],
        empty: {},
        nested: {
          kept: "yes",
          skipped: undefined,
        },
      },
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
                values: [1, undefined, 3],
                empty: {},
              },
            },
          ],
          toolResults: [
            {
              type: "tool-result",
              toolCallId: "call_lookup",
              toolName: "lookupInvoice",
              input: {
                values: [1, undefined, 3],
                empty: {},
              },
              output: {
                values: [undefined, "ok"],
                empty: {},
              },
            },
          ],
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
          },
          response: {
            messages: [],
          },
        },
      ],
    }),
  });

  const run = await harness.run(
    "Refund invoice inv_123",
    createHarnessContext({}),
  );

  expect(run.output).toEqual({
    values: [1, null, {}, 3],
    empty: {},
    nested: {
      kept: "yes",
    },
  });
  expect(toolCalls(run.session)).toMatchObject([
    {
      arguments: {
        values: [1, null, 3],
        empty: {},
      },
      result: {
        values: [null, "ok"],
        empty: {},
      },
    },
  ]);
});

test("preserves empty root tool arguments and omits zero tool usage", async () => {
  const harness = aiSdkHarness({
    task: async () => ({
      steps: [
        {
          stepNumber: 0,
          model: {
            provider: "openai",
            modelId: "gpt-4o-mini",
          },
          text: "done",
          content: [],
          reasoningText: undefined,
          finishReason: "stop",
          rawFinishReason: "stop",
          toolCalls: [
            {
              type: "tool-call",
              toolCallId: "call_empty",
              toolName: "checkPolicy",
              input: {},
            },
          ],
          toolResults: [
            {
              type: "tool-result",
              toolCallId: "call_empty",
              toolName: "checkPolicy",
              input: {},
              output: {
                ok: true,
              },
            },
          ],
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
          text: "done",
          content: [],
          reasoningText: undefined,
          finishReason: "stop",
          rawFinishReason: "stop",
          toolCalls: [],
          toolResults: [],
          response: {
            messages: [],
          },
        },
      ],
    }),
  });

  const run = await harness.run(
    "Refund invoice inv_123",
    createHarnessContext({}),
  );

  expect(run.usage.toolCalls).toBe(1);
  expect(toolCalls(run.session)[0].arguments).toEqual({});

  const noToolHarness = aiSdkHarness({
    task: async () => ({
      steps: [
        {
          stepNumber: 0,
          model: {
            provider: "openai",
            modelId: "gpt-4o-mini",
          },
          text: "done",
          content: [],
          reasoningText: undefined,
          finishReason: "stop",
          rawFinishReason: "stop",
          toolCalls: [],
          toolResults: [],
          response: {
            messages: [],
          },
        },
      ],
    }),
  });

  const noToolRun = await noToolHarness.run(
    "Refund invoice inv_123",
    createHarnessContext({}),
  );

  expect(noToolRun.usage.toolCalls).toBeUndefined();
});

test("uses invalid tool call details as the normalized error", async () => {
  const harness = aiSdkHarness({
    task: async () => ({
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
          finishReason: "error",
          rawFinishReason: "error",
          toolCalls: [
            {
              type: "tool-call",
              toolCallId: "call_invalid",
              toolName: "lookupInvoice",
              input: {
                invoiceId: 123,
              },
              invalid: {
                type: "ZodError",
                message: "Expected string, received number",
              },
            },
          ],
          toolResults: [],
          response: {
            messages: [],
          },
        },
      ],
    }),
  });

  const run = await harness.run(
    "Refund invoice inv_123",
    createHarnessContext({}),
  );

  expect(toolCalls(run.session)[0]).toMatchObject({
    id: "call_invalid",
    name: "lookupInvoice",
    error: {
      type: "ZodError",
      message: "Expected string, received number",
    },
    metadata: {
      invalid: {
        type: "ZodError",
        message: "Expected string, received number",
      },
    },
  });
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
    } satisfies AiSdkToolset<string, DemoMetadata>,
    task: async ({ runtime }) => {
      const lookupInvoice = runtime.tools.lookupInvoice;
      const toolInput = {
        invoiceId: "inv_123",
      };
      const toolOutput = await lookupInvoice.execute?.(toolInput, {
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

  const firstRun = await replayHarness.run(
    "Refund invoice inv_123",
    createHarnessContext({}),
  );

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

  const secondRun = await replayHarness.run(
    "Refund invoice inv_123",
    createHarnessContext({}),
  );

  expect(execute).toHaveBeenCalledTimes(1);
  expect(toolCalls(secondRun.session)[0].metadata?.replay).toMatchObject({
    status: "replayed",
  });
});

test("rejects async iterable replay outputs after awaiting execute", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-ai-sdk-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  async function* streamOutput() {
    yield "chunk";
  }

  const replayHarness = aiSdkHarness({
    tools: {
      streamRefund: {
        replay: true,
        inputSchema: z.object({
          invoiceId: z.string(),
        }),
        execute: vi.fn(async () => streamOutput()),
      },
    } as unknown as AiSdkToolset<string, DemoMetadata>,
    task: async ({ runtime }) => {
      await runtime.tools.streamRefund.execute?.(
        {
          invoiceId: "inv_123",
        },
        {
          toolCallId: "call_stream",
          messages: [],
        } satisfies ToolExecutionOptions,
      );

      return {
        text: '{"status":"approved"}',
      };
    },
  });

  const error = await replayHarness
    .run("Refund invoice inv_123", createHarnessContext({}))
    .catch((caughtError) => caughtError);

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("async iterable");
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
    } satisfies AiSdkToolset<string, DemoMetadata>,
    task: async ({ runtime }) => {
      await runtime.tools.lookupInvoice.execute?.(
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
    .run("Refund invoice inv_123", createHarnessContext({}))
    .catch((caughtError) => caughtError);

  expect(execute).not.toHaveBeenCalled();
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(
    "Missing replay recording for lookupInvoice",
  );
});
