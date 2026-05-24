import {
  createHarness,
  type Harness,
  type HarnessMetadata,
  type JsonValue,
  type SimpleHarnessResult,
  type SimpleToolCallRecord,
} from "vitest-evals/harness";
import type {
  FlueEvent,
  FlueHarness,
  FlueSession,
  PromptResponse,
  PromptResultResponse,
  PromptUsage,
  ToolDef,
  AgentInit,
} from "@flue/runtime";
import {
  createFlueContext,
  InMemorySessionStore,
  bashFactoryToSessionEnv,
  resolveModel,
  type FlueContextConfig,
} from "@flue/runtime/internal";

type MaybePromise<T> = T | Promise<T>;

export interface FlueHarnessOptions<
  TInput = string,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  /** Stable harness name used in reports. */
  name: string;
  /** Flue model string, e.g. `"anthropic/claude-sonnet-4-6"`. */
  model: string;
  /** Sandbox factory. Use `local()` from `@flue/runtime/node` for host access. */
  sandbox?: AgentInit["sandbox"];
  /** Agent-wide tools available to every session call. */
  tools?: ToolDef[];
  /** Reasoning effort level. */
  thinkingLevel?: AgentInit["thinkingLevel"];
  /**
   * Custom run function. Receives the input, a ready-to-use FlueSession,
   * and eval context. Return the PromptResponse or PromptResultResponse.
   *
   * Defaults to `(input, session) => session.prompt(String(input))`.
   */
  run?: (
    input: TInput,
    session: FlueSession,
    context: { metadata: Readonly<TMetadata>; signal?: AbortSignal },
  ) => MaybePromise<PromptResponse | PromptResultResponse<any>>;
  /** Extract the eval output from the Flue response. Defaults to `response.data ?? response.text`. */
  output?: (
    response: PromptResponse | PromptResultResponse<any>,
    input: TInput,
  ) => MaybePromise<TOutput>;
}

export interface CollectedTurn {
  model?: string;
  usage?: PromptUsage;
  durationMs: number;
}

const INTERNAL_TOOLS = new Set(["finish", "give_up"]);

export function createEventCollector() {
  const toolCalls: SimpleToolCallRecord[] = [];
  const turns: CollectedTurn[] = [];
  const pendingArgs = new Map<string, unknown>();

  const handler = (event: FlueEvent): void => {
    if (event.type === "tool_start") {
      pendingArgs.set(event.toolCallId, event.args);
    } else if (
      event.type === "tool_call" &&
      !INTERNAL_TOOLS.has(event.toolName)
    ) {
      const args = pendingArgs.get(event.toolCallId);
      pendingArgs.delete(event.toolCallId);
      const resultText =
        event.result?.content?.[0]?.type === "text"
          ? event.result.content[0].text
          : undefined;
      toolCalls.push({
        name: event.toolName,
        arguments: args,
        result: event.isError ? undefined : resultText,
        error: event.isError ? resultText : undefined,
      });
    } else if (event.type === "turn") {
      turns.push({
        model: event.model,
        usage: event.usage,
        durationMs: event.durationMs,
      });
    }
  };

  return { toolCalls, turns, handler };
}

export function flueHarness<
  TInput = string,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
>(
  options: FlueHarnessOptions<TInput, TOutput, TMetadata>,
): Harness<TInput, TOutput, TMetadata> {
  return createHarness<TInput, TOutput, TMetadata>({
    name: options.name,
    run: async ({ input, metadata, signal }) => {
      const collector = createEventCollector();
      const store = new InMemorySessionStore();
      const runId = crypto.randomUUID();

      const ctxConfig: FlueContextConfig = {
        id: `eval-${runId}`,
        runId,
        payload: input,
        env: process.env as Record<string, any>,
        agentConfig: {
          systemPrompt: "",
          skills: {},
          roles: {},
          model: resolveModel(options.model),
          resolveModel,
        },
        createDefaultEnv: async () => {
          const { Bash } = await import("just-bash");
          return bashFactoryToSessionEnv(() => new Bash());
        },
        defaultStore: store,
      };

      const ctx = createFlueContext(ctxConfig);
      ctx.subscribeEvent(collector.handler);

      const initOptions: AgentInit = {
        model: options.model,
        tools: options.tools,
        thinkingLevel: options.thinkingLevel,
      };
      if (options.sandbox) {
        initOptions.sandbox = options.sandbox;
      }

      const harness: FlueHarness = await ctx.init(initOptions);
      const session = await harness.session();

      const runFn =
        options.run ??
        ((inp: TInput, sess: FlueSession) =>
          sess.prompt(String(inp), { signal }));

      const response = await runFn(input, session, { metadata, signal });

      const usage = aggregateUsage(collector.turns);
      const turnModel = extractModel(collector.turns);
      const [provider] = splitModelId(options.model);
      const model = turnModel ?? splitModelId(options.model)[1];

      const outputValue =
        options.output != null
          ? await options.output(response, input)
          : extractOutput(response);

      return {
        output: outputValue,
        toolCalls: collector.toolCalls,
        usage: {
          provider,
          model,
          inputTokens: usage.input,
          outputTokens: usage.output,
          totalTokens: usage.totalTokens,
        },
        errors: [],
      } as SimpleHarnessResult<TOutput>;
    },
  });
}

export function aggregateUsage(turns: CollectedTurn[]): {
  input: number;
  output: number;
  totalTokens: number;
} {
  let input = 0;
  let output = 0;
  let totalTokens = 0;
  for (const turn of turns) {
    if (turn.usage) {
      input += turn.usage.input;
      output += turn.usage.output;
      totalTokens += turn.usage.totalTokens;
    }
  }
  return { input, output, totalTokens };
}

export function extractModel(turns: CollectedTurn[]): string | undefined {
  for (const turn of turns) {
    if (turn.model) return turn.model;
  }
  return undefined;
}

export function splitModelId(modelId: string): [string, string] {
  const slash = modelId.indexOf("/");
  if (slash === -1) return [modelId, modelId];
  return [modelId.slice(0, slash), modelId.slice(slash + 1)];
}

export function extractOutput(
  response: PromptResponse | PromptResultResponse<any>,
): any {
  if ("data" in response) return response.data;
  if ("text" in response) return response.text;
  return undefined;
}
