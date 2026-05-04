import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Agent, tool } from "@openai/agents";
import { afterEach, expect, test, vi } from "vitest";
import { describeEval, getHarnessRunFromError, toolCalls } from "vitest-evals";
import type { HarnessContext, JsonValue } from "vitest-evals/harness";
import { openaiAgentsHarness, type OpenAiAgentsTool } from "./index";

type DemoMetadata = {
  scenario?: string;
};

type DemoAgent = {
  name: string;
  model: string;
  tools?: OpenAiAgentsTool<string, DemoMetadata>[];
};

let replayDir: string | undefined;

const judgePrompt = async (input: string) => input;

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
  const context = {
    metadata,
    task: {
      meta: {},
    },
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

describeEval(
  "openai agents harness adapter",
  {
    harness: openaiAgentsHarness({
      prompt: judgePrompt,
      agent: {
        name: "classifier",
        model: "gpt-4.1-mini",
      },
      runner: {
        run: vi.fn(async (_agent: DemoAgent, _input: string, options) => {
          expect(options?.context).toMatchObject({
            metadata: {
              scenario: "peated",
            },
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
      const result = await run("Classify bottle bt_123", {
        metadata: {
          scenario: "peated",
        },
      });

      expect(result.output).toEqual({
        status: "classified",
        category: "bourbon",
      });
      expect(result.session.outputText).toBe(
        '{"status":"classified","category":"bourbon"}',
      );
      expect(result.usage).toMatchObject({
        model: "gpt-4.1-mini",
        inputTokens: 13,
        outputTokens: 8,
        totalTokens: 21,
        toolCalls: 1,
      });
      expect(result.session.model).toBe("gpt-4.1-mini");
      expect(result.session.messages).toMatchObject([
        {
          role: "user",
          content: "Classify bottle bt_123",
        },
        {
          role: "assistant",
          content: '{"status":"classified","category":"bourbon"}',
        },
        {
          role: "assistant",
          toolCalls: [
            {
              id: "call_lookup",
              name: "lookupBottle",
              arguments: {
                bottleId: "bt_123",
              },
              result: {
                bottleId: "bt_123",
                family: "bourbon",
              },
            },
          ],
        },
        {
          role: "tool",
          content: {
            bottleId: "bt_123",
            family: "bourbon",
          },
          metadata: {
            name: "lookupBottle",
            toolCallId: "call_lookup",
            isError: false,
          },
        },
      ]);
    });
  },
);

test("exposes prompt and supports custom app output mapping", async () => {
  const prompt = vi.fn(async (input: string) => `judge: ${input}`);
  const harness = openaiAgentsHarness({
    prompt,
    createAgent: () => ({
      name: "classifier",
      model: "gpt-4.1-mini",
    }),
    run: async ({ context, runOptions }) => {
      context.setArtifact("entrypoint", "custom");
      expect(runOptions.context).toMatchObject({
        metadata: {
          scenario: "domain",
        },
      });

      return {
        classification: {
          label: "bourbon",
          confidence: 0.92,
        },
      };
    },
    normalize: {
      output: ({ result }) =>
        (result as { classification: { label: string; confidence: number } })
          .classification,
      outputText: ({ output }) => JSON.stringify(output),
    },
  });

  await expect(harness.prompt("score this")).resolves.toBe("judge: score this");

  const result = await harness.run(
    "Classify bottle bt_123",
    createHarnessContext({
      scenario: "domain",
    }),
  );

  expect(prompt).toHaveBeenCalledWith("score this");
  expect(result.output).toEqual({
    label: "bourbon",
    confidence: 0.92,
  });
  expect(result.session.outputText).toBe(
    '{"label":"bourbon","confidence":0.92}',
  );
  expect(result.artifacts).toEqual({
    entrypoint: "custom",
  });
});

test("passes run input and context to createAgent before tool instrumentation", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-openai-agents-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_MODE", "auto");
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  let createdTool: OpenAiAgentsTool<string, DemoMetadata> | undefined;
  const createAgent = vi.fn(
    ({
      input,
      context,
    }: {
      input: string;
      context: HarnessContext<DemoMetadata>;
    }) => {
      context.setArtifact("preparedInput", input);
      const scenario = context.metadata.scenario ?? "unknown";
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
      } satisfies OpenAiAgentsTool<string, DemoMetadata>;

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
        {
          toolCallId: "call_lookup",
        },
      );

      return {
        finalOutput: evidence,
      };
    }),
  };
  const harness = openaiAgentsHarness({
    prompt: judgePrompt,
    createAgent,
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

  expect(createAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Classify bottle bt_123",
      context: expect.objectContaining({
        metadata: {
          scenario: "peated",
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
    scenario: "peated",
  });
  expect(toolCalls(result.session)).toMatchObject([
    {
      id: "call_lookup",
      name: "lookupBottle",
      result: {
        bottleId: "bt_123",
        preparedInput: "Classify bottle bt_123",
        scenario: "peated",
      },
      metadata: {
        replay: {
          status: "recorded",
        },
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
  } satisfies OpenAiAgentsTool<string, DemoMetadata>;
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
        {
          toolCallId: "call_lookup",
        },
      );

      return {
        finalOutput: {
          label: "bourbon",
          evidence,
        },
      };
    }),
  };
  const harness = openaiAgentsHarness({
    prompt: judgePrompt,
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
      id: "call_lookup",
      name: "lookupBottle",
      arguments: {
        bottleId: "bt_123",
      },
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
      metadata: {
        replay: {
          status: "recorded",
        },
      },
    },
  ]);

  const recordingPath = (
    toolCalls(firstRun.session)[0].metadata?.replay as { recordingPath: string }
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
      id: "call_lookup",
      name: "lookupBottle",
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
      metadata: {
        replay: {
          status: "replayed",
        },
      },
    },
  ]);
});

test("prefers captured local tool results over model-visible output wrappers", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: vi.fn(async () => ({
      bottleId: "bt_123",
      family: "bourbon",
    })),
  } satisfies OpenAiAgentsTool<string, DemoMetadata>;
  const harness = openaiAgentsHarness({
    prompt: judgePrompt,
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
          {
            toolCallId: "call_lookup",
          },
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
      id: "call_lookup",
      name: "lookupBottle",
      result: {
        bottleId: "bt_123",
        family: "bourbon",
      },
    },
  ]);
  expect(result.session.messages).toContainEqual(
    expect.objectContaining({
      role: "tool",
      content: {
        type: "text",
        text: '{"bottleId":"bt_123","family":"bourbon"}',
      },
    }),
  );
});

test("preserves explicit null captured local tool results", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: vi.fn(async () => null),
  } satisfies OpenAiAgentsTool<string, DemoMetadata>;
  const harness = openaiAgentsHarness({
    prompt: judgePrompt,
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
          {
            toolCallId: "call_lookup",
          },
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

  expect(call).toHaveProperty("result", null);
  expect(call.error).toBeUndefined();
});

test("errors when replay is configured for unknown OpenAI Agents tools", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: vi.fn(),
  } satisfies OpenAiAgentsTool<string, DemoMetadata>;
  const runner = {
    run: vi.fn(),
  };
  const harness = openaiAgentsHarness({
    prompt: judgePrompt,
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
  } satisfies OpenAiAgentsTool<string, DemoMetadata>;
  const runner = {
    run: vi.fn(),
  };
  const harness = openaiAgentsHarness({
    prompt: judgePrompt,
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
    prompt: judgePrompt,
    agent,
    runner: {
      run: async (runAgent, _input, runOptions) => {
        expect(runAgent).not.toBe(agent);
        expect(runAgent.tools[0]).not.toBe(originalTool);

        const runtimeTool = runAgent.tools[0] as OpenAiAgentsTool<
          string,
          DemoMetadata
        >;
        const evidence = await runtimeTool.invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: "bt_123",
          }),
          {
            toolCallId: "call_lookup",
          },
        );

        return {
          finalOutput: evidence,
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
      id: "call_lookup",
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

test("rejects implicit agent and runner factories", () => {
  expect(() =>
    openaiAgentsHarness({
      prompt: judgePrompt,
      agent: (() => ({
        name: "classifier",
        model: "gpt-4.1-mini",
      })) as unknown as DemoAgent,
      runner: {
        run: async () => ({}),
      },
    }),
  ).toThrow("Use createAgent() for agent factories");

  expect(() =>
    openaiAgentsHarness({
      prompt: judgePrompt,
      agent: {
        name: "classifier",
        model: "gpt-4.1-mini",
      },
      runner: (() => ({
        run: async () => ({}),
      })) as unknown as { run: () => Promise<unknown> },
    }),
  ).toThrow("Use createRunner() for runner factories");
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
  } satisfies OpenAiAgentsTool<string, DemoMetadata>;
  const originalInvoke = lookupBottle.invoke;
  const agent = {
    name: "classifier",
    model: "gpt-4.1-mini",
    tools: [lookupBottle],
  } satisfies DemoAgent;
  const harness = openaiAgentsHarness({
    prompt: judgePrompt,
    agent,
    runner: {
      run: async (runAgent: DemoAgent, _input: string, runOptions) => {
        const runtimeContext = runOptions?.context as
          | { metadata: DemoMetadata }
          | undefined;
        const scenario = runtimeContext?.metadata.scenario ?? "unknown";
        await new Promise((resolve) => setTimeout(resolve, 1));
        const evidence = await runAgent.tools?.[0].invoke?.(
          runOptions?.context,
          JSON.stringify({
            bottleId: `bt_${scenario}`,
          }),
          {
            toolCallId: `call_${scenario}`,
          },
        );

        return {
          finalOutput: evidence,
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
      id: "call_first",
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
      id: "call_second",
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
    prompt: judgePrompt,
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
    id: "call_patch",
    name: "apply_patch_call",
    error: {
      message: "patch rejected",
    },
    metadata: {
      outputStatus: "failed",
    },
  });
  expect(call.result).toBeUndefined();
});

test("attaches partial tool calls when Runner.run errors", async () => {
  const lookupBottle = {
    type: "function",
    name: "lookupBottle",
    invoke: async () => ({
      bottleId: "bt_missing",
      family: "unknown",
    }),
  } satisfies OpenAiAgentsTool<string, DemoMetadata>;
  const harness = openaiAgentsHarness({
    prompt: judgePrompt,
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
          {
            toolCallId: "call_lookup",
          },
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
      id: "call_lookup",
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
});
