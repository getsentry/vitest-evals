import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { describeEval, getHarnessRunFromError, toolCalls } from "vitest-evals";
import type { HarnessContext, JsonValue } from "vitest-evals/harness";
import { piAiHarness, type PiAiRuntime, type PiAiToolset } from "./index";

type DemoMetadata = {
  scenario?: string;
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
} satisfies PiAiToolset<string, DemoMetadata>;

type DemoRuntime = PiAiRuntime<typeof tools, string, DemoMetadata>;

let replayDir: string | undefined;

const judgePrompt = async (input: string) => input;

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

test("exposes the configured prompt on the harness", async () => {
  const prompt = vi.fn(async (input: string) => `judge: ${input}`);
  const harness = piAiHarness({
    agent: {
      id: "refund-agent",
    },
    prompt,
    run: runAgent,
    tools,
  });

  await expect(harness.prompt("score refund")).resolves.toBe(
    "judge: score refund",
  );
  expect(prompt).toHaveBeenCalledWith("score refund");
});

describeEval(
  "pi-ai harness adapter",
  {
    harness: piAiHarness({
      prompt: judgePrompt,
      createAgent,
      run: runAgent,
      tools,
    }),
  },
  (it) => {
    it("runs the harness explicitly", async ({ run }) => {
      const result = await run("Refund invoice inv_123");

      expect(createAgent).toHaveBeenCalledTimes(1);
      expect(runAgent).toHaveBeenCalledTimes(1);
      expect(result.output).toEqual({
        status: "approved",
      });
      expect(result.artifacts).toEqual({
        agentId: "refund-agent",
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
      expect(result.session.outputText).toBeUndefined();
      expect(result.usage.totalTokens).toBe(12);
    });
  },
);

describeEval(
  "pi-ai harness wraps native agent tools",
  {
    harness: piAiHarness({
      prompt: judgePrompt,
      createAgent: () => {
        const nativeTools = [
          {
            name: "lookupInvoice",
            execute: async (
              _toolCallId: string,
              args: { invoiceId: string },
            ) => ({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    invoiceId: args.invoiceId,
                    refundable: true,
                  }),
                },
              ],
              details: {
                invoiceId: args.invoiceId,
                refundable: true,
              },
            }),
          },
        ];

        return {
          agent: {
            state: {
              tools: nativeTools,
            },
          },
          async run(
            _input: string,
            runtime: { events: DemoRuntime["events"] },
          ) {
            const toolResult = await nativeTools[0].execute("lookupInvoice", {
              invoiceId: "inv_123",
            });
            runtime.events.tool("lookupInvoice", {
              content: toolResult.content,
              details: toolResult.details,
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
        };
      },
    }),
  },
  (it) => {
    it("preserves the native tool protocol while recording traces", async ({
      run,
    }) => {
      const result = await run("Refund invoice inv_123");

      expect(result.session.messages).toContainEqual({
        role: "tool",
        content: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                invoiceId: "inv_123",
                refundable: true,
              }),
            },
          ],
          details: {
            invoiceId: "inv_123",
            refundable: true,
          },
        },
        metadata: {
          name: "lookupInvoice",
        },
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
  },
);

describeEval(
  "pi-ai harness wraps native tools even with an explicit tool override",
  {
    harness: piAiHarness({
      prompt: judgePrompt,
      createAgent: () => {
        const nativeTools = [
          {
            name: "lookupInvoice",
            execute: async (
              _toolCallId: string,
              args: { invoiceId: string },
            ) => ({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    invoiceId: args.invoiceId,
                    refundable: true,
                  }),
                },
              ],
              details: {
                invoiceId: args.invoiceId,
                refundable: true,
              },
            }),
          },
        ];

        return {
          agent: {
            state: {
              tools: nativeTools,
            },
          },
          async run(
            _input: string,
            runtime: { events: DemoRuntime["events"] },
          ) {
            const toolResult = await nativeTools[0].execute("lookupInvoice", {
              invoiceId: "inv_123",
            });
            runtime.events.tool("lookupInvoice", {
              content: toolResult.content,
              details: toolResult.details,
            });
            runtime.events.assistant("approved");

            return {
              decision: {
                status: "approved",
              },
            };
          },
        };
      },
      tools,
    }),
  },
  (it) => {
    it("still traces native tool calls when runtime tools are configured", async ({
      run,
    }) => {
      const result = await run("Refund invoice inv_123");

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
  },
);

describeEval(
  "pi-ai harness reapplies native tool instrumentation after reset",
  {
    harness: piAiHarness({
      prompt: judgePrompt,
      createAgent: () => {
        const createNativeTool = () => ({
          name: "lookupInvoice",
          execute: async (
            _toolCallId: string,
            args: { invoiceId: string },
          ) => ({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  invoiceId: args.invoiceId,
                  refundable: true,
                }),
              },
            ],
            details: {
              invoiceId: args.invoiceId,
              refundable: true,
            },
          }),
        });

        const agent = {
          initialState: {
            tools: [createNativeTool()],
          },
          state: {
            tools: [createNativeTool()],
          },
          reset() {
            this.state.tools = this.initialState.tools.map((tool) => ({
              ...tool,
            }));
          },
        };

        return {
          agent,
          async run(
            _input: string,
            runtime: { events: DemoRuntime["events"] },
          ) {
            agent.reset();
            const toolResult = await agent.state.tools[0].execute(
              "lookupInvoice",
              {
                invoiceId: "inv_123",
              },
            );
            runtime.events.tool("lookupInvoice", {
              content: toolResult.content,
              details: toolResult.details,
            });
            runtime.events.assistant("approved");

            return {
              decision: {
                status: "approved",
              },
            };
          },
        };
      },
    }),
  },
  (it) => {
    it("records native tool calls after reset restores tool state", async ({
      run,
    }) => {
      const result = await run("Refund invoice inv_123");

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
  },
);

describeEval(
  "pi-ai harness infers runtime toolsets and native tools together",
  {
    harness: piAiHarness({
      prompt: judgePrompt,
      createAgent: () => {
        const toolset = {
          lookupInvoice: {
            execute: async ({ invoiceId }: { invoiceId: string }) => ({
              invoiceId,
              refundable: true,
            }),
          },
        } satisfies PiAiToolset<string, DemoMetadata>;

        const nativeTools = [
          {
            name: "lookupInvoice",
            execute: async (
              _toolCallId: string,
              args: { invoiceId: string },
            ) => ({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    invoiceId: args.invoiceId,
                    refundable: true,
                  }),
                },
              ],
              details: {
                invoiceId: args.invoiceId,
                refundable: true,
              },
            }),
          },
        ];

        return {
          toolset,
          agent: {
            state: {
              tools: nativeTools,
            },
          },
          async run(
            _input: string,
            runtime: { events: DemoRuntime["events"] },
          ) {
            const toolResult = await nativeTools[0].execute("lookupInvoice", {
              invoiceId: "inv_123",
            });
            runtime.events.tool("lookupInvoice", {
              content: toolResult.content,
              details: toolResult.details,
            });
            runtime.events.assistant("approved");

            return {
              decision: {
                status: "approved",
              },
            };
          },
        };
      },
    }),
  },
  (it) => {
    it("does not skip native tracing when a runtime toolset is also present", async ({
      run,
    }) => {
      const result = await run("Refund invoice inv_123");

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
  },
);

test("lets native Pi tools own replay when they delegate to a runtime tool of the same name", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-pi-overlap-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const lookupInvoice = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));
  let activeRuntime: DemoRuntime | undefined;
  const nativeExecute = vi.fn(
    async (_toolCallId: string, args: { invoiceId: string }) => {
      if (!activeRuntime) {
        throw new Error("Expected runtime before native tool execution");
      }

      const invoice = await activeRuntime.tools.lookupInvoice({
        invoiceId: args.invoiceId,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(invoice) }],
        details: invoice,
      };
    },
  );

  const replayHarness = piAiHarness({
    prompt: judgePrompt,
    toolReplay: {
      lookupInvoice: true,
    },
    createAgent: () => {
      const nativeTools = [
        {
          name: "lookupInvoice",
          execute: nativeExecute,
        },
      ];

      return {
        toolset: {
          lookupInvoice: {
            execute: lookupInvoice,
          },
        } satisfies PiAiToolset<string, DemoMetadata>,
        agent: {
          state: {
            tools: nativeTools,
          },
        },
        async run(_input: string, runtime: DemoRuntime) {
          activeRuntime = runtime;
          const toolResult = await nativeTools[0].execute("lookupInvoice", {
            invoiceId: "inv_123",
          });

          runtime.events.assistant(toolResult.content[0].text);

          return {
            decision: toolResult.details.refundable
              ? { status: "approved" as const }
              : { status: "denied" as const, reason: "not refundable" },
          };
        },
      };
    },
  });

  const firstRun = await replayHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(nativeExecute).toHaveBeenCalledTimes(1);
  expect(lookupInvoice).toHaveBeenCalledTimes(1);
  const firstCalls = toolCalls(firstRun.session);
  expect(firstCalls).toHaveLength(1);
  expect(firstCalls[0]).toMatchObject({
    name: "lookupInvoice",
    result: {
      invoiceId: "inv_123",
      refundable: true,
    },
    metadata: {
      replay: {
        status: "recorded",
      },
    },
  });
  const recordingPath = (
    firstCalls[0].metadata?.replay as { recordingPath: string }
  ).recordingPath;
  expect(recordingPath).toContain("lookupInvoice.native");
  const recording = JSON.parse(
    readFileSync(join(process.cwd(), recordingPath), "utf8"),
  ) as {
    output: {
      __vitestEvals: { kind: string };
      normalizedResult: { invoiceId: string; refundable: boolean };
    };
  };
  expect(recording.output).toMatchObject({
    __vitestEvals: {
      kind: "pi-ai-native-tool-result",
    },
    normalizedResult: {
      invoiceId: "inv_123",
      refundable: true,
    },
  });

  nativeExecute.mockImplementation(async () => {
    throw new Error("native tool should not execute after recording exists");
  });
  lookupInvoice.mockImplementation(async () => {
    throw new Error("runtime tool should not execute after recording exists");
  });

  const secondRun = await replayHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(nativeExecute).toHaveBeenCalledTimes(1);
  expect(lookupInvoice).toHaveBeenCalledTimes(1);
  expect(toolCalls(secondRun.session)).toHaveLength(1);
  expect(toolCalls(secondRun.session)[0]).toMatchObject({
    name: "lookupInvoice",
    metadata: {
      replay: {
        status: "replayed",
      },
    },
  });
});

describeEval(
  "pi-ai harness infers runtime toolsets from existing agents",
  {
    harness: piAiHarness({
      prompt: judgePrompt,
      createAgent: () => {
        const toolset = {
          lookupInvoice: {
            execute: async ({ invoiceId }: { invoiceId: string }) => ({
              invoiceId,
              refundable: true,
            }),
          },
        } satisfies PiAiToolset<string, DemoMetadata>;

        return {
          toolset,
          async run(_input: string, runtime: PiAiRuntime<typeof toolset>) {
            await runtime.tools.lookupInvoice({
              invoiceId: "inv_123",
            });

            return {
              decision: {
                status: "approved",
              },
            };
          },
        };
      },
    }),
  },
  (it) => {
    it("records inferred runtime tool calls without an explicit tools option", async ({
      run,
    }) => {
      const result = await run("Refund invoice inv_123");

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
  },
);

test("prefers inferred non-empty runtime toolsets over empty placeholders", async () => {
  const lookupInvoice = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));
  const harness = piAiHarness({
    prompt: judgePrompt,
    createAgent: () => {
      const toolset = {
        lookupInvoice: {
          execute: lookupInvoice,
        },
      } satisfies PiAiToolset<string, DemoMetadata>;

      return {
        toolset: {},
        state: {
          toolset,
        },
        async run(_input: string, runtime: PiAiRuntime<typeof toolset>) {
          await runtime.tools.lookupInvoice({
            invoiceId: "inv_123",
          });

          return {
            decision: {
              status: "approved",
            },
          };
        },
      };
    },
  });

  const result = await harness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(lookupInvoice).toHaveBeenCalledTimes(1);
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

test("supports normalize.output as a low-level escape hatch", async () => {
  const normalizedHarness = piAiHarness({
    prompt: judgePrompt,
    createAgent: () => ({ id: "refund-agent" }),
    run: async () => ({
      customDecision: {
        status: "approved",
      },
    }),
    normalize: {
      output: ({ result }) =>
        (result as { customDecision: { status: string } }).customDecision,
    },
  });

  const result = await normalizedHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(result.output).toEqual({
    status: "approved",
  });
  expect(result.session.messages).toContainEqual({
    role: "assistant",
    content: {
      status: "approved",
    },
  });
});

test("applies normalize overrides to HarnessRun-shaped results", async () => {
  const normalizedHarness = piAiHarness({
    prompt: judgePrompt,
    createAgent: () => ({ id: "refund-agent" }),
    run: async () => ({
      session: {
        messages: [
          {
            role: "assistant" as const,
            content: {
              status: "denied",
            },
          },
        ],
      },
      output: {
        status: "denied",
      },
      usage: {
        totalTokens: 7,
      },
      errors: [],
    }),
    normalize: {
      output: () => ({
        status: "approved",
      }),
      session: () => ({
        messages: [
          {
            role: "assistant",
            content: {
              status: "approved",
            },
          },
        ],
      }),
    },
  });

  const result = await normalizedHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(result.output).toEqual({
    status: "approved",
  });
  expect(result.session.messages).toEqual([
    {
      role: "assistant",
      content: {
        status: "approved",
      },
    },
  ]);
  expect(result.usage.totalTokens).toBe(7);
});

test("attaches a partial run when the harness errors", async () => {
  const erroringHarness = piAiHarness({
    prompt: judgePrompt,
    createAgent: () => ({ id: "refund-agent" }),
    tools: {
      lookupInvoice: {
        execute: async ({ invoiceId }: { invoiceId: string }) => {
          throw new Error(`Invoice ${invoiceId} not found`);
        },
      },
    } satisfies PiAiToolset<string, DemoMetadata>,
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
      metadata: {},
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

test("replays native agent tools without breaking the agent-facing result", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-pi-native-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const execute = vi.fn(
    async (_toolCallId: string, args: { invoiceId: string }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            invoiceId: args.invoiceId,
            refundable: true,
          }),
        },
      ],
      details: {
        invoiceId: args.invoiceId,
        refundable: true,
      },
    }),
  );

  const replayHarness = piAiHarness({
    prompt: judgePrompt,
    toolReplay: {
      lookupInvoice: true,
    },
    createAgent: () => {
      const nativeTools = [
        {
          name: "lookupInvoice",
          execute,
        },
      ];

      return {
        agent: {
          state: {
            tools: nativeTools,
          },
        },
        async run(_input: string, runtime: { events: DemoRuntime["events"] }) {
          const toolResult = await nativeTools[0].execute("lookupInvoice", {
            invoiceId: "inv_123",
          });

          runtime.events.assistant(toolResult.content[0].text);

          return {
            decision: toolResult.details.refundable
              ? { status: "approved" as const }
              : { status: "denied" as const, reason: "not refundable" },
          };
        },
      };
    },
  });

  const firstRun = await replayHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(execute).toHaveBeenCalledTimes(1);
  expect(firstRun.output).toEqual({
    status: "approved",
  });
  const [firstCall] = toolCalls(firstRun.session);
  expect(firstCall).toMatchObject({
    name: "lookupInvoice",
    result: {
      invoiceId: "inv_123",
      refundable: true,
    },
    metadata: {
      replay: {
        status: "recorded",
      },
    },
  });
  const recordingPath = (
    firstCall.metadata?.replay as { recordingPath: string }
  ).recordingPath;
  const recording = JSON.parse(
    readFileSync(join(process.cwd(), recordingPath), "utf8"),
  ) as {
    output: {
      __vitestEvals: { kind: string; version: number };
      agentResult: {
        content: Array<{ text: string; type: string }>;
        details: { invoiceId: string; refundable: boolean };
      };
      normalizedResult: { invoiceId: string; refundable: boolean };
    };
  };
  expect(recording.output).toEqual({
    __vitestEvals: {
      kind: "pi-ai-native-tool-result",
      version: 2,
    },
    agentResult: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            invoiceId: "inv_123",
            refundable: true,
          }),
        },
      ],
      details: {
        invoiceId: "inv_123",
        refundable: true,
      },
    },
    normalizedResult: {
      invoiceId: "inv_123",
      refundable: true,
    },
  });
  expect(toolCalls(firstRun.session)).toMatchObject([
    {
      name: "lookupInvoice",
      result: {
        invoiceId: "inv_123",
        refundable: true,
      },
      metadata: {
        replay: {
          status: "recorded",
        },
      },
    },
  ]);

  const secondRun = await replayHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(execute).toHaveBeenCalledTimes(1);
  expect(secondRun.output).toEqual({
    status: "approved",
  });
  expect(toolCalls(secondRun.session)).toMatchObject([
    {
      name: "lookupInvoice",
      result: {
        invoiceId: "inv_123",
        refundable: true,
      },
      metadata: {
        replay: {
          status: "replayed",
        },
      },
    },
  ]);
});

test("does not opt native agent tools into replay from tool objects", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-pi-native-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const execute = vi.fn(
    async (_toolCallId: string, args: { invoiceId: string }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            invoiceId: args.invoiceId,
            refundable: true,
          }),
        },
      ],
      details: {
        invoiceId: args.invoiceId,
        refundable: true,
      },
    }),
  );

  const harness = piAiHarness({
    prompt: judgePrompt,
    createAgent: () => {
      const nativeTools = [
        {
          name: "lookupInvoice",
          replay: true,
          execute,
        },
      ];

      return {
        agent: {
          state: {
            tools: nativeTools,
          },
        },
        async run(_input: string, runtime: { events: DemoRuntime["events"] }) {
          const toolResult = await nativeTools[0].execute("lookupInvoice", {
            invoiceId: "inv_123",
          });

          runtime.events.assistant(toolResult.content[0].text);

          return {
            decision: {
              status: "approved" as const,
            },
          };
        },
      };
    },
  });

  const run = await harness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(execute).toHaveBeenCalledTimes(1);
  expect(toolCalls(run.session)[0].metadata?.replay).toBeUndefined();
});

test("passes run input and context to createAgent before native tool instrumentation", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-pi-native-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const createContextualAgent = vi.fn(
    ({
      input,
      context,
    }: {
      input: string;
      context: HarnessContext<DemoMetadata>;
    }) => {
      context.setArtifact("preparedInput", input);
      const scenario = context.metadata.scenario ?? "unknown";
      const nativeTools = [
        {
          name: "lookupInvoice",
          execute: vi.fn(
            async (_toolCallId: string, args: { invoiceId: string }) => ({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    invoiceId: args.invoiceId,
                    scenario,
                  }),
                },
              ],
              details: {
                invoiceId: args.invoiceId,
                preparedInput: input,
                scenario,
              },
            }),
          ),
        },
      ];

      return {
        agent: {
          state: {
            tools: nativeTools,
          },
        },
        async run(_input: string, runtime: { events: DemoRuntime["events"] }) {
          const toolResult = await nativeTools[0].execute("call_lookup", {
            invoiceId: "inv_123",
          });

          runtime.events.assistant(toolResult.content[0].text);

          return {
            decision: toolResult.details,
          };
        },
      };
    },
  );
  const harness = piAiHarness({
    prompt: judgePrompt,
    createAgent: createContextualAgent,
    toolReplay: {
      lookupInvoice: true,
    },
  });
  const artifacts: Record<string, JsonValue> = {};
  const context: HarnessContext<DemoMetadata> = {
    metadata: {
      scenario: "refund",
    },
    task: {
      meta: {},
    },
    artifacts,
    setArtifact: vi.fn((name: string, value: JsonValue) => {
      artifacts[name] = value;
    }),
  };

  const result = await harness.run("Refund invoice inv_123", context);

  expect(createContextualAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_123",
      context: expect.objectContaining({
        metadata: {
          scenario: "refund",
        },
      }),
    }),
  );
  expect(result.artifacts).toEqual({
    preparedInput: "Refund invoice inv_123",
  });
  expect(result.output).toEqual({
    invoiceId: "inv_123",
    preparedInput: "Refund invoice inv_123",
    scenario: "refund",
  });
  expect(toolCalls(result.session)).toMatchObject([
    {
      name: "lookupInvoice",
      result: {
        invoiceId: "inv_123",
        preparedInput: "Refund invoice inv_123",
        scenario: "refund",
      },
      metadata: {
        replay: {
          status: "recorded",
        },
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
    prompt: judgePrompt,
    toolReplay: {
      lookupInvoice: true,
    },
    createAgent: () => ({ id: "refund-agent" }),
    tools: {
      lookupInvoice: {
        execute,
      },
    } satisfies PiAiToolset<string, DemoMetadata>,
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
    metadata: {},
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
    metadata: {},
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

test("does not opt runtime tools into replay from tool definitions", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-pi-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const execute = vi.fn(async ({ invoiceId }: { invoiceId: string }) => ({
    invoiceId,
    refundable: true,
  }));

  const harness = piAiHarness<{ id: string }, string, DemoMetadata>({
    prompt: judgePrompt,
    createAgent: () => ({ id: "refund-agent" }),
    tools: {
      lookupInvoice: {
        replay: true,
        execute,
      },
    } as unknown as PiAiToolset<string, DemoMetadata>,
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

  const run = await harness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(execute).toHaveBeenCalledTimes(1);
  expect(toolCalls(run.session)[0].metadata?.replay).toBeUndefined();
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
    prompt: judgePrompt,
    toolReplay: {
      lookupInvoice: true,
    },
    createAgent: () => ({ id: "refund-agent" }),
    tools: {
      lookupInvoice: {
        execute,
      },
    } satisfies PiAiToolset<string, DemoMetadata>,
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
      metadata: {},
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
