import {
  createHarness,
  type Harness,
  type HarnessMetadata,
  type JsonValue,
  type SimpleHarnessResult,
} from "vitest-evals/harness";
import type {
  FlueEventCallback,
  PromptResponse,
  PromptResultResponse,
} from "@flue/runtime";
import {
  aggregateUsage,
  createEventCollector,
  extractModel,
  extractOutput,
  splitModelId,
} from "./internals";

type MaybePromise<T> = T | Promise<T>;

/** Context passed to the run function with eval metadata and event capture. */
export interface FlueRunContext<
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  /** Eval metadata from the test case. */
  metadata: Readonly<TMetadata>;
  /** Abort signal from Vitest. */
  signal?: AbortSignal;
  /**
   * Event handler that captures tool calls and usage. Pass this to
   * `ctx.subscribeEvent(eventHandler)` on your FlueContext so the adapter
   * can observe the run.
   */
  eventHandler: FlueEventCallback;
}

/** Options for creating a Flue framework eval harness. */
export interface FlueHarnessOptions<
  TInput = string,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  /** Stable harness name used in reports. */
  name: string;
  /** Flue model string used for provider/model identification in reports, e.g. `"anthropic/claude-sonnet-4-6"`. */
  model: string;
  /**
   * Run the Flue agent. Create the FlueContext, call `init()`, open a
   * session, and return the response. Wire `context.eventHandler` into
   * the FlueContext via `ctx.subscribeEvent(context.eventHandler)` so the
   * adapter can capture tool calls and usage.
   */
  run: (
    input: TInput,
    context: FlueRunContext<TMetadata>,
  ) => MaybePromise<PromptResponse | PromptResultResponse<any>>;
  /** Extract the eval output from the Flue response. Defaults to `response.data ?? response.text`. */
  output?: (
    response: PromptResponse | PromptResultResponse<any>,
    input: TInput,
  ) => MaybePromise<TOutput>;
}

/**
 * Creates a vitest-evals harness that normalizes a Flue agent run.
 *
 * The user owns the Flue runtime lifecycle. The adapter provides an event
 * handler that captures tool calls and usage, and normalizes the response
 * into a `HarnessRun`.
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

      const response = await options.run(input, {
        metadata,
        signal,
        eventHandler: collector.handler,
      });

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
