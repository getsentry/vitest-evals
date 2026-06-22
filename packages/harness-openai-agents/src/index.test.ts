import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Agent, tool } from "@openai/agents";
import { afterEach, expect, test, vi } from "vitest";
import {
  describeEval,
  getHarnessRunFromError,
  messagesToTranscriptEvents,
  spansByKind,
  toolCalls,
} from "vitest-evals";
import type {
  Harness,
  HarnessContext,
  JsonValue,
  NormalizedSession,
} from "vitest-evals/harness";
import { openaiAgentsHarness, type OpenAiAgentsTool } from "./index";

type Classification = {
  label: "bourbon" | "scotch";
};
type Equal<TActual, TExpected> = (<T>() => T extends TActual ? 1 : 2) extends <
  T,
>() => T extends TExpected ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;
type HarnessOutput<THarness> = THarness extends Harness<any, infer TOutput>
  ? TOutput
  : never;

function firstAssistantToolCall(session: NormalizedSession) {
  return session.events.find((event) => event.type === "tool_call");
}

function createOpenAiToolCallDetails(callId: string, name = "lookupBottle") {
  return {
    toolCall: {
      type: "function_call",
      callId,
      name,
      arguments: "{}",
    },
  };
}

const typedRunOutputHarness = openaiAgentsHarness({
  agent: {
    name: "classifier",
  },
  run: async (): Promise<{ output: Classification }> => ({
    output: {
      label: "bourbon",
    },
  }),
});
type _OpenAiRunOutput = Expect<
  Equal<HarnessOutput<typeof typedRunOutputHarness>, Classification>
>;

const optionalRunOutputHarness = openaiAgentsHarness({
  agent: {
    name: "classifier",
  },
  run: async (): Promise<{ output?: Classification }> => ({}),
});
type _OpenAiOptionalRunOutput = Expect<
  Equal<
    HarnessOutput<typeof optionalRunOutputHarness>,
    Classification | undefined
  >
>;

const typedRunnerFinalOutputHarness = openaiAgentsHarness({
  agent: {
    name: "classifier",
  },
  runner: {
    run: async (): Promise<{ finalOutput: Classification }> => ({
      finalOutput: {
        label: "bourbon",
      },
    }),
  },
});
type _OpenAiRunnerFinalOutput = Expect<
  Equal<HarnessOutput<typeof typedRunnerFinalOutputHarness>, Classification>
>;

const nonJsonRunnerFinalOutputHarness = openaiAgentsHarness({
  agent: {
    name: "classifier",
  },
  runner: {
    run: async (): Promise<{ finalOutput: Date }> => ({
      finalOutput: new Date("2026-01-01T00:00:00.000Z"),
    }),
  },
});
type _OpenAiNonJsonRunnerFinalOutput = Expect<
  Equal<HarnessOutput<typeof nonJsonRunnerFinalOutputHarness>, undefined>
>;

const runnerOutputItemsHarness = openaiAgentsHarness({
  agent: {
    name: "classifier",
  },
  runner: {
    run: async (): Promise<{ output: JsonValue[] }> => ({
      output: [],
    }),
  },
});
type _OpenAiRunnerOutputItems = Expect<
  Equal<HarnessOutput<typeof runnerOutputItemsHarness>, undefined>
>;

const customRunNativeItemsHarness = openaiAgentsHarness({
  agent: {
    name: "classifier",
  },
  run: async (): Promise<{
    output: JsonValue[];
    newItems: JsonValue[];
    rawResponses: JsonValue[];
  }> => ({
    output: [],
    newItems: [],
    rawResponses: [],
  }),
});
type _OpenAiCustomRunNativeItems = Expect<
  Equal<HarnessOutput<typeof customRunNativeItemsHarness>, undefined>
>;

const customRunOutputWithStateHarness = openaiAgentsHarness({
  agent: {
    name: "classifier",
  },
  run: async (): Promise<{
    output: Classification;
    state: Record<string, JsonValue>;
    history: JsonValue[];
  }> => ({
    output: {
      label: "bourbon",
    },
    state: {
      phase: "done",
    },
    history: [],
  }),
});
type _OpenAiCustomRunOutputWithState = Expect<
  Equal<HarnessOutput<typeof customRunOutputWithStateHarness>, Classification>
>;

const broadDecisionFieldHarness = openaiAgentsHarness({
  agent: {
    name: "classifier",
  },
  run: async () => ({
    decision: {
      label: "bourbon",
    },
  }),
});
type _OpenAiDecisionFieldOutput = Expect<
  Equal<HarnessOutput<typeof broadDecisionFieldHarness>, undefined>
>;

type DemoAgent = {
  name: string;
  model: string;
  tools?: OpenAiAgentsTool<string>[];
};

let replayDir: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (replayDir) {
    rmSync(replayDir, { recursive: true, force: true });
    replayDir = undefined;
  }
});

function createHarnessContext(_metadata?: unknown) {
  const context = {
    artifacts: {} as Record<string, JsonValue>,
    setArtifact: vi.fn((name: string, value: JsonValue) => {
      context.artifacts[name] = value;
    }),
  };

  return context;
}

const runResult = {
  finalOutput: {
    status: "classified",
    category: "bourbon",
  },
  state: {
    usage: {
      requests: 1,
      inputTokens: 13,
      outputTokens: 8,
      totalTokens: 21,
    },
  },
  lastAgent: {
    name: "classifier",
    model: "gpt-4.1-mini",
  },
  rawResponses: [
    {
      id: "resp_123",
    },
  ],
  newItems: [
    {
      type: "message_output_item",
      rawItem: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: '{"status":"classified","category":"bourbon"}',
          },
        ],
        status: "completed",
      },
      agent: {
        name: "classifier",
      },
    },
    {
      type: "tool_call_item",
      rawItem: {
        type: "function_call",
        callId: "call_lookup",
        name: "lookupBottle",
        arguments: JSON.stringify({
          bottleId: "bt_123",
        }),
        status: "completed",
      },
    },
    {
      type: "tool_call_output_item",
      output: {
        bottleId: "bt_123",
        family: "bourbon",
      },
      rawItem: {
        type: "function_call_result",
        callId: "call_lookup",
        name: "lookupBottle",
        output: {
          bottleId: "bt_123",
          family: "bourbon",
        },
        status: "completed",
      },
    },
  ],
} as const;

function createLookupBottleRunItems({
  callId = "call_lookup",
  bottleId,
  output,
}: {
  callId?: string;
  bottleId: string;
  output: JsonValue;
}) {
  return [
    {
      type: "tool_call_item",
      rawItem: {
        type: "function_call",
        callId,
        name: "lookupBottle",
        arguments: JSON.stringify({
          bottleId,
        }),
        status: "completed",
      },
    },
    {
      type: "tool_call_output_item",
      output,
      rawItem: {
        type: "function_call_result",
        callId,
        name: "lookupBottle",
        output,
        status: "completed",
      },
    },
  ];
}

describeEval(
  "openai agents harness adapter",
  {
    harness: openaiAgentsHarness({
      agent: {
        name: "classifier",
        model: "gpt-4.1-mini",
      },
      runner: {
        run: vi.fn(async (_agent: DemoAgent, _input: string, options) => {
          expect(options?.context).toMatchObject({
            artifacts: {},
          });
          expect(options?.stream).toBe(false);
          return {
            ...runResult,
            output: runResult.newItems,
          };
        }),
      },
    }),
  },
  (it) => {
    it("normalizes native run results", async ({ run }) => {
      const result = await run("Classify bottle bt_123");

      expect(result.output).toEqual({
        status: "classified",
        category: "bourbon",
      });
      expect(result.usage).toMatchObject({
        model: "gpt-4.1-mini",
        inputTokens: 13,
        outputTokens: 8,
        totalTokens: 21,
        toolCalls: 1,
      });
      expect(result.session.model).toBe("gpt-4.1-mini");
      expect(result.session.events).toMatchObject([
        {
          type: "message",
          role: "user",
          content: "Classify bottle bt_123",
        },
        {
          type: "message",
          role: "assistant",
          content: '{"status":"classified","category":"bourbon"}',
        },
        {
          type: "tool_call",
          id: "call_lookup",
          name: "lookupBottle",
          arguments: {
            bottleId: "bt_123",
          },
        },
        {
          type: "tool_result",
          toolCallId: "call_lookup",
          name: "lookupBottle",
          content: {
            bottleId: "bt_123",
            family: "bourbon",
          },
          metadata: {
            itemType: "tool_call_output_item",
            rawType: "function_call_result",
            status: "completed",
          },
        },
      ]);
      expect(toolCalls(result.session)).toMatchObject([
        {
          name: "lookupBottle",
          result: {
            bottleId: "bt_123",
            family: "bourbon",
          },
          status: "ok",
        },
      ]);
      expect(spansByKind(result, "run")).toMatchObject([
        {
          name: "openai-agents",
          status: "ok",
          attributes: {
            "gen_ai.operation.name": "invoke_agent",
            "gen_ai.workflow.name": "openai-agents",
            "gen_ai.agent.name": "classifier",
          },
        },
      ]);
      expect(spansByKind(result, "model")).toMatchObject([
        {
          name: "openai response gpt-4.1-mini",
          attributes: {
            "gen_ai.provider.name": "openai",
            "gen_ai.request.model": "gpt-4.1-mini",
            "gen_ai.response.id": "resp_123",
          },
        },
      ]);
      expect(spansByKind(result, "tool")).toEqual([]);
    });
  },
);

test("does not use OpenAI Agents output items as app output", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: vi.fn(async () => ({
        output: runResult.newItems,
        state: runResult.state,
        lastAgent: runResult.lastAgent,
      })),
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "native-items",
    }),
  );

  expect(result.output).toBeUndefined();
  expect(result.session.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: '{"status":"classified","category":"bourbon"}',
      }),
    ]),
  );
});

test("does not use custom run raw OpenAI Agents output items as app output", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    run: vi.fn(async () => ({
      output: runResult.newItems,
      state: runResult.state,
      rawResponses: runResult.rawResponses,
      newItems: runResult.newItems,
      lastAgent: runResult.lastAgent,
    })),
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "native-items",
    }),
  );

  expect(result.output).toBeUndefined();
  expect(result.session.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: '{"status":"classified","category":"bourbon"}',
      }),
    ]),
  );
});

test("uses custom app output with app-level state and history fields", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    run: vi.fn(async () => ({
      output: {
        status: "approved",
      },
      state: {
        phase: "complete",
      },
      history: [
        {
          role: "assistant",
          content: "stale app history",
        },
      ],
    })),
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "app-state",
    }),
  );

  expect(result.output).toEqual({
    status: "approved",
  });
  expect(result.session.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        content: "Classify bottle bt_123",
      }),
      expect.objectContaining({
        role: "assistant",
        content: {
          status: "approved",
        },
      }),
    ]),
  );
  expect(result.session.events).not.toContainEqual(
    expect.objectContaining({
      content: "stale app history",
    }),
  );
});

test("uses OpenAI Agents history when no generated item arrays are available", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: vi.fn(async () => ({
        finalOutput: "classified",
        input: "Classify bottle bt_123",
        newItems: [],
        rawResponses: [],
        history: [
          {
            role: "user",
            content: "Classify bottle bt_123",
          },
          {
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: "classified from history",
              },
            ],
          },
        ],
      })),
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "history",
    }),
  );

  expect(result.output).toBe("classified");
  expect(result.session.events).toMatchObject([
    {
      type: "message",
      role: "user",
      content: "Classify bottle bt_123",
    },
    {
      type: "message",
      role: "assistant",
      content: "classified from history",
    },
  ]);
});

test("uses OpenAI Agents history from SDK getter properties", async () => {
  class GetterRunResult {
    finalOutput = "classified";

    get input() {
      return "Classify bottle bt_123";
    }

    get newItems() {
      return [];
    }

    get rawResponses() {
      return [];
    }

    get history() {
      return [
        {
          role: "user",
          content: "Classify bottle bt_123",
        },
        {
          role: "assistant",
          content: "classified from getter history",
        },
      ];
    }
  }

  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: vi.fn(async () => new GetterRunResult()),
    },
  });

  const result = await harness.run(
    "Fallback input",
    createHarnessContext({
      scenario: "history-getters",
    }),
  );

  expect(result.session.events).toMatchObject([
    {
      type: "message",
      role: "user",
      content: "Classify bottle bt_123",
    },
    {
      type: "message",
      role: "assistant",
      content: "classified from getter history",
    },
  ]);
});

test("preserves tool items from OpenAI Agents history", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: vi.fn(async () => ({
        finalOutput: "classified",
        input: "Classify bottle bt_123",
        newItems: [],
        rawResponses: [],
        history: [
          {
            role: "user",
            content: "Classify bottle bt_123",
          },
          {
            type: "function_call",
            callId: "call_lookup",
            name: "lookupBottle",
            arguments: JSON.stringify({
              bottleId: "bt_123",
            }),
            status: "completed",
          },
          {
            type: "function_call_result",
            callId: "call_lookup",
            name: "lookupBottle",
            output: {
              bottleId: "bt_123",
              family: "bourbon",
            },
            status: "completed",
          },
        ],
      })),
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "history-tools",
    }),
  );

  expect(toolCalls(result.session)).toMatchObject([
    {
      name: "lookupBottle",
      arguments: {
        bottleId: "bt_123",
      },
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
      status: "ok",
    },
  ]);
  expect(result.usage.toolCalls).toBe(1);
});

test("ignores app-owned history without OpenAI Agents input", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: vi.fn(async () => ({
        finalOutput: "classified",
        newItems: [],
        rawResponses: [],
        history: [
          {
            role: "assistant",
            content: "stale app history",
          },
        ],
      })),
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "app-history",
    }),
  );

  expect(result.session.events).toEqual([
    {
      type: "message",
      role: "user",
      content: "Classify bottle bt_123",
    },
    {
      type: "message",
      role: "assistant",
      content: "classified",
    },
  ]);
});

test("does not mix OpenAI Agents history with runtime tool capture", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: async () => ({
      bottleId: "bt_123",
      family: "bourbon",
    }),
  } satisfies OpenAiAgentsTool<string>;
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [lookupBottle],
    } satisfies DemoAgent,
    runner: {
      run: vi.fn(async (agent: DemoAgent, _input: string, runOptions) => {
        await agent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_123",
          }),
          createOpenAiToolCallDetails("call_lookup"),
        );

        return {
          finalOutput: "classified",
          input: "Classify bottle bt_123",
          newItems: [],
          rawResponses: [],
          history: [
            {
              role: "user",
              content: "Classify bottle bt_123",
            },
            {
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "classified from history",
                },
              ],
            },
          ],
        };
      }),
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "history",
    }),
  );

  expect(result.session.events).toMatchObject([
    {
      type: "message",
      role: "user",
      content: "Classify bottle bt_123",
    },
    {
      type: "message",
      role: "assistant",
      content: "classified from history",
    },
  ]);
  expect(toolCalls(result.session)).toEqual([]);
  expect(result.usage.toolCalls).toBeUndefined();
});

test("does not fall back from non-JSON final output to output", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    run: vi.fn(async () => ({
      finalOutput: [1, new Date("2026-01-01T00:00:00.000Z")],
      output: {
        status: "approved",
      },
    })),
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "invalid-final-output",
    }),
  );

  expect(result.output).toBeUndefined();
});

test("does not coerce non-JSON OpenAI Agents final output", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: vi.fn(async () => ({
        finalOutput: new Date("2026-01-01T00:00:00.000Z"),
      })),
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "native-final-output",
    }),
  );

  expect(result.output).toBeUndefined();
});

test("supports custom app output mapping", async () => {
  const harness = openaiAgentsHarness({
    agent: () => ({
      name: "classifier",
      model: "gpt-4.1-mini",
    }),
    run: async ({ context, runOptions }) => {
      context.setArtifact("entrypoint", "custom");
      expect(runOptions.context).toMatchObject({
        artifacts: {
          entrypoint: "custom",
        },
      });

      return {
        classification: {
          label: "bourbon",
          confidence: 0.92,
        },
      };
    },
    output: ({ result }) =>
      (result as { classification: { label: string; confidence: number } })
        .classification,
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "domain",
    }),
  );

  expect(result.output).toEqual({
    label: "bourbon",
    confidence: 0.92,
  });
  expect(result.session.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: {
          label: "bourbon",
          confidence: 0.92,
        },
      }),
    ]),
  );
  expect(result.artifacts).toEqual({
    entrypoint: "custom",
  });
});

test("passes run input and context to agent factory before tool instrumentation", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-openai-agents-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  let createdTool: OpenAiAgentsTool<string> | undefined;
  const agentFactory = vi.fn(
    ({
      input,
      context,
    }: {
      input: string;
      context: HarnessContext;
    }) => {
      context.setArtifact("preparedInput", input);
      const scenario = "refund";
      const lookupBottle = {
        type: "function",
        name: "lookupBottle",
        invoke: vi.fn(async (_runContext: unknown, rawInput: unknown) => {
          if (typeof rawInput !== "string") {
            throw new Error("Expected JSON tool input");
          }

          const parsed = JSON.parse(rawInput) as { bottleId: string };
          return {
            bottleId: parsed.bottleId,
            preparedInput: input,
            scenario,
          };
        }),
      } satisfies OpenAiAgentsTool<string>;

      createdTool = lookupBottle;
      return {
        name: "classifier",
        model: "gpt-4.1-mini",
        tools: [lookupBottle],
      } satisfies DemoAgent;
    },
  );
  const runner = {
    run: vi.fn(async (runAgent: DemoAgent, _input: string, runOptions) => {
      expect(runAgent.tools?.[0]).not.toBe(createdTool);

      const evidence = await runAgent.tools?.[0].invoke?.(
        runOptions?.context,
        JSON.stringify({
          bottleId: "bt_123",
        }),
        createOpenAiToolCallDetails("call_lookup"),
      );

      return {
        finalOutput: evidence,
        newItems: createLookupBottleRunItems({
          bottleId: "bt_123",
          output: evidence as JsonValue,
        }),
      };
    }),
  };
  const harness = openaiAgentsHarness({
    agent: agentFactory,
    runner,
    toolReplay: {
      lookupBottle: true,
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "peated",
    }),
  );

  expect(agentFactory).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Classify bottle bt_123",
      context: expect.objectContaining({
        artifacts: {
          preparedInput: "Classify bottle bt_123",
        },
      }),
    }),
  );
  expect(result.artifacts).toEqual({
    preparedInput: "Classify bottle bt_123",
  });
  expect(result.output).toEqual({
    bottleId: "bt_123",
    preparedInput: "Classify bottle bt_123",
    scenario: "refund",
  });
  expect(toolCalls(result.session)).toMatchObject([
    {
      name: "lookupBottle",
      result: {
        bottleId: "bt_123",
        preparedInput: "Classify bottle bt_123",
        scenario: "refund",
      },
    },
  ]);
  expect(spansByKind(result, "tool")).toEqual([]);
});

test("uses runtime tool capture when custom runs return no provider items", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: async () => ({
      bottleId: "bt_123",
      family: "bourbon",
    }),
  } satisfies OpenAiAgentsTool<string>;
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [lookupBottle],
    } satisfies DemoAgent,
    runner: {
      run: async (agent: DemoAgent, _input: string, runOptions) => {
        await agent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_123",
          }),
          createOpenAiToolCallDetails("call_lookup"),
        );

        return {
          finalOutput: {
            status: "classified",
          },
        };
      },
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );

  expect(result.usage.toolCalls).toBe(1);
  expect(toolCalls(result.session)).toMatchObject([
    {
      name: "lookupBottle",
      status: "ok",
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
    },
  ]);
});

test("attaches a failed run when agent setup fails", async () => {
  const setupHarness = openaiAgentsHarness({
    agent: async ({ context }) => {
      context.setArtifact("setup", "failed");
      throw new Error("agent setup failed");
    },
    run: async () => ({
      output: {
        label: "bourbon",
      },
    }),
  });
  const context = createHarnessContext({});

  const error = await setupHarness
    .run("Classify bottle bt_123", context)
    .catch((caughtError) => caughtError);
  const run = getHarnessRunFromError(error);

  expect(run?.artifacts).toEqual({
    setup: "failed",
  });
  expect(run?.errors).toEqual([
    {
      type: "Error",
      message: "agent setup failed",
    },
  ]);
  expect(run?.traces?.[0]?.metadata).toEqual({
    source: "harness-openai-agents",
  });
  expect(spansByKind(run!, "run")).toMatchObject([
    {
      status: "error",
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
      },
      error: {
        message: "agent setup failed",
      },
    },
  ]);
});

test("wraps OpenAI Agents function tools with replay metadata", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-openai-agents-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const invoke = vi.fn(async (...args: unknown[]) => {
    const rawInput = args[1];
    if (typeof rawInput !== "string") {
      throw new Error("Expected JSON tool input");
    }

    const input = JSON.parse(rawInput) as { bottleId: string };
    return {
      bottleId: input.bottleId,
      family: "bourbon",
    };
  });
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke,
  } satisfies OpenAiAgentsTool<string>;
  const originalInvoke = lookupBottle.invoke;
  const agent = {
    name: "classifier",
    model: "gpt-4.1-mini",
    tools: [lookupBottle],
  } satisfies DemoAgent;
  const runner = {
    run: vi.fn(async (runAgent: DemoAgent, _input: string, runOptions) => {
      expect(runAgent).not.toBe(agent);
      expect(runAgent.tools).not.toBe(agent.tools);
      expect(runAgent.tools?.[0]).not.toBe(lookupBottle);
      const evidence = await runAgent.tools?.[0].invoke?.(
        runOptions?.context,
        JSON.stringify({
          bottleId: "bt_123",
        }),
        createOpenAiToolCallDetails("call_lookup"),
      );

      return {
        finalOutput: {
          label: "bourbon",
          evidence,
        },
        newItems: createLookupBottleRunItems({
          bottleId: "bt_123",
          output: evidence as JsonValue,
        }),
      };
    }),
  };
  const harness = openaiAgentsHarness({
    agent,
    runner,
    toolReplay: {
      lookupBottle: true,
    },
  });

  const firstRun = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(agent.tools?.[0]).toBe(lookupBottle);
  expect(agent.tools?.[0].invoke).toBe(originalInvoke);
  expect(toolCalls(firstRun.session)).toMatchObject([
    {
      name: "lookupBottle",
      arguments: {
        bottleId: "bt_123",
      },
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
    },
  ]);
  const firstCall = firstAssistantToolCall(firstRun.session);
  expect(firstCall?.metadata?.replay).toMatchObject({
    status: "recorded",
  });

  const recordingPath = (
    firstCall?.metadata?.replay as { recordingPath: string }
  ).recordingPath;
  const recording = JSON.parse(
    readFileSync(join(process.cwd(), recordingPath), "utf8"),
  ) as {
    input: { bottleId: string };
    output: { bottleId: string; family: string };
  };
  expect(recording.input).toEqual({
    bottleId: "bt_123",
  });
  expect(recording.output).toEqual({
    bottleId: "bt_123",
    family: "bourbon",
  });

  invoke.mockImplementation(async () => {
    throw new Error("tool should not execute after recording exists");
  });

  const secondRun = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(agent.tools?.[0]).toBe(lookupBottle);
  expect(agent.tools?.[0].invoke).toBe(originalInvoke);
  expect(toolCalls(secondRun.session)).toMatchObject([
    {
      name: "lookupBottle",
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
    },
  ]);
  const secondCall = firstAssistantToolCall(secondRun.session);
  expect(secondCall?.metadata?.replay).toMatchObject({
    status: "replayed",
  });
});

test("prefers captured local tool results over model-visible output wrappers", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: vi.fn(async () => ({
      bottleId: "bt_123",
      family: "bourbon",
    })),
  } satisfies OpenAiAgentsTool<string>;
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [lookupBottle],
    } satisfies DemoAgent,
    runner: {
      run: async (agent: DemoAgent, _input: string, runOptions) => {
        const evidence = await agent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_123",
          }),
          createOpenAiToolCallDetails("call_lookup"),
        );

        return {
          finalOutput: "classified",
          newItems: [
            {
              type: "tool_call_item",
              rawItem: {
                type: "function_call",
                callId: "call_lookup",
                name: "lookupBottle",
                arguments: JSON.stringify({
                  bottleId: "bt_123",
                }),
                status: "completed",
              },
            },
            {
              type: "tool_call_output_item",
              rawItem: {
                type: "function_call_result",
                callId: "call_lookup",
                name: "lookupBottle",
                status: "completed",
                output: {
                  type: "text",
                  text: JSON.stringify(evidence),
                },
              },
            },
          ],
        };
      },
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );

  expect(toolCalls(result.session)).toMatchObject([
    {
      name: "lookupBottle",
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
    },
  ]);
  expect(result.session.events).toContainEqual(
    expect.objectContaining({
      type: "tool_result",
      content: {
        bottleId: "bt_123",
        family: "bourbon",
      },
    }),
  );
});

test("uses run item envelope ids to join captured tool results", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: vi.fn(async () => ({
      bottleId: "bt_123",
      family: "bourbon",
    })),
  } satisfies OpenAiAgentsTool<string>;
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [lookupBottle],
    } satisfies DemoAgent,
    runner: {
      run: async (agent: DemoAgent, _input: string, runOptions) => {
        const evidence = await agent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_123",
          }),
          createOpenAiToolCallDetails("call_lookup"),
        );

        return {
          finalOutput: "classified",
          newItems: [
            {
              type: "tool_call_item",
              callId: "call_lookup",
              rawItem: {
                type: "function_call",
                name: "lookupBottle",
                arguments: JSON.stringify({
                  bottleId: "bt_123",
                }),
                status: "completed",
              },
            },
            {
              type: "tool_call_output_item",
              callId: "call_lookup",
              rawItem: {
                type: "function_call_result",
                name: "lookupBottle",
                status: "completed",
                output: {
                  type: "text",
                  text: JSON.stringify(evidence),
                },
              },
            },
          ],
        };
      },
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );

  expect(firstAssistantToolCall(result.session)).toMatchObject({
    id: "call_lookup",
    name: "lookupBottle",
  });
  expect(toolCalls(result.session)).toMatchObject([
    {
      name: "lookupBottle",
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
      status: "ok",
    },
  ]);
});

test("merges runtime timing for tool output items with tool message roles", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: vi.fn(async () => ({
      bottleId: "bt_123",
      family: "bourbon",
    })),
  } satisfies OpenAiAgentsTool<string>;
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [lookupBottle],
    },
    runner: {
      run: async (agent: DemoAgent, _input: string, runOptions) => {
        const evidence = await agent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_123",
          }),
          createOpenAiToolCallDetails("call_lookup"),
        );

        return {
          finalOutput: "classified",
          newItems: [
            {
              type: "tool_call_item",
              rawItem: {
                type: "function_call",
                callId: "call_lookup",
                name: "lookupBottle",
                arguments: JSON.stringify({
                  bottleId: "bt_123",
                }),
                status: "completed",
              },
            },
            {
              type: "tool_call_output_item",
              rawItem: {
                type: "function_call_result",
                role: "tool",
                callId: "call_lookup",
                name: "lookupBottle",
                status: "completed",
                output: evidence as JsonValue,
              },
            },
          ],
        };
      },
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );
  const toolResult = result.session.events.find(
    (event) => event.type === "tool_result",
  );

  expect(toolResult).toMatchObject({
    type: "tool_result",
    toolCallId: "call_lookup",
    name: "lookupBottle",
    content: {
      bottleId: "bt_123",
      family: "bourbon",
    },
    startedAt: expect.any(String),
    finishedAt: expect.any(String),
    durationMs: expect.any(Number),
  });
});

test("normalizes Responses-style function call output items", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: async () => ({
        finalOutput: "classified",
        newItems: [
          {
            type: "tool_call_item",
            rawItem: {
              type: "function_call",
              call_id: "call_lookup",
              name: "lookupBottle",
              arguments: JSON.stringify({
                bottleId: "bt_123",
              }),
              status: "completed",
            },
          },
          {
            type: "tool_call_output_item",
            rawItem: {
              type: "function_call_output",
              call_id: "call_lookup",
              name: "lookupBottle",
              output: {
                bottleId: "bt_123",
                family: "bourbon",
              },
              status: "completed",
            },
          },
        ],
      }),
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );

  expect(toolCalls(result.session)).toMatchObject([
    {
      name: "lookupBottle",
      arguments: {
        bottleId: "bt_123",
      },
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
      status: "ok",
    },
  ]);
});

test("counts tool calls from the selected OpenAI Agents run item source", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: async () => ({
        finalOutput: "classified",
        newItems: [
          {
            type: "app_event",
            content: "not an SDK run item",
          },
        ],
        output: createLookupBottleRunItems({
          bottleId: "bt_123",
          output: {
            bottleId: "bt_123",
            family: "bourbon",
          },
        }),
        rawResponses: [],
      }),
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );

  expect(result.usage.toolCalls).toBe(1);
  expect(toolCalls(result.session)).toHaveLength(1);
});

test("preserves explicit null captured local tool results", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: vi.fn(async () => null),
  } satisfies OpenAiAgentsTool<string>;
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [lookupBottle],
    } satisfies DemoAgent,
    runner: {
      run: async (agent: DemoAgent, _input: string, runOptions) => {
        await agent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_unknown",
          }),
          createOpenAiToolCallDetails("call_lookup"),
        );

        return {
          finalOutput: "classified",
          newItems: [
            {
              type: "tool_call_item",
              rawItem: {
                type: "function_call",
                callId: "call_lookup",
                name: "lookupBottle",
                arguments: JSON.stringify({
                  bottleId: "bt_unknown",
                }),
                status: "completed",
              },
            },
            {
              type: "tool_call_output_item",
              rawItem: {
                type: "function_call_result",
                callId: "call_lookup",
                name: "lookupBottle",
                status: "completed",
                output: {
                  type: "text",
                  text: "null",
                },
              },
            },
          ],
        };
      },
    },
  });

  const result = await harness.run(
    "Classify bottle bt_unknown",
    createHarnessContext({}),
  );
  const [call] = toolCalls(result.session);

  expect(call).toMatchObject({
    result: null,
    status: "ok",
  });
});

test("errors when replay is configured for unknown OpenAI Agents tools", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: vi.fn(),
  } satisfies OpenAiAgentsTool<string>;
  const runner = {
    run: vi.fn(),
  };
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [lookupBottle],
    },
    runner,
    toolReplay: {
      misspelledLookup: true,
    },
  });

  await expect(
    harness.run("Classify bottle bt_123", createHarnessContext({})),
  ).rejects.toThrow(
    "Tool replay configured for unknown OpenAI Agents tool(s): misspelledLookup.",
  );
  expect(runner.run).not.toHaveBeenCalled();
  expect(lookupBottle.invoke).not.toHaveBeenCalled();
});

test("errors when replay is configured for OpenAI Agents tools without invoke", async () => {
  const hostedTool = {
    type: "web_search_preview",
    name: "web_search_preview",
  } satisfies OpenAiAgentsTool<string>;
  const runner = {
    run: vi.fn(),
  };
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [hostedTool],
    },
    runner,
    toolReplay: {
      web_search_preview: true,
    },
  });

  await expect(
    harness.run("Search for bottle facts", createHarnessContext({})),
  ).rejects.toThrow(
    "Tool replay requires invoke() for web_search_preview. Hosted or provider-executed OpenAI Agents tools cannot be recorded automatically.",
  );
  expect(runner.run).not.toHaveBeenCalled();
});

test("instruments real OpenAI Agent tools without mutating the caller's agent", async () => {
  const lookupBottle = tool({
    name: "lookupBottle",
    description: "Look up bottle facts.",
    parameters: {
      type: "object",
      properties: {
        bottleId: {
          type: "string",
        },
      },
      required: ["bottleId"],
      additionalProperties: false,
    } as const,
    execute: async (input: unknown) => {
      const { bottleId } = input as { bottleId: string };

      return {
        bottleId,
        family: "bourbon",
      };
    },
  });
  const agent = new Agent({
    name: "classifier",
    model: "gpt-4.1-mini",
    tools: [lookupBottle],
  });
  const originalTool = agent.tools[0];
  const harness = openaiAgentsHarness({
    agent,
    runner: {
      run: async (runAgent, _input, runOptions) => {
        expect(runAgent).not.toBe(agent);
        expect(runAgent.tools[0]).not.toBe(originalTool);

        const runtimeTool = runAgent.tools[0] as OpenAiAgentsTool<string>;
        const evidence = await runtimeTool.invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_123",
          }),
          createOpenAiToolCallDetails("call_lookup"),
        );

        return {
          finalOutput: evidence,
          newItems: createLookupBottleRunItems({
            bottleId: "bt_123",
            output: evidence as JsonValue,
          }),
        };
      },
    },
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({}),
  );

  expect(agent.tools[0]).toBe(originalTool);
  expect(toolCalls(result.session)).toMatchObject([
    {
      name: "lookupBottle",
      arguments: {
        bottleId: "bt_123",
      },
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
    },
  ]);
});

test("accepts agent and runner as factories", async () => {
  const agent = vi.fn(
    ({
      input,
      context,
    }: {
      input: string;
      context: HarnessContext;
    }) => {
      context.setArtifact("preparedInput", input);
      return {
        name: "classifier",
        model: "gpt-4.1-mini",
      };
    },
  );
  const runnerRun = vi.fn(
    async (_agent: DemoAgent, _input: string, runOptions) => {
      expect(runOptions?.context).toMatchObject({
        artifacts: {
          preparedInput: "Classify bottle bt_123",
        },
      });
      return runResult;
    },
  );
  const runner = vi.fn(() => ({
    run: runnerRun,
  }));
  const harness = openaiAgentsHarness({
    agent,
    runner,
  });

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "peated",
    }),
  );

  expect(agent).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Classify bottle bt_123",
    }),
  );
  expect(runner).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Classify bottle bt_123",
      runOptions: expect.objectContaining({
        stream: false,
      }),
    }),
  );
  expect(runnerRun).toHaveBeenCalledTimes(1);
  expect(result.output).toEqual({
    status: "classified",
    category: "bourbon",
  });
  expect(result.artifacts).toEqual({
    preparedInput: "Classify bottle bt_123",
  });
});

test("keeps tool capture isolated across overlapping runs", async () => {
  const invoke = vi.fn(async (_runContext: unknown, rawInput: unknown) => {
    if (typeof rawInput !== "string") {
      throw new Error("Expected JSON tool input");
    }

    const input = JSON.parse(rawInput) as { bottleId: string };
    return {
      bottleId: input.bottleId,
    };
  });
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke,
  } satisfies OpenAiAgentsTool<string>;
  const originalInvoke = lookupBottle.invoke;
  const agent = {
    name: "classifier",
    model: "gpt-4.1-mini",
    tools: [lookupBottle],
  } satisfies DemoAgent;
  const harness = openaiAgentsHarness({
    agent,
    runner: {
      run: async (runAgent: DemoAgent, input: string, runOptions) => {
        const scenario = input.includes("first") ? "first" : "second";
        await new Promise((resolve) => setTimeout(resolve, 1));
        const evidence = await runAgent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: `bt_${scenario}`,
          }),
          createOpenAiToolCallDetails(`call_${scenario}`),
        );

        return {
          finalOutput: evidence,
          newItems: createLookupBottleRunItems({
            callId: `call_${scenario}`,
            bottleId: `bt_${scenario}`,
            output: evidence as JsonValue,
          }),
        };
      },
    },
  });

  const [firstRun, secondRun] = await Promise.all([
    harness.run(
      "Classify first bottle",
      createHarnessContext({ scenario: "first" }),
    ),
    harness.run(
      "Classify second bottle",
      createHarnessContext({ scenario: "second" }),
    ),
  ]);

  expect(agent.tools?.[0]).toBe(lookupBottle);
  expect(agent.tools?.[0].invoke).toBe(originalInvoke);
  expect(toolCalls(firstRun.session)).toMatchObject([
    {
      arguments: {
        bottleId: "bt_first",
      },
      result: {
        bottleId: "bt_first",
      },
    },
  ]);
  expect(toolCalls(secondRun.session)).toMatchObject([
    {
      arguments: {
        bottleId: "bt_second",
      },
      result: {
        bottleId: "bt_second",
      },
    },
  ]);
});

test("marks failed tool output items as tool call errors", async () => {
  const harness = openaiAgentsHarness({
    agent: {
      name: "editor",
      model: "gpt-4.1-mini",
    },
    runner: {
      run: async () => ({
        finalOutput: "patch failed",
        newItems: [
          {
            type: "tool_call_item",
            rawItem: {
              type: "apply_patch_call",
              callId: "call_patch",
              status: "completed",
              operation: {
                type: "update_file",
                path: "README.md",
                diff: "...",
              },
            },
          },
          {
            type: "tool_call_output_item",
            output: "patch rejected",
            rawItem: {
              type: "apply_patch_call_output",
              callId: "call_patch",
              status: "failed",
              output: "patch rejected",
            },
          },
        ],
      }),
    },
  });

  const result = await harness.run("Patch README", createHarnessContext({}));
  const [call] = toolCalls(result.session);

  expect(call).toMatchObject({
    name: "apply_patch_call",
    status: "error",
    error: {
      message: "patch rejected",
    },
  });
});

test("attaches partial tool calls when Runner.run errors", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: async () => ({
      bottleId: "bt_missing",
      family: "unknown",
    }),
  } satisfies OpenAiAgentsTool<string>;
  const harness = openaiAgentsHarness({
    agent: {
      name: "classifier",
      model: "gpt-4.1-mini",
      tools: [lookupBottle],
    } satisfies DemoAgent,
    runner: {
      run: async (agent: DemoAgent, _input: string, runOptions) => {
        await agent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_missing",
          }),
          createOpenAiToolCallDetails("call_lookup"),
        );

        throw new Error("classifier failed after lookup");
      },
    },
  });

  const error = await harness
    .run("Classify bottle bt_missing", createHarnessContext({}))
    .catch((caughtError) => caughtError);
  const run = getHarnessRunFromError(error);

  expect(run).toBeDefined();
  expect(run?.usage.toolCalls).toBe(1);
  expect(run?.errors).toEqual([
    {
      type: "Error",
      message: "classifier failed after lookup",
    },
  ]);
  expect(toolCalls(run!.session)).toMatchObject([
    {
      name: "lookupBottle",
      arguments: {
        bottleId: "bt_missing",
      },
      result: {
        bottleId: "bt_missing",
        family: "unknown",
      },
    },
  ]);
  expect(spansByKind(run!, "run")).toMatchObject([
    {
      status: "error",
      error: {
        message: "classifier failed after lookup",
      },
    },
  ]);
  expect(spansByKind(run!, "tool")).toEqual([]);
});
