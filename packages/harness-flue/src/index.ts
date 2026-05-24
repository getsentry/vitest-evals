import {
  createHarness,
  type Harness,
  type HarnessMetadata,
  type JsonValue,
  type SimpleHarnessResult,
} from "vitest-evals/harness";
import type {
  FlueHarness,
  FlueSession,
  PromptResponse,
  PromptResultResponse,
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
import {
  aggregateUsage,
  createEventCollector,
  extractModel,
  extractOutput,
  splitModelId,
} from "./internals";

type MaybePromise<T> = T | Promise<T>;

/** Options for creating a Flue framework eval harness. */
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

/**
 * Creates a vitest-evals harness that runs a Flue agent session.
 *
 * The adapter owns the Flue runtime lifecycle, captures tool calls and usage
 * from the event stream, and normalizes results into a `HarnessRun`.
 */
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
