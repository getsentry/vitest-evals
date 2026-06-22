import type {
  Harness,
  HarnessContext,
  HarnessRun,
  JsonValue,
  NormalizedError,
  NormalizedSpan,
  NormalizedSession,
  TranscriptToolCallEvent,
  TranscriptToolResultEvent,
  TranscriptEvent,
  NormalizedTrace,
  TimingSummary,
  UsageSummary,
} from "vitest-evals/harness";
import {
  attachHarnessRunToError,
  createFailedHarnessRun,
  createGenAiUsageAttributes,
  ensureRunTrace,
  getHarnessRunFromError,
  hasCallableMethod,
  isHarnessRun,
  isNormalizedSession,
  normalizeContent,
  normalizeMetadata,
  normalizeRecord,
  normalizeSpanAttributes,
  normalizeSpanError,
  resolveHarnessRunErrors,
  serializeError,
  toJsonValue,
} from "vitest-evals/harness";
import {
  executeWithReplay,
  getReplayMetadataFromError,
  normalizeReplayMetadata,
} from "vitest-evals/replay";
import type {
  ReplayMode,
  ToolRecording,
  ToolReplayConfig,
} from "vitest-evals/replay";
import { createJudgeHarness } from "vitest-evals/judges";
import type { JudgeHarnessInput } from "vitest-evals/judges";
import { Agent, Runner } from "@openai/agents";
import type {
  JsonSchemaDefinition,
  Model,
  ModelSettings,
} from "@openai/agents";

type MaybePromise<T> = T | Promise<T>;
type JsonOutput<TValue> = [TValue] extends [JsonValue | undefined]
  ? TValue
  : undefined;
type ResultFieldOutput<
  TResult,
  TKey extends string,
> = TKey extends keyof TResult
  ? Record<string, never> extends Pick<TResult, TKey>
    ? JsonOutput<TResult[TKey]> | undefined
    : JsonOutput<TResult[TKey]>
  : undefined;

let nextTraceId = 0;

type OpenAiAgentsRunResultOutput<TResult> = TResult extends HarnessRun<
  infer TOutput
>
  ? TOutput
  : "finalOutput" extends keyof TResult
    ? ResultFieldOutput<TResult, "finalOutput">
    : TResult extends OpenAiAgentsNativeResultLike
      ? undefined
      : "output" extends keyof TResult
        ? ResultFieldOutput<TResult, "output">
        : undefined;

type OpenAiAgentsNativeResultLike = {
  newItems: unknown;
  rawResponses: unknown;
};

type OpenAiAgentsRunnerResultOutput<TResult> = TResult extends HarnessRun<
  infer TOutput
>
  ? TOutput
  : "finalOutput" extends keyof TResult
    ? ResultFieldOutput<TResult, "finalOutput">
    : undefined;

/** Replay mode alias used by the OpenAI Agents harness package. */
export type OpenAiAgentsReplayMode = ReplayMode;

/** Runtime context object passed through OpenAI Agents run options. */
export interface OpenAiAgentsRuntimeContext {
  artifacts: HarnessContext["artifacts"];
  setArtifact: HarnessContext["setArtifact"];
}

/** Run options forwarded to OpenAI Agents runners. */
export type OpenAiAgentsRunOptions<TContext = unknown> = Record<
  string,
  unknown
> & {
  context?: TContext;
  signal?: AbortSignal;
  stream?: boolean;
};

/** Minimal runner interface used by the OpenAI Agents harness. */
export interface OpenAiAgentsRunner<
  TAgent,
  TInput,
  TContext,
  TResult,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> {
  run: (
    agent: TAgent,
    input: TInput,
    options?: OpenAiAgentsRunOptions<TContext>,
  ) => MaybePromise<TResult | HarnessRun<TOutput>>;
}

/** Runtime object prepared for OpenAI Agents harness executions. */
export interface OpenAiAgentsRuntime<
  TInput = string,
  TContext = OpenAiAgentsRuntimeContext,
> {
  context: TContext;
  runOptions: OpenAiAgentsRunOptions<TContext>;
  signal?: AbortSignal;
  tools: OpenAiAgentsTool<TInput>[];
}

/** Arguments passed to per-run OpenAI agent factories. */
export interface OpenAiAgentsCreateAgentArgs<TInput = string> {
  input: TInput;
  context: HarnessContext;
}

/** Arguments passed to custom OpenAI Agents harness run callbacks. */
export interface OpenAiAgentsHarnessRunArgs<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
> {
  agent: TAgent;
  input: TInput;
  context: HarnessContext;
  runtime: OpenAiAgentsRuntime<TInput, TContext>;
  runner: TRunner | undefined;
  runOptions: OpenAiAgentsRunOptions<TContext>;
}

type AgentSource<TAgent, TInput = string> =
  | TAgent
  | ((args: OpenAiAgentsCreateAgentArgs<TInput>) => MaybePromise<TAgent>);

type RunnerSource<TAgent, TInput, TRunner, TResult, TContext> =
  | TRunner
  | ((
      args: Omit<
        OpenAiAgentsHarnessRunArgs<TAgent, TInput, TRunner, TResult, TContext>,
        "runner"
      >,
    ) => MaybePromise<TRunner>);

type OpenAiAgentsRunnerResult<TAgent, TInput, TContext, TRunner> =
  TRunner extends {
    run: (
      agent: TAgent,
      input: TInput,
      options?: OpenAiAgentsRunOptions<TContext>,
    ) => MaybePromise<infer TResult>;
  }
    ? Awaited<TResult>
    : unknown;

/** Arguments passed to OpenAI Agents harness output selectors. */
export interface OpenAiAgentsHarnessResultArgs<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
> extends OpenAiAgentsHarnessRunArgs<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext
  > {
  result: TResult;
}

/** Context passed to instrumented OpenAI Agents tools. */
export interface OpenAiAgentsToolContext<TInput = string> {
  input: TInput;
  signal?: AbortSignal;
  setArtifact: HarnessContext["setArtifact"];
  runContext: unknown;
  details: unknown;
  tool: OpenAiAgentsTool<TInput>;
}

/** Tool replay recording shape for OpenAI Agents tools. */
export type OpenAiAgentsToolRecording<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
> = ToolRecording<TArgs, TResult>;

/** Replay configuration for an OpenAI Agents tool. */
export type OpenAiAgentsToolReplayConfig<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
  TInput = string,
> = ToolReplayConfig<TArgs, TResult, OpenAiAgentsToolContext<TInput>>;

/** Replay policy for one OpenAI Agents tool. */
export type OpenAiAgentsToolReplayPolicy<TInput = string> =
  | boolean
  | OpenAiAgentsToolReplayConfig<JsonValue, JsonValue, TInput>;

/** Replay policy map keyed by OpenAI Agents tool name. */
export type OpenAiAgentsToolReplayPolicies<TInput = string> = Record<
  string,
  OpenAiAgentsToolReplayPolicy<TInput>
>;

type OpenAiAgentsInvoke = (...args: unknown[]) => unknown;

/**
 * Configuration for adapting OpenAI Agents into a judge harness.
 *
 * @example
 * ```ts
 * import { openaiAgentsJudgeHarness } from "@vitest-evals/harness-openai-agents";
 *
 * const judgeHarness = openaiAgentsJudgeHarness({
 *   model: "gpt-4.1-mini",
 *   temperature: 0,
 * });
 * ```
 */
export interface OpenAiAgentsJudgeHarnessConfig {
  /** OpenAI Agents model used for judge prompts. */
  model: string | Model;
  /** Optional display name for diagnostics. */
  name?: string;
  /** Optional judge-model temperature. */
  temperature?: number;
  /** Optional judge-model token cap. */
  maxOutputTokens?: number;
  /** Additional model settings for the judge agent. */
  modelSettings?: ModelSettings;
  /** Optional runner override for tests or custom runner configuration. */
  runner?: Runner;
}

/**
 * Adapts OpenAI Agents into the provider-neutral judge harness API.
 *
 * @example
 * ```ts
 * import { openaiAgentsJudgeHarness } from "@vitest-evals/harness-openai-agents";
 * import { describeEval, FactualityJudge } from "vitest-evals";
 *
 * const judgeHarness = openaiAgentsJudgeHarness({
 *   model: "gpt-4.1-mini",
 *   temperature: 0,
 * });
 *
 * describeEval("qa agent", {
 *   harness: qaHarness,
 *   judgeHarness,
 *   judges: [FactualityJudge()],
 * }, (it) => {});
 * ```
 */
export function openaiAgentsJudgeHarness(
  config: OpenAiAgentsJudgeHarnessConfig,
) {
  return createJudgeHarness({
    name: config.name ?? "openai-agents",
    run: async ({ responseFormat, system, prompt }, { signal }) => {
      const outputType = createOpenAiAgentsOutputType(responseFormat);
      const runner =
        config.runner ??
        new Runner({
          tracingDisabled: true,
        });
      const agent = new Agent({
        name: "vitest_evals_judge",
        instructions: formatOpenAiAgentsJudgeInstructions(
          system,
          responseFormat,
        ),
        model: config.model,
        modelSettings: {
          ...(config.modelSettings ?? {}),
          ...(config.temperature !== undefined
            ? { temperature: config.temperature }
            : {}),
          ...(config.maxOutputTokens !== undefined
            ? { maxTokens: config.maxOutputTokens }
            : {}),
        },
        ...(outputType ? { outputType } : {}),
      });
      const result = await runner.run(agent, prompt, { signal });

      return resolveOpenAiAgentsJudgeOutput(result);
    },
  });
}

function formatOpenAiAgentsJudgeInstructions(
  system: string | undefined,
  responseFormat: JudgeHarnessInput["responseFormat"],
) {
  if (responseFormat?.type !== "json") {
    return system ?? "";
  }

  const jsonInstruction = [
    "Return only valid JSON. Do not include markdown fences or explanatory prose.",
    responseFormat.schema
      ? `JSON Schema:\n${JSON.stringify(responseFormat.schema, null, 2)}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");

  return system ? `${system}\n\n${jsonInstruction}` : jsonInstruction;
}

function createOpenAiAgentsOutputType(
  responseFormat: JudgeHarnessInput["responseFormat"],
): JsonSchemaDefinition | undefined {
  const schema = responseFormat?.schema;
  if (!isOpenAiAgentsJsonSchema(schema)) {
    return undefined;
  }

  return {
    type: "json_schema",
    name: "judge_response",
    strict: schema.additionalProperties === false,
    schema,
  };
}

function isOpenAiAgentsJsonSchema(
  schema: unknown,
): schema is JsonSchemaDefinition["schema"] {
  return (
    isJsonRecord(schema) &&
    schema.type === "object" &&
    isJsonRecord(schema.properties) &&
    Array.isArray(schema.required) &&
    typeof schema.additionalProperties === "boolean"
  );
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveOpenAiAgentsJudgeOutput(result: unknown) {
  if (!result || typeof result !== "object") {
    return result;
  }

  if (Object.prototype.hasOwnProperty.call(result, "finalOutput")) {
    return (result as { finalOutput: unknown }).finalOutput;
  }

  return result;
}

/** Minimal OpenAI Agents tool shape instrumented by the harness. */
export type OpenAiAgentsTool<TInput = string> = Record<string, unknown> & {
  name?: string;
  toolName?: string;
  type?: string;
  invoke?: OpenAiAgentsInvoke;
};

type OpenAiAgentsHarnessOutputSelector<
  TAgent,
  TInput = string,
  TRunner = unknown,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = (
  args: OpenAiAgentsHarnessResultArgs<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext
  >,
) => MaybePromise<TOutput>;

type OpenAiAgentsHarnessBaseOptions<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = {
  agent: AgentSource<TAgent, TInput>;
  runOptions?:
    | OpenAiAgentsRunOptions<TContext>
    | ((
        args: Omit<
          OpenAiAgentsHarnessRunArgs<
            TAgent,
            TInput,
            TRunner,
            TResult,
            TContext
          >,
          "runner" | "runtime" | "runOptions"
        >,
      ) => MaybePromise<OpenAiAgentsRunOptions<TContext> | undefined>);
  toolReplay?: OpenAiAgentsToolReplayPolicies<TInput>;
  output?: OpenAiAgentsHarnessOutputSelector<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >;
  name?: string;
};

type OpenAiAgentsRunFn<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput extends JsonValue | undefined,
> = (
  args: OpenAiAgentsHarnessRunArgs<TAgent, TInput, TRunner, TResult, TContext>,
) => MaybePromise<TResult | HarnessRun<TOutput>>;

type OpenAiAgentsHarnessOptions<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = OpenAiAgentsHarnessBaseOptions<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput
> &
  (
    | {
        runner: RunnerSource<TAgent, TInput, TRunner, TResult, TContext>;
        run?: OpenAiAgentsRunFn<
          TAgent,
          TInput,
          TRunner,
          TResult,
          TContext,
          TOutput
        >;
      }
    | {
        run: OpenAiAgentsRunFn<
          TAgent,
          TInput,
          TRunner,
          TResult,
          TContext,
          TOutput
        >;
        runner?: RunnerSource<TAgent, TInput, TRunner, TResult, TContext>;
      }
  );

type OpenAiAgentsHarnessOptionsWithOutput<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = OpenAiAgentsHarnessOptions<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput
> & {
  output: OpenAiAgentsHarnessOutputSelector<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >;
};

type OpenAiAgentsHarnessRunOptionsWithoutOutput<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext,
> = OpenAiAgentsHarnessBaseOptions<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  JsonValue | undefined
> & {
  run: OpenAiAgentsRunFn<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    JsonValue | undefined
  >;
  runner?: RunnerSource<TAgent, TInput, TRunner, TResult, TContext>;
  output?: never;
};

type OpenAiAgentsHarnessRunnerOptionsWithoutOutput<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TContext = OpenAiAgentsRuntimeContext,
> = OpenAiAgentsHarnessBaseOptions<
  TAgent,
  TInput,
  TRunner,
  OpenAiAgentsRunnerResult<TAgent, TInput, TContext, TRunner>,
  TContext,
  JsonValue | undefined
> & {
  runner: RunnerSource<
    TAgent,
    TInput,
    TRunner,
    OpenAiAgentsRunnerResult<TAgent, TInput, TContext, TRunner>,
    TContext
  >;
  run?: never;
  output?: never;
};

type RuntimeToolCapture = {
  events: TranscriptEvent[];
};

// Mirrors the public @openai/agents 0.8 RunResultData contract closely enough
// to avoid treating arbitrary app fields named `history` as provider transcript.
type OpenAiAgentsRunResultLike = {
  input?: unknown;
  history?: unknown;
  newItems: unknown[];
  output?: unknown[];
  rawResponses: unknown[];
};

type OpenAiAgentsInitialEventSource = {
  events: TranscriptEvent[];
  usesProviderTranscript: boolean;
};

/** Adapts an `@openai/agents` Runner workflow into a normalized harness. */
export function openaiAgentsHarness<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptionsWithOutput<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
): Harness<TInput, TOutput>;
export function openaiAgentsHarness<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext,
>(
  options: OpenAiAgentsHarnessRunOptionsWithoutOutput<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext
  >,
): Harness<TInput, OpenAiAgentsRunResultOutput<Awaited<TResult>>>;
export function openaiAgentsHarness<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TContext = OpenAiAgentsRuntimeContext,
>(
  options: OpenAiAgentsHarnessRunnerOptionsWithoutOutput<
    TAgent,
    TInput,
    TRunner,
    TContext
  >,
): Harness<
  TInput,
  OpenAiAgentsRunnerResultOutput<
    OpenAiAgentsRunnerResult<TAgent, TInput, TContext, TRunner>
  >
>;
export function openaiAgentsHarness<
  TAgent,
  TInput = string,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext,
    unknown,
    JsonValue | undefined
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
): Harness<TInput, TOutput> {
  validateOptions(options);

  const harnessName = options.name ?? "openai-agents";
  const harness: Harness<TInput, TOutput> = {
    name: harnessName,
    run: async (input, context) => {
      const startedAt = new Date();

      try {
        const agent = await resolveAgent(options, {
          input,
          context,
        });
        return await executeOpenAiAgentsHarness(options, agent, input, context);
      } catch (error) {
        if (getHarnessRunFromError(error)) {
          throw error;
        }

        throw attachHarnessRunToError(
          error,
          createFailedOpenAiAgentsRun(
            input,
            context,
            error,
            harnessName,
            startedAt,
          ),
        );
      }
    },
  };

  return harness;
}

function createFailedOpenAiAgentsRun<TInput>(
  input: TInput,
  context: HarnessContext,
  error: unknown,
  harnessName: string,
  startedAt: Date,
) {
  const run = createFailedHarnessRun(input, error, {
    artifacts: context.artifacts,
  });
  ensureRunTrace(run, {
    name: harnessName,
    startedAt,
    finishedAt: new Date(),
    operationName: "invoke_agent",
    source: "harness-openai-agents",
  });

  return run;
}

async function executeOpenAiAgentsHarness<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput extends JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
  agent: TAgent,
  input: TInput,
  context: HarnessContext,
): Promise<HarnessRun<TOutput>> {
  const startedAt = Date.now();
  const trace = createTraceRecorder(options.name ?? "openai-agents");
  const capture: RuntimeToolCapture = {
    events: [],
  };

  return withInstrumentedAgentTools(
    agent,
    {
      input,
      context,
      capture,
      toolReplay: options.toolReplay,
    },
    async (instrumentedAgent, runtimeTools) => {
      const defaultRuntimeContext = {
        artifacts: context.artifacts,
        setArtifact: context.setArtifact,
      } satisfies OpenAiAgentsRuntimeContext;
      const runOptions = await resolveRunOptions<
        TAgent,
        TInput,
        TRunner,
        TResult,
        TContext,
        TOutput
      >(
        options,
        instrumentedAgent,
        input,
        context,
        defaultRuntimeContext as TContext,
      );
      const runtime = {
        context: runOptions.context as TContext,
        runOptions,
        signal: runOptions.signal,
        tools: runtimeTools,
      } satisfies OpenAiAgentsRuntime<TInput, TContext>;
      const runner = await resolveRunner(options, {
        agent: instrumentedAgent,
        input,
        context,
        runtime,
        runOptions,
      });

      try {
        const result = await runAgent(options, {
          agent: instrumentedAgent,
          input,
          context,
          runtime,
          runner,
          runOptions,
        });
        const settledResult = await settleRunResult(result);

        if (isHarnessRun(settledResult) && !hasOutputSelector(options)) {
          if (
            Object.keys(context.artifacts).length > 0 &&
            !settledResult.artifacts
          ) {
            settledResult.artifacts = context.artifacts;
          }
          attachOpenAiAgentsTrace(
            settledResult,
            trace,
            settledResult,
            new Date(),
          );
          return settledResult as HarnessRun<TOutput>;
        }

        const normalizeResult = settledResult as TResult;
        const baseResultArgs = {
          agent: instrumentedAgent,
          input,
          context,
          runtime,
          runner,
          runOptions,
          result: normalizeResult,
        };
        const resultArgs: OpenAiAgentsHarnessResultArgs<
          TAgent,
          TInput,
          TRunner,
          TResult,
          TContext
        > = baseResultArgs;
        const output = options.output
          ? await options.output(resultArgs)
          : (resolveOutput(normalizeResult, {
              allowOutputField: Boolean(options.run),
            }) as TOutput | undefined);
        const baseUsage = resolveUsage(normalizeResult);
        const session = resolveSession(
          input,
          normalizeResult,
          output,
          baseUsage,
          {
            runtimeEvents: capture.events,
          },
        );
        const sessionToolCallCount = countToolCallEvents(session.events);
        const usage = {
          ...baseUsage,
          ...(sessionToolCallCount > 0
            ? { toolCalls: sessionToolCallCount }
            : {}),
        };
        const errors = resolveHarnessRunErrors(normalizeResult);
        const finishedAt = new Date();

        return {
          session,
          output,
          usage,
          timings: { totalMs: Date.now() - startedAt },
          artifacts:
            Object.keys(context.artifacts).length > 0
              ? context.artifacts
              : undefined,
          errors,
          traces: [
            finishOpenAiAgentsTrace(trace, {
              result: normalizeResult,
              session,
              usage,
              errors,
              finishedAt,
            }),
          ],
        } as HarnessRun<TOutput>;
      } catch (error) {
        const finishedAt = new Date();
        const runtimeToolCallCount = countToolCallEvents(capture.events);
        const usage =
          runtimeToolCallCount > 0 ? { toolCalls: runtimeToolCallCount } : {};
        const session = resolveFailureSession(input, capture.events);
        const serializedError = serializeError(error);
        const run = {
          session,
          output: undefined,
          usage,
          timings: { totalMs: Date.now() - startedAt },
          artifacts:
            Object.keys(context.artifacts).length > 0
              ? context.artifacts
              : undefined,
          errors: [serializedError],
          traces: [
            finishOpenAiAgentsTrace(trace, {
              session,
              usage,
              errors: [serializedError],
              finishedAt,
            }),
          ],
        } satisfies HarnessRun;

        throw attachHarnessRunToError(error, run);
      }
    },
  );
}

function validateOptions<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput extends JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
) {
  if (options.agent === undefined) {
    throw new Error(
      "openaiAgentsHarness requires agent. Pass an agent instance or an agent factory.",
    );
  }

  if (!options.run && !options.runner) {
    throw new Error(
      "openaiAgentsHarness requires runner for Runner.run(agent, input, options), or run() for a custom entrypoint.",
    );
  }
}

async function resolveAgent<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput extends JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
  args: OpenAiAgentsCreateAgentArgs<TInput>,
) {
  return resolveAgentSource(options.agent, args);
}

async function resolveAgentSource<TAgent, TInput>(
  agent: AgentSource<TAgent, TInput>,
  args: OpenAiAgentsCreateAgentArgs<TInput>,
): Promise<TAgent> {
  if (isAgentFactory(agent)) {
    return agent(args);
  }

  return agent;
}

function isAgentFactory<TAgent, TInput>(
  agent: AgentSource<TAgent, TInput>,
): agent is (
  args: OpenAiAgentsCreateAgentArgs<TInput>,
) => MaybePromise<TAgent> {
  return typeof agent === "function" && !hasCallableMethod(agent, "run");
}

async function resolveRunner<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput extends JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
  args: Omit<
    OpenAiAgentsHarnessRunArgs<TAgent, TInput, TRunner, TResult, TContext>,
    "runner"
  >,
) {
  if (options.runner !== undefined) {
    return resolveRunnerSource(options.runner, args);
  }

  return undefined;
}

async function resolveRunnerSource<TAgent, TInput, TRunner, TResult, TContext>(
  runner: RunnerSource<TAgent, TInput, TRunner, TResult, TContext>,
  args: Omit<
    OpenAiAgentsHarnessRunArgs<TAgent, TInput, TRunner, TResult, TContext>,
    "runner"
  >,
): Promise<TRunner> {
  if (isRunnerFactory(runner)) {
    return runner(args);
  }

  return runner;
}

function isRunnerFactory<TAgent, TInput, TRunner, TResult, TContext>(
  runner: RunnerSource<TAgent, TInput, TRunner, TResult, TContext>,
): runner is (
  args: Omit<
    OpenAiAgentsHarnessRunArgs<TAgent, TInput, TRunner, TResult, TContext>,
    "runner"
  >,
) => MaybePromise<TRunner> {
  return typeof runner === "function" && !hasRunnerRunMethod(runner);
}

async function resolveRunOptions<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput extends JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
  agent: TAgent,
  input: TInput,
  context: HarnessContext,
  defaultRuntimeContext: TContext,
): Promise<OpenAiAgentsRunOptions<TContext>> {
  const userOptions =
    typeof options.runOptions === "function"
      ? await options.runOptions({
          agent,
          input,
          context,
        })
      : options.runOptions;
  const baseOptions = userOptions ?? {};

  return {
    ...baseOptions,
    context:
      "context" in baseOptions
        ? (baseOptions.context as TContext)
        : defaultRuntimeContext,
    signal:
      "signal" in baseOptions
        ? (baseOptions.signal as AbortSignal | undefined)
        : context.signal,
    stream: "stream" in baseOptions ? Boolean(baseOptions.stream) : false,
  };
}

async function runAgent<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput extends JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
  args: OpenAiAgentsHarnessRunArgs<TAgent, TInput, TRunner, TResult, TContext>,
): Promise<TResult | HarnessRun<TOutput>> {
  if (options.run) {
    return options.run(args);
  }

  if (
    hasRunnerRunMethod<TAgent, TInput, TContext, TResult, TOutput>(args.runner)
  ) {
    return args.runner.run(args.agent, args.input, args.runOptions);
  }

  throw new Error(
    "openaiAgentsHarness requires runner for the default Runner.run path, or run() for a custom entrypoint.",
  );
}

function hasRunnerRunMethod<
  TAgent,
  TInput,
  TContext,
  TResult,
  TOutput extends JsonValue | undefined,
>(
  runner: unknown,
): runner is OpenAiAgentsRunner<TAgent, TInput, TContext, TResult, TOutput> {
  return hasCallableMethod(runner, "run");
}

async function settleRunResult(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "completed" in result &&
    isPromiseLike((result as { completed?: unknown }).completed)
  ) {
    await (result as { completed: Promise<unknown> }).completed;
  }

  return result;
}

function hasOutputSelector<
  TAgent,
  TInput,
  TRunner,
  TResult,
  TContext,
  TOutput extends JsonValue | undefined,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TRunner,
    TResult,
    TContext,
    TOutput
  >,
) {
  return Boolean(options.output);
}

type TraceRecorder = {
  id: string;
  rootSpanId: string;
  name: string;
  startedAt: Date;
};

function createTraceRecorder(name: string): TraceRecorder {
  const id = `openai_agents_trace_${++nextTraceId}`;

  return {
    id,
    rootSpanId: `${id}:run`,
    name,
    startedAt: new Date(),
  };
}

function attachOpenAiAgentsTrace(
  run: HarnessRun,
  trace: TraceRecorder,
  result: unknown,
  finishedAt: Date,
) {
  const nativeTrace = finishOpenAiAgentsTrace(trace, {
    result,
    session: run.session,
    usage: run.usage,
    errors: run.errors ?? [],
    finishedAt,
  });

  run.traces = [...(run.traces ?? []), nativeTrace];
}

function finishOpenAiAgentsTrace(
  trace: TraceRecorder,
  options: {
    result?: unknown;
    session: NormalizedSession;
    usage?: UsageSummary;
    errors?: unknown[];
    finishedAt: Date;
  },
): NormalizedTrace {
  const finishedAt = options.finishedAt;
  const durationMs = finishedAt.getTime() - trace.startedAt.getTime();
  const rootError = options.errors?.[0]
    ? normalizeSpanError(options.errors[0])
    : undefined;
  const rootSpan: NormalizedSpan = {
    id: trace.rootSpanId,
    traceId: trace.id,
    name: trace.name,
    kind: "run",
    startedAt: trace.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    status: rootError ? "error" : "ok",
    ...(rootError ? { error: rootError } : {}),
    attributes: normalizeSpanAttributes({
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.workflow.name": trace.name,
      "gen_ai.agent.name":
        stringProperty(
          getObjectProperty(options.result, "lastAgent"),
          "name",
        ) ??
        stringProperty(
          getObjectProperty(options.result, "activeAgent"),
          "name",
        ),
      ...createGenAiUsageAttributes(options.usage, { provider: "openai" }),
    }),
  };
  const modelSpans = createOpenAiModelSpans(
    trace,
    options.result,
    options.usage,
  );
  return {
    id: trace.id,
    name: trace.name,
    startedAt: trace.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    metadata: {
      source: "harness-openai-agents",
    },
    spans: [rootSpan, ...modelSpans],
  };
}

function createOpenAiModelSpans(
  trace: TraceRecorder,
  result: unknown,
  usage: UsageSummary | undefined,
): NormalizedSpan[] {
  const rawResponses = arrayProperty(result, "rawResponses") ?? [];
  if (rawResponses.length === 0) {
    const fallback = createUsageModelSpan(trace, usage);
    return fallback ? [fallback] : [];
  }

  return rawResponses.map((response, index) => {
    const responseUsage = getObjectProperty(response, "usage");
    const responseError = getObjectProperty(response, "error");
    const spanError = responseError
      ? normalizeSpanError(responseError)
      : undefined;
    const responseModel = resolveResponseModel(response) ?? usage?.model;

    return {
      id: `${trace.id}:model:${index + 1}`,
      traceId: trace.id,
      parentId: trace.rootSpanId,
      name: responseModel
        ? `openai response ${responseModel}`
        : "openai response",
      kind: "model",
      status:
        spanError || stringProperty(response, "status") === "failed"
          ? "error"
          : "ok",
      ...(spanError ? { error: spanError } : {}),
      attributes: normalizeSpanAttributes({
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openai",
        "gen_ai.request.model": responseModel,
        "gen_ai.response.model": responseModel,
        "gen_ai.response.id": stringProperty(response, "id"),
        "gen_ai.response.finish_reasons": stringProperty(response, "status")
          ? [stringProperty(response, "status") as string]
          : undefined,
        "gen_ai.usage.input_tokens": usageNumberProperty(
          responseUsage,
          "inputTokens",
          "input_tokens",
        ),
        "gen_ai.usage.output_tokens": usageNumberProperty(
          responseUsage,
          "outputTokens",
          "output_tokens",
        ),
        "gen_ai.usage.reasoning.output_tokens": usageNumberProperty(
          getObjectProperty(responseUsage, "outputTokenDetails") ??
            getObjectProperty(responseUsage, "output_tokens_details"),
          "reasoningTokens",
          "reasoning_tokens",
        ),
      }),
    } satisfies NormalizedSpan;
  });
}

function createUsageModelSpan(
  trace: TraceRecorder,
  usage: UsageSummary | undefined,
): NormalizedSpan | undefined {
  if (!usage?.provider && !usage?.model) {
    return undefined;
  }

  return {
    id: `${trace.id}:model:1`,
    traceId: trace.id,
    parentId: trace.rootSpanId,
    name: usage.model ? `openai ${usage.model}` : "openai model",
    kind: "model",
    status: "ok",
    attributes: normalizeSpanAttributes({
      "gen_ai.operation.name": "chat",
      ...createGenAiUsageAttributes(usage, { provider: "openai" }),
    }),
  };
}

function resolveResponseModel(response: unknown) {
  const model = getObjectProperty(response, "model");
  return (
    (typeof model === "string" ? model : undefined) ??
    stringProperty(model, "modelId") ??
    stringProperty(model, "id")
  );
}

function usageNumberProperty(
  value: unknown,
  camelKey: string,
  snakeKey: string,
) {
  return numberProperty(value, camelKey) ?? numberProperty(value, snakeKey);
}

async function withInstrumentedAgentTools<TAgent, TInput, TResult>(
  agent: TAgent,
  args: {
    input: TInput;
    context: HarnessContext;
    capture: RuntimeToolCapture;
    toolReplay: OpenAiAgentsToolReplayPolicies<TInput> | undefined;
  },
  callback: (
    agent: TAgent,
    runtimeTools: OpenAiAgentsTool<TInput>[],
  ) => Promise<TResult>,
) {
  const agentTools = getAgentTools<TInput>(agent) ?? [];
  validateToolReplayPolicies(agentTools, args.toolReplay);

  if (agentTools.length === 0) {
    return callback(agent, []);
  }

  const runtimeTools = agentTools.map((tool) => instrumentTool(tool, args));
  const instrumentedAgent = cloneAgentWithTools(agent, runtimeTools);
  return callback(instrumentedAgent, runtimeTools);
}

function getAgentTools<TInput>(
  agent: unknown,
): OpenAiAgentsTool<TInput>[] | undefined {
  const tools = getObjectProperty(agent, "tools");
  return Array.isArray(tools)
    ? (tools as OpenAiAgentsTool<TInput>[])
    : undefined;
}

function instrumentTool<TInput>(
  tool: OpenAiAgentsTool<TInput>,
  args: {
    input: TInput;
    context: HarnessContext;
    capture: RuntimeToolCapture;
    toolReplay: OpenAiAgentsToolReplayPolicies<TInput> | undefined;
  },
): OpenAiAgentsTool<TInput> {
  const toolName = resolveToolName(tool);
  const replay = args.toolReplay?.[toolName];

  if (typeof tool.invoke !== "function") {
    if (replay) {
      throw new Error(
        `Tool replay requires invoke() for ${toolName}. Hosted or provider-executed OpenAI Agents tools cannot be recorded automatically.`,
      );
    }

    return tool;
  }

  const originalInvoke = tool.invoke;
  const instrumentedInvoke = (async (runContext, rawInput, details) =>
    executeInstrumentedTool({
      tool,
      toolName,
      replay,
      rawInput,
      runContext,
      details,
      input: args.input,
      context: args.context,
      capture: args.capture,
      execute: () => originalInvoke(runContext, rawInput, details),
    })) as OpenAiAgentsInvoke;

  return {
    ...tool,
    invoke: instrumentedInvoke,
  };
}

function validateToolReplayPolicies<TInput>(
  tools: OpenAiAgentsTool<TInput>[],
  toolReplay: OpenAiAgentsToolReplayPolicies<TInput> | undefined,
) {
  const replayToolNames = Object.entries(toolReplay ?? {})
    .filter(([, replay]) => Boolean(replay))
    .map(([toolName]) => toolName);
  if (replayToolNames.length === 0) {
    return;
  }

  const knownToolNames = new Set(tools.map(resolveToolName));
  const unknownToolNames = replayToolNames.filter(
    (toolName) => !knownToolNames.has(toolName),
  );
  if (unknownToolNames.length > 0) {
    throw new Error(
      `Tool replay configured for unknown OpenAI Agents tool(s): ${unknownToolNames.join(", ")}.`,
    );
  }
}

function cloneAgentWithTools<TAgent, TInput>(
  agent: TAgent,
  tools: OpenAiAgentsTool<TInput>[],
): TAgent {
  if (hasCallableMethod(agent, "clone")) {
    return (
      agent as {
        clone: (config: {
          tools: OpenAiAgentsTool<TInput>[];
        }) => TAgent;
      }
    ).clone({ tools });
  }

  if (!agent || typeof agent !== "object") {
    return agent;
  }

  return Object.assign({}, agent, { tools }) as TAgent;
}

async function executeInstrumentedTool<TInput>({
  tool,
  toolName,
  replay,
  rawInput,
  runContext,
  details,
  input,
  context,
  capture,
  execute,
}: {
  tool: OpenAiAgentsTool<TInput>;
  toolName: string;
  replay: OpenAiAgentsToolReplayPolicy<TInput> | undefined;
  rawInput: unknown;
  runContext: unknown;
  details: unknown;
  input: TInput;
  context: HarnessContext;
  capture: RuntimeToolCapture;
  execute: () => MaybePromise<unknown>;
}) {
  const startedAt = new Date();
  const toolCallId = resolveToolCallId(details);
  const resolvedToolCallId =
    toolCallId ??
    createRuntimeToolCallId(toolName, countToolCallEvents(capture.events));
  const normalizedArgs = normalizeArguments(rawInput);
  const call: TranscriptToolCallEvent = {
    type: "tool_call",
    id: resolvedToolCallId,
    name: toolName,
    ...(normalizedArgs !== undefined ? { arguments: normalizedArgs } : {}),
    startedAt: startedAt.toISOString(),
  };
  capture.events.push(call);
  const replayContext = {
    input,
    signal: context.signal,
    setArtifact: context.setArtifact,
    runContext,
    details,
    tool,
  } satisfies OpenAiAgentsToolContext<TInput>;

  try {
    const execution = replay
      ? await executeWithReplay({
          toolName,
          args: normalizeReplayToolInput(rawInput),
          context: replayContext,
          execute: async () =>
            toReplayJsonValue(await execute(), `${toolName} tool output`),
          replay,
        })
      : {
          result: await execute(),
          replay: undefined,
        };
    const finishedAt = new Date();
    call.finishedAt = finishedAt.toISOString();
    call.durationMs = finishedAt.getTime() - startedAt.getTime();
    call.metadata = normalizeReplayMetadata(execution.replay);
    const normalizedResult = normalizeContent(execution.result);
    capture.events.push({
      type: "tool_result",
      toolCallId: resolvedToolCallId,
      name: toolName,
      ...(normalizedResult !== undefined ? { content: normalizedResult } : {}),
      startedAt: call.startedAt,
      finishedAt: call.finishedAt,
      durationMs: call.durationMs,
    });
    return execution.result;
  } catch (error) {
    const finishedAt = new Date();
    const replay = getReplayMetadataFromError(error);
    call.finishedAt = finishedAt.toISOString();
    call.durationMs = finishedAt.getTime() - startedAt.getTime();
    call.metadata = normalizeReplayMetadata(replay);
    capture.events.push({
      type: "tool_result",
      toolCallId: resolvedToolCallId,
      name: toolName,
      error: normalizeError(error),
      startedAt: call.startedAt,
      finishedAt: call.finishedAt,
      durationMs: call.durationMs,
    });
    throw error;
  }
}

function resolveToolName(tool: unknown) {
  return (
    stringProperty(tool, "name") ??
    stringProperty(tool, "toolName") ??
    stringProperty(getObjectProperty(tool, "function"), "name") ??
    "unknown"
  );
}

function resolveToolCallId(details: unknown) {
  const toolCall = getObjectProperty(details, "toolCall");
  return stringProperty(toolCall, "callId");
}

function resolveOutput(
  result: unknown,
  options: { allowOutputField: boolean },
): JsonValue | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const resultRecord = result as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(resultRecord, "finalOutput")) {
    return toOutputValue(resultRecord.finalOutput);
  }

  if (options.allowOutputField && !isOpenAiAgentsRunResult(result)) {
    if (Object.prototype.hasOwnProperty.call(resultRecord, "output")) {
      return toOutputValue(resultRecord.output);
    }
  }

  return undefined;
}

function isOpenAiAgentsRunResult(
  result: unknown,
): result is OpenAiAgentsRunResultLike {
  return Boolean(
    result &&
      typeof result === "object" &&
      Array.isArray((result as { newItems?: unknown }).newItems) &&
      Array.isArray((result as { rawResponses?: unknown }).rawResponses),
  );
}

// Keep this adapter-local rather than exporting a core helper. Core
// `toJsonValue` normalizes trace data; inferred app output should only accept
// values that are already JSON-safe so the public contract stays explicit.
// Invalid nested values reject the whole candidate instead of being patched.
function toOutputValue(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (const item of value) {
      const normalized = toOutputValue(item);
      if (normalized === undefined) {
        return undefined;
      }
      items.push(normalized);
    }
    return items;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }

    const record: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = toOutputValue(entry);
      if (normalized === undefined) {
        return undefined;
      }
      record[key] = normalized;
    }
    return record;
  }

  return undefined;
}

function resolveUsage(result: unknown) {
  const usage =
    getObjectProperty(getObjectProperty(result, "state"), "usage") ??
    getObjectProperty(getObjectProperty(result, "runContext"), "usage") ??
    getObjectProperty(result, "usage");
  const usageRecord =
    usage && typeof usage === "object"
      ? (usage as Record<string, unknown>)
      : undefined;
  if (!usageRecord) {
    return {};
  }

  return {
    provider: resolveProvider(result),
    model: resolveModel(result),
    inputTokens: numberProperty(usageRecord, "inputTokens"),
    outputTokens: numberProperty(usageRecord, "outputTokens"),
    reasoningTokens: numberProperty(usageRecord, "reasoningTokens"),
    totalTokens: numberProperty(usageRecord, "totalTokens"),
    retries: numberProperty(usageRecord, "retries"),
    metadata: normalizeMetadata({
      requests: usageRecord.requests,
      requestUsageEntries: usageRecord.requestUsageEntries,
      raw: usageRecord.raw,
    }),
  } satisfies UsageSummary;
}

function resolveSession(
  input: unknown,
  result: unknown,
  output: JsonValue | undefined,
  usage: UsageSummary,
  options: {
    runtimeEvents: TranscriptEvent[];
  },
): NormalizedSession {
  if (
    isNormalizedSession(
      (result as Record<string, unknown> | undefined)?.session,
    )
  ) {
    return (result as { session: NormalizedSession }).session;
  }

  const runItems = readOpenAiAgentsRunItems(result);
  const initialSource = createInitialSessionEventSource(
    input,
    result,
    runItems,
  );
  const events = initialSource.events;

  if (runItems) {
    events.push(...normalizeRunItems(runItems, options.runtimeEvents));
  } else if (!initialSource.usesProviderTranscript) {
    // Custom entrypoints may execute instrumented local tools without returning
    // provider run items; in that case runtime capture is the transcript source.
    events.push(...options.runtimeEvents);
  }

  if (
    output !== undefined &&
    !events.some(
      (event) =>
        event.type === "message" &&
        event.role === "assistant" &&
        event.content !== undefined,
    )
  ) {
    events.push({
      type: "message",
      role: "assistant",
      content: output,
    });
  }

  return {
    events,
    provider: resolveProvider(result) ?? usage.provider,
    model: resolveModel(result) ?? usage.model,
    metadata: normalizeMetadata({
      lastResponseId: getObjectProperty(result, "lastResponseId"),
      interruptions: getObjectProperty(result, "interruptions"),
      rawResponses: getObjectProperty(result, "rawResponses"),
      inputGuardrailResults: getObjectProperty(result, "inputGuardrailResults"),
      outputGuardrailResults: getObjectProperty(
        result,
        "outputGuardrailResults",
      ),
      toolInputGuardrailResults: getObjectProperty(
        result,
        "toolInputGuardrailResults",
      ),
      toolOutputGuardrailResults: getObjectProperty(
        result,
        "toolOutputGuardrailResults",
      ),
      activeAgent: normalizeAgentMetadata(
        getObjectProperty(result, "activeAgent"),
      ),
      lastAgent: normalizeAgentMetadata(getObjectProperty(result, "lastAgent")),
    }),
  };
}

function resolveFailureSession(
  input: unknown,
  runtimeEvents: TranscriptEvent[],
): NormalizedSession {
  return {
    events: [...normalizeInputMessages(input), ...runtimeEvents],
  };
}

function readOpenAiAgentsRunItems(result: unknown): unknown[] | undefined {
  const newItems = arrayProperty(result, "newItems");
  if (newItems && newItems.length > 0 && hasOpenAiAgentsRunItem(newItems)) {
    return newItems;
  }

  const outputItems = arrayProperty(result, "output");
  if (
    outputItems &&
    outputItems.length > 0 &&
    hasOpenAiAgentsRunItem(outputItems)
  ) {
    return outputItems;
  }

  return undefined;
}

/** Selects the provider transcript source before runtime events are considered. */
function createInitialSessionEventSource(
  input: unknown,
  result: unknown,
  runItems: unknown[] | undefined,
): OpenAiAgentsInitialEventSource {
  if (runItems) {
    return {
      events: normalizeInputMessages(
        getObjectProperty(result, "input") ?? input,
      ),
      usesProviderTranscript: true,
    };
  }

  if (isOpenAiAgentsRunResult(result) && "input" in result) {
    const history = arrayProperty(result, "history");
    if (history && history.length > 0) {
      return {
        events: normalizeProviderItems(history),
        usesProviderTranscript: true,
      };
    }

    return {
      events: normalizeInputMessages(result.input),
      usesProviderTranscript: false,
    };
  }

  return {
    events: normalizeInputMessages(input),
    usesProviderTranscript: false,
  };
}

function normalizeProviderItems(items: unknown[]): TranscriptEvent[] {
  return normalizeRunItems(items, []);
}

function normalizeInputMessages(input: unknown): TranscriptEvent[] {
  if (Array.isArray(input)) {
    const events = input
      .map((item) => normalizeModelMessage(item))
      .filter((event): event is TranscriptEvent => Boolean(event));

    return events.length > 0
      ? events
      : [
          {
            type: "message",
            role: "user",
            content: normalizeContent(input),
          },
        ];
  }

  return [
    {
      type: "message",
      role: "user",
      content: normalizeContent(input),
    },
  ];
}

function normalizeRunItems(
  items: unknown[],
  runtimeEvents: TranscriptEvent[],
): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  const outputItemsByCallId = new Map<string, unknown>();
  const runtimeCallsById = new Map(
    runtimeEvents.filter(isToolCallEvent).map((event) => [event.id, event]),
  );
  const runtimeResultsById = new Map(
    runtimeEvents
      .filter(isToolResultEvent)
      .map((event) => [event.toolCallId, event]),
  );

  for (const item of items) {
    const rawItem = getRunItemRawItem(item);
    const callId = resolveRunItemToolCallId(item, rawItem);
    if (callId && isToolCallOutputItem(item, rawItem)) {
      outputItemsByCallId.set(callId, item);
    }
  }

  for (const item of items) {
    const rawItem = getRunItemRawItem(item);

    if (isToolCallOutputItem(item, rawItem)) {
      const message = normalizeToolResultMessage(
        item,
        rawItem,
        runtimeResultsById,
      );
      if (message) {
        events.push(message);
      }
      continue;
    }

    const message = normalizeModelMessage(item);
    if (message) {
      events.push(message);
      continue;
    }

    if (isAssistantMessageItem(item, rawItem)) {
      events.push({
        type: "message",
        role: "assistant",
        content: normalizeMessageContent(rawItem, item),
        metadata: normalizeRunItemMetadata(item, rawItem),
      });
      continue;
    }

    if (isToolCallItem(item, rawItem)) {
      const callId = resolveRunItemToolCallId(item, rawItem);
      if (!callId) {
        continue;
      }
      const runtimeCall = callId ? runtimeCallsById.get(callId) : undefined;
      const call = normalizeToolCallItem(
        item,
        rawItem,
        callId,
        callId ? outputItemsByCallId.get(callId) : undefined,
        runtimeCall,
      );
      const metadata = normalizeRunItemMetadata(item, rawItem);
      events.push({
        ...call,
        ...(metadata
          ? { metadata: mergeMetadata(call.metadata, metadata) }
          : {}),
      });
      continue;
    }

    const metadata = normalizeRunItemMetadata(item, rawItem);
    if (metadata) {
      events.push({
        type: "message",
        role: "assistant",
        metadata,
      });
    }
  }

  return events;
}

function hasOpenAiAgentsRunItem(items: unknown[]) {
  return items.some((item) => {
    const rawItem = getRunItemRawItem(item);
    return (
      isAssistantMessageItem(item, rawItem) ||
      isToolCallItem(item, rawItem) ||
      isToolCallOutputItem(item, rawItem)
    );
  });
}

function isToolCallEvent(
  event: TranscriptEvent,
): event is TranscriptToolCallEvent {
  return event.type === "tool_call";
}

function isToolResultEvent(
  event: TranscriptEvent,
): event is TranscriptToolResultEvent {
  return event.type === "tool_result";
}

function countToolCallEvents(events: readonly TranscriptEvent[]) {
  return events.filter(isToolCallEvent).length;
}

function normalizeModelMessage(item: unknown): TranscriptEvent | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }

  const rawItem = getRunItemRawItem(item);
  const role = stringProperty(rawItem, "role");
  if (
    role !== "system" &&
    role !== "user" &&
    role !== "assistant" &&
    role !== "tool"
  ) {
    return undefined;
  }

  const content = normalizeMessageContent(rawItem, item);
  if (role === "tool") {
    const toolCallId = resolveRunItemToolCallId(item, rawItem);
    if (!toolCallId) {
      return undefined;
    }

    return {
      type: "tool_result",
      toolCallId,
      name: resolveRawToolName(rawItem),
      ...(content !== undefined ? { content } : {}),
      metadata: normalizeRunItemMetadata(item, rawItem),
    };
  }

  return {
    type: "message",
    role,
    ...(content !== undefined ? { content } : {}),
    metadata: normalizeRunItemMetadata(item, rawItem),
  };
}

function normalizeToolCallItem(
  item: unknown,
  rawItem: unknown,
  toolCallId: string,
  outputItem: unknown,
  runtimeCall: TranscriptToolCallEvent | undefined,
): TranscriptToolCallEvent {
  const rawOutputItem = getRunItemRawItem(outputItem);
  const output =
    getObjectProperty(outputItem, "output") ??
    getObjectProperty(rawOutputItem, "output");
  const outputStatus = stringProperty(rawOutputItem, "status");
  const outputError =
    outputStatus === "failed" ? normalizeToolOutputError(output) : undefined;
  const call = {
    type: "tool_call",
    id: toolCallId,
    name: resolveRawToolName(rawItem),
    arguments: normalizeArguments(getObjectProperty(rawItem, "arguments")),
    metadata: normalizeMetadata({
      status: getObjectProperty(rawItem, "status"),
      outputStatus,
      ...(outputError ? { outputError } : {}),
      namespace: getObjectProperty(rawItem, "namespace"),
      providerData: getObjectProperty(rawItem, "providerData"),
      itemType: getObjectProperty(item, "type"),
      rawType: getObjectProperty(rawItem, "type"),
    }),
  } satisfies TranscriptToolCallEvent;

  return mergeToolCalls(call, runtimeCall);
}

function normalizeToolResultMessage(
  item: unknown,
  rawItem: unknown,
  runtimeResultsById: Map<string, TranscriptToolResultEvent>,
): TranscriptToolResultEvent | undefined {
  const toolCallId = resolveRunItemToolCallId(item, rawItem);
  if (!toolCallId) {
    return undefined;
  }

  const runtimeResult = runtimeResultsById.get(toolCallId);
  if (runtimeResult) {
    return {
      ...runtimeResult,
      name: runtimeResult.name ?? resolveRawToolName(rawItem),
      metadata: mergeMetadata(
        normalizeRunItemMetadata(item, rawItem),
        runtimeResult.metadata,
      ),
    };
  }

  const output =
    getObjectProperty(item, "output") ?? getObjectProperty(rawItem, "output");
  const status = stringProperty(rawItem, "status");
  const error =
    status === "failed" ? normalizeToolOutputError(output) : undefined;

  return {
    type: "tool_result",
    toolCallId,
    name: resolveRawToolName(rawItem),
    ...(output !== undefined ? { content: normalizeContent(output) } : {}),
    ...(error ? { error } : {}),
    metadata: normalizeMetadata({
      status,
      namespace: getObjectProperty(rawItem, "namespace"),
      providerData: getObjectProperty(rawItem, "providerData"),
      itemType: getObjectProperty(item, "type"),
      rawType: getObjectProperty(rawItem, "type"),
    }),
  };
}

function mergeMetadata(
  providerMetadata: Record<string, JsonValue> | undefined,
  runtimeMetadata: Record<string, JsonValue> | undefined,
) {
  return normalizeMetadata({
    ...(providerMetadata ?? {}),
    ...(runtimeMetadata ?? {}),
  });
}

function mergeToolCalls(
  call: TranscriptToolCallEvent,
  runtimeCall: TranscriptToolCallEvent | undefined,
): TranscriptToolCallEvent {
  if (!runtimeCall) {
    return call;
  }

  return {
    ...runtimeCall,
    ...call,
    id: call.id ?? runtimeCall.id,
    name: call.name,
    arguments: call.arguments ?? runtimeCall.arguments,
    metadata: normalizeMetadata({
      ...(runtimeCall.metadata ?? {}),
      ...(call.metadata ?? {}),
    }),
  };
}

/** Creates a runtime-local id used on both assistant tool calls and tool results. */
function createRuntimeToolCallId(toolName: string, index: number) {
  return `runtime:${toolName}:${index + 1}`;
}

function normalizeMessageContent(
  rawItem: unknown,
  item: unknown,
): JsonValue | undefined {
  const contentAccessor = getObjectProperty(item, "content");
  if (typeof contentAccessor === "string" && contentAccessor.length > 0) {
    return contentAccessor;
  }

  const content = getObjectProperty(rawItem, "content");
  const text = extractText(content);
  if (text) {
    return text;
  }

  return content === undefined ? undefined : normalizeContent(content);
}

function isAssistantMessageItem(item: unknown, rawItem: unknown) {
  return (
    getObjectProperty(item, "type") === "message_output_item" ||
    stringProperty(rawItem, "role") === "assistant"
  );
}

function isToolCallItem(item: unknown, rawItem: unknown) {
  const itemType = getObjectProperty(item, "type");
  const rawType = getObjectProperty(rawItem, "type");

  return (
    itemType === "tool_call_item" ||
    rawType === "function_call" ||
    rawType === "custom_tool_call" ||
    rawType === "hosted_tool_call" ||
    rawType === "tool_search_call" ||
    rawType === "shell_call" ||
    rawType === "computer_call" ||
    rawType === "apply_patch_call"
  );
}

function isToolCallOutputItem(item: unknown, rawItem: unknown) {
  const itemType = getObjectProperty(item, "type");
  const rawType = getObjectProperty(rawItem, "type");

  return (
    itemType === "tool_call_output_item" ||
    rawType === "function_call_output" ||
    rawType === "function_call_result" ||
    rawType === "custom_tool_call_output" ||
    rawType === "tool_search_output" ||
    rawType === "shell_call_output" ||
    rawType === "computer_call_output" ||
    rawType === "computer_call_result" ||
    rawType === "apply_patch_call_output"
  );
}

function getRunItemRawItem(item: unknown) {
  return getObjectProperty(item, "rawItem") ?? item;
}

function normalizeRunItemMetadata(item: unknown, rawItem: unknown) {
  return normalizeMetadata({
    id: getObjectProperty(rawItem, "id"),
    status: getObjectProperty(rawItem, "status"),
    providerData: getObjectProperty(rawItem, "providerData"),
    agent: normalizeAgentMetadata(getObjectProperty(item, "agent")),
    itemType: getObjectProperty(item, "type"),
    rawType: getObjectProperty(rawItem, "type"),
  });
}

function resolveRawToolCallId(rawItem: unknown) {
  return (
    stringProperty(rawItem, "callId") ??
    stringProperty(rawItem, "call_id") ??
    stringProperty(rawItem, "id")
  );
}

function resolveRunItemToolCallId(item: unknown, rawItem: unknown) {
  return (
    resolveRawToolCallId(rawItem) ??
    stringProperty(item, "callId") ??
    stringProperty(item, "call_id") ??
    stringProperty(item, "id")
  );
}

function resolveRawToolName(rawItem: unknown) {
  const rawType = stringProperty(rawItem, "type");
  if (rawType === "tool_search_call" || rawType === "tool_search_output") {
    return "tool_search";
  }

  return (
    stringProperty(rawItem, "name") ??
    stringProperty(rawItem, "toolName") ??
    stringProperty(rawItem, "namespace") ??
    rawType ??
    "unknown"
  );
}

function normalizeArguments(
  value: unknown,
): Record<string, JsonValue> | undefined {
  const parsed = parseMaybeJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed === undefined
      ? undefined
      : { input: normalizeContent(parsed) };
  }

  return normalizeRecord(parsed as Record<string, unknown>);
}

function normalizeReplayToolInput(value: unknown): JsonValue {
  const parsed = parseMaybeJson(value);
  return toReplayJsonValue(parsed, "OpenAI Agents tool input");
}

function normalizeToolOutputError(output: unknown): NormalizedError {
  return {
    message: resolveToolOutputErrorMessage(output),
  };
}

function resolveToolOutputErrorMessage(output: unknown) {
  if (typeof output === "string") {
    return output.length > 0 ? output : "Tool call failed";
  }

  const message =
    stringProperty(output, "message") ??
    stringProperty(output, "error") ??
    stringProperty(output, "text") ??
    extractText(output);
  if (message && message.length > 0) {
    return message;
  }

  const normalized = toJsonValue(output);
  return normalized === undefined
    ? "Tool call failed"
    : JSON.stringify(normalized);
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeError(error: unknown): NormalizedError {
  const serialized = serializeError(error);
  const { message, type, ...details } = serialized;

  return {
    ...details,
    message: typeof message === "string" ? message : String(message),
    ...(typeof type === "string" ? { type } : {}),
  };
}

function toReplayJsonValue(value: unknown, label: string): JsonValue {
  const normalized = toJsonValue(value);
  if (normalized === undefined) {
    throw new Error(
      `Tool replay only supports JSON-serializable values. ${label} could not be normalized.`,
    );
  }

  return normalized;
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const parts = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return undefined;
      }

      return (
        stringProperty(entry, "text") ??
        stringProperty(entry, "refusal") ??
        stringProperty(entry, "transcript")
      );
    })
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("") : undefined;
}

function resolveProvider(result: unknown) {
  return (
    stringProperty(result, "provider") ??
    stringProperty(getObjectProperty(result, "model"), "provider") ??
    stringProperty(getObjectProperty(result, "lastAgent"), "provider") ??
    stringProperty(
      getObjectProperty(getObjectProperty(result, "lastAgent"), "model"),
      "provider",
    )
  );
}

function resolveModel(result: unknown) {
  const directModel = getObjectProperty(result, "model");
  const lastAgentModel = getObjectProperty(
    getObjectProperty(result, "lastAgent"),
    "model",
  );

  return (
    stringProperty(result, "model") ??
    stringProperty(directModel, "modelId") ??
    stringProperty(directModel, "id") ??
    (typeof lastAgentModel === "string" ? lastAgentModel : undefined) ??
    stringProperty(lastAgentModel, "modelId") ??
    stringProperty(lastAgentModel, "id")
  );
}

function normalizeAgentMetadata(agent: unknown) {
  if (!agent || typeof agent !== "object") {
    return undefined;
  }

  return normalizeMetadata({
    name: getObjectProperty(agent, "name"),
    model: resolveModel({ lastAgent: agent }),
  });
}

function getObjectProperty(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  const property = getObjectProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function numberProperty(value: unknown, key: string): number | undefined {
  const property = getObjectProperty(value, key);
  return typeof property === "number" ? property : undefined;
}

function arrayProperty(value: unknown, key: string): unknown[] | undefined {
  const property = getObjectProperty(value, key);
  return Array.isArray(property) ? property : undefined;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value && typeof (value as { then?: unknown }).then === "function",
  );
}
