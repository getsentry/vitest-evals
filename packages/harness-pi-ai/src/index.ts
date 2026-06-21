import type {
  Harness,
  HarnessContext,
  HarnessRun,
  JsonValue,
  NormalizedError,
  NormalizedMessage,
  NormalizedSpan,
  NormalizedSession,
  NormalizedTrace,
  TimingSummary,
  ToolCallRecord,
  UsageSummary,
} from "vitest-evals/harness";
import {
  attachHarnessRunToError,
  createFailedHarnessRun,
  createGenAiUsageAttributes,
  ensureRunTrace,
  getHarnessRunFromError,
  isHarnessRun,
  isNormalizedSession,
  normalizeMetadata,
  normalizeContent,
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
import {
  createJudgeHarness,
  type JudgeHarnessInput,
} from "vitest-evals/judges";
import { completeSimple } from "@mariozechner/pi-ai";
import type {
  Api,
  AssistantMessage,
  Model,
  SimpleStreamOptions,
} from "@mariozechner/pi-ai";

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
type AgentSource<TAgent, TInput = string> =
  | TAgent
  | ((args: PiAiCreateAgentArgs<TInput>) => MaybePromise<TAgent>);
type AnyPiAiToolset<TInput = string> = Record<
  string,
  PiAiToolDefinition<any, any, TInput>
>;

let nextTraceId = 0;

/**
 * Configuration for adapting a Pi AI model into a judge harness.
 *
 * @example
 * ```ts
 * import { getModel } from "@mariozechner/pi-ai";
 * import { piAiJudgeHarness } from "@vitest-evals/harness-pi-ai";
 *
 * const judgeHarness = piAiJudgeHarness({
 *   model: getModel("anthropic", "claude-sonnet-4-5"),
 *   temperature: 0,
 * });
 * ```
 */
export interface PiAiJudgeHarnessConfig<TApi extends Api = Api> {
  /** Pi AI model used for judge prompts. */
  model: Model<TApi>;
  /** Optional display name for diagnostics. */
  name?: string;
  /** Optional judge-model temperature. */
  temperature?: number;
  /** Optional judge-model token cap. */
  maxOutputTokens?: number;
  /** Additional Pi AI stream options forwarded to `completeSimple(...)`. */
  options?: Omit<SimpleStreamOptions, "signal" | "temperature" | "maxTokens">;
}

/**
 * Adapts a Pi AI model into the provider-neutral judge harness API.
 *
 * @example
 * ```ts
 * import { getModel } from "@mariozechner/pi-ai";
 * import { piAiJudgeHarness } from "@vitest-evals/harness-pi-ai";
 * import { describeEval, FactualityJudge } from "vitest-evals";
 *
 * const judgeHarness = piAiJudgeHarness({
 *   model: getModel("anthropic", "claude-sonnet-4-5"),
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
export function piAiJudgeHarness<TApi extends Api>(
  config: PiAiJudgeHarnessConfig<TApi>,
) {
  return createJudgeHarness({
    name: config.name ?? "pi-ai",
    run: async ({ responseFormat, system, prompt }, { signal }) => {
      const message = await completeSimple(
        config.model,
        {
          systemPrompt: formatPiAiJudgeSystemPrompt(system, responseFormat),
          messages: [
            {
              role: "user",
              content: prompt,
              timestamp: Date.now(),
            },
          ],
        },
        {
          ...(config.options ?? {}),
          ...(config.temperature !== undefined
            ? { temperature: config.temperature }
            : {}),
          ...(config.maxOutputTokens !== undefined
            ? { maxTokens: config.maxOutputTokens }
            : {}),
          ...(signal ? { signal } : {}),
        },
      );

      return resolvePiAiJudgeText(message);
    },
  });
}

function formatPiAiJudgeSystemPrompt(
  system: string | undefined,
  responseFormat: JudgeHarnessInput["responseFormat"],
) {
  if (responseFormat?.type !== "json") {
    return system;
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

function resolvePiAiJudgeText(message: AssistantMessage) {
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    throw new Error(message.errorMessage ?? "Pi AI judge harness failed.");
  }

  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

type InferredPiAiToolset<TInput = string> = Record<
  string,
  PiAiToolDefinition<Record<string, JsonValue>, JsonValue, TInput>
>;

type PiAgentToolLike<TInput = string> = {
  name: string;
  execute: (toolCallId: string, args: Record<string, JsonValue>) => unknown;
};

type PiAiResultOutput<TResult> = TResult extends HarnessRun<infer TOutput>
  ? TOutput
  : "output" extends keyof TResult
    ? ResultFieldOutput<TResult, "output">
    : undefined;
type PiAiAgentResult<
  TAgent,
  TInput,
  TTools extends PiAiToolset<TInput>,
> = TAgent extends {
  run: (
    input: TInput,
    runtime: PiAiRuntime<TTools, TInput>,
  ) => MaybePromise<infer TResult>;
}
  ? Awaited<TResult>
  : unknown;

const ORIGINAL_NATIVE_EXECUTE = Symbol("vitest-evals.originalNativeExecute");

type NativeToolExecute<TInput> = PiAgentToolLike<TInput>["execute"] & {
  [ORIGINAL_NATIVE_EXECUTE]?: PiAgentToolLike<TInput>["execute"];
};

/** Replay mode alias used by the Pi AI harness package. */
export type PiAiReplayMode = ReplayMode;

/** Event sink for recording Pi AI transcript messages. */
export interface PiAiEventSink {
  message: (message: NormalizedMessage) => void;
  system: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  user: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  assistant: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  /** Records a tool result message linked to an assistant tool call by id. */
  tool: (
    toolCallId: string,
    content: JsonValue,
    options?: {
      name?: string;
      error?: NormalizedError;
      metadata?: Record<string, JsonValue>;
    },
  ) => void;
}

/** Context passed to instrumented Pi AI tool executions. */
export interface PiAiToolContext<TInput = string> {
  input: TInput;
  signal?: AbortSignal;
  setArtifact: HarnessContext["setArtifact"];
}

/** Tool replay recording shape for Pi AI tools. */
export type PiAiToolRecording<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
> = ToolRecording<TArgs, TResult>;

/** Replay configuration for a Pi AI tool. */
export type PiAiToolReplayConfig<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
> = ToolReplayConfig<TArgs, TResult, PiAiToolContext<TInput>>;

/** Replay policy for one Pi AI tool. */
export type PiAiToolReplayPolicy<TInput = string> =
  | boolean
  | PiAiToolReplayConfig<Record<string, JsonValue>, JsonValue, TInput>;

/** Replay policy map keyed by Pi AI tool name. */
export type PiAiToolReplayPolicies<TInput = string> = Record<
  string,
  PiAiToolReplayPolicy<TInput>
>;

/** Tool definition accepted by the Pi AI harness runtime. */
export interface PiAiToolDefinition<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
> {
  description?: string;
  execute: (
    args: TArgs,
    context: PiAiToolContext<TInput>,
  ) => MaybePromise<TResult>;
}

/** Toolset shape accepted by the Pi AI harness. */
export type PiAiToolset<TInput = string> = AnyPiAiToolset<TInput>;

type ToolArgs<TTool> = TTool extends PiAiToolDefinition<
  infer TArgs,
  infer _TResult,
  infer _TInput
>
  ? TArgs
  : never;

type ToolResult<TTool> = TTool extends PiAiToolDefinition<
  infer _TArgs,
  infer TResult,
  infer _TInput
>
  ? TResult
  : never;

/** Runtime object passed into Pi AI agent entrypoints. */
export type PiAiRuntime<TTools extends PiAiToolset<TInput>, TInput = string> = {
  tools: {
    [K in keyof TTools]: (
      args: ToolArgs<TTools[K]>,
    ) => Promise<ToolResult<TTools[K]>>;
  };
  events: PiAiEventSink;
  signal?: AbortSignal;
};

/** Arguments passed to custom Pi AI harness run callbacks. */
export interface PiAiHarnessRunArgs<
  TAgent,
  TInput,
  TTools extends PiAiToolset<TInput>,
> {
  agent: TAgent;
  input: TInput;
  context: HarnessContext;
  runtime: PiAiRuntime<TTools, TInput>;
}

/** Arguments passed to Pi AI harness output selectors. */
export interface PiAiHarnessResultArgs<
  TAgent,
  TInput,
  TResult,
  TTools extends PiAiToolset<TInput>,
> extends PiAiHarnessRunArgs<TAgent, TInput, TTools> {
  result: TResult;
}

/** Arguments passed to per-run Pi AI agent factories. */
export interface PiAiCreateAgentArgs<TInput = string> {
  input: TInput;
  context: HarnessContext;
}

interface PiAiHarnessBaseOptions<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> {
  agent: AgentSource<TAgent, TInput>;
  toolReplay?: PiAiToolReplayPolicies<TInput>;
  output?: PiAiHarnessOutputSelector<TAgent, TInput, TResult, TTools, TOutput>;
  name?: string;
}

interface PiAiHarnessWithToolsOptions<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> extends PiAiHarnessBaseOptions<TAgent, TInput, TResult, TTools, TOutput> {
  tools: TTools;
  run?: (
    args: PiAiHarnessRunArgs<TAgent, TInput, TTools>,
  ) => MaybePromise<TResult | HarnessRun<TOutput>>;
}

interface PiAiHarnessInferredToolsOptions<
  TAgent,
  TInput = string,
  TResult = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> extends PiAiHarnessBaseOptions<
    TAgent,
    TInput,
    TResult,
    InferredPiAiToolset<TInput>,
    TOutput
  > {
  tools?: undefined;
  run?: (
    args: PiAiHarnessRunArgs<TAgent, TInput, InferredPiAiToolset<TInput>>,
  ) => MaybePromise<TResult | HarnessRun<TOutput>>;
}

type PiAiHarnessOptions<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> =
  | PiAiHarnessWithToolsOptions<TAgent, TInput, TResult, TTools, TOutput>
  | PiAiHarnessInferredToolsOptions<TAgent, TInput, TResult, TOutput>;

type PiAiHarnessWithToolsOptionsWithOutput<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = PiAiHarnessWithToolsOptions<TAgent, TInput, TResult, TTools, TOutput> & {
  output: PiAiHarnessOutputSelector<TAgent, TInput, TResult, TTools, TOutput>;
};

type PiAiHarnessInferredToolsOptionsWithOutput<
  TAgent,
  TInput = string,
  TResult = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = PiAiHarnessInferredToolsOptions<TAgent, TInput, TResult, TOutput> & {
  output: PiAiHarnessOutputSelector<
    TAgent,
    TInput,
    TResult,
    InferredPiAiToolset<TInput>,
    TOutput
  >;
};

type PiAiHarnessWithToolsRunOptionsWithoutOutput<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
> = PiAiHarnessBaseOptions<
  TAgent,
  TInput,
  TResult,
  TTools,
  JsonValue | undefined
> & {
  tools: TTools;
  run: (
    args: PiAiHarnessRunArgs<TAgent, TInput, TTools>,
  ) => MaybePromise<TResult>;
  output?: never;
};

type PiAiHarnessWithToolsAgentOptionsWithoutOutput<
  TAgent,
  TInput = string,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
> = PiAiHarnessBaseOptions<
  TAgent,
  TInput,
  unknown,
  TTools,
  JsonValue | undefined
> & {
  tools: TTools;
  run?: never;
  output?: never;
};

type PiAiHarnessInferredToolsRunOptionsWithoutOutput<
  TAgent,
  TInput = string,
  TResult = unknown,
> = PiAiHarnessBaseOptions<
  TAgent,
  TInput,
  TResult,
  InferredPiAiToolset<TInput>,
  JsonValue | undefined
> & {
  tools?: undefined;
  run: (
    args: PiAiHarnessRunArgs<TAgent, TInput, InferredPiAiToolset<TInput>>,
  ) => MaybePromise<TResult>;
  output?: never;
};

type PiAiHarnessInferredToolsAgentOptionsWithoutOutput<
  TAgent,
  TInput = string,
> = PiAiHarnessBaseOptions<
  TAgent,
  TInput,
  unknown,
  InferredPiAiToolset<TInput>,
  JsonValue | undefined
> & {
  tools?: undefined;
  run?: never;
  output?: never;
};

type PiAiHarnessRunOptions<
  TAgent,
  TInput,
  TResult,
  TTools extends PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined,
> = PiAiHarnessBaseOptions<TAgent, TInput, TResult, TTools, TOutput> & {
  run?: (
    args: PiAiHarnessRunArgs<TAgent, TInput, TTools>,
  ) => MaybePromise<TResult | HarnessRun<TOutput>>;
};

type PiAiRunnableAgent<
  TInput,
  TResult,
  TOutput extends JsonValue | undefined,
  TTools extends PiAiToolset<TInput>,
> = {
  run: (
    input: TInput,
    runtime: PiAiRuntime<TTools, TInput>,
  ) => MaybePromise<TResult | HarnessRun<TOutput>>;
};

type PiAiHarnessOutputSelector<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = (
  args: PiAiHarnessResultArgs<TAgent, TInput, TResult, TTools>,
) => MaybePromise<TOutput>;

type InferredToolSurfaces<TInput> = {
  runtimeTools?: InferredPiAiToolset<TInput>;
  nativeToolsets?: Array<PiAgentToolLike<TInput>[]>;
};

type PiToolExecutionState = {
  activeNativeToolNames: Map<string, number>;
};

/** Adapts a Pi agent runtime into a normalized vitest-evals harness. */
export function piAiHarness<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
>(
  options: PiAiHarnessWithToolsOptionsWithOutput<
    TAgent,
    TInput,
    TResult,
    TTools,
    TOutput
  >,
): Harness<TInput, TOutput>;
export function piAiHarness<
  TAgent,
  TInput = string,
  TResult = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
>(
  options: PiAiHarnessInferredToolsOptionsWithOutput<
    TAgent,
    TInput,
    TResult,
    TOutput
  >,
): Harness<TInput, TOutput>;
export function piAiHarness<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
>(
  options: PiAiHarnessWithToolsRunOptionsWithoutOutput<
    TAgent,
    TInput,
    TResult,
    TTools
  >,
): Harness<TInput, PiAiResultOutput<Awaited<TResult>>>;
export function piAiHarness<
  TAgent,
  TInput = string,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
>(
  options: PiAiHarnessWithToolsAgentOptionsWithoutOutput<
    TAgent,
    TInput,
    TTools
  >,
): Harness<TInput, PiAiResultOutput<PiAiAgentResult<TAgent, TInput, TTools>>>;
export function piAiHarness<TAgent, TInput = string, TResult = unknown>(
  options: PiAiHarnessInferredToolsRunOptionsWithoutOutput<
    TAgent,
    TInput,
    TResult
  >,
): Harness<TInput, PiAiResultOutput<Awaited<TResult>>>;
export function piAiHarness<TAgent, TInput = string>(
  options: PiAiHarnessInferredToolsAgentOptionsWithoutOutput<TAgent, TInput>,
): Harness<
  TInput,
  PiAiResultOutput<PiAiAgentResult<TAgent, TInput, InferredPiAiToolset<TInput>>>
>;
export function piAiHarness<
  TAgent,
  TInput = string,
  TResult = unknown,
  TTools extends PiAiToolset<TInput> = PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TResult, TTools, TOutput>,
): Harness<TInput, TOutput> {
  validateOptions(options);

  const harnessName = options.name ?? "pi-ai";
  const harness: Harness<TInput, TOutput> = {
    name: harnessName,
    run: async (input, context) => {
      const startedAt = new Date();

      try {
        const agent = await resolveAgent(options, {
          input,
          context,
        });
        const messages: NormalizedMessage[] = [
          {
            role: "user",
            content: normalizeContent(input),
          },
        ];
        const inferredTools = resolveInferredToolSurfaces<TInput>(agent);

        if (hasExplicitToolset(options)) {
          return await executePiHarnessRun(
            options,
            agent,
            input,
            context,
            messages,
            options.tools,
            inferredTools.nativeToolsets,
          );
        }

        return await executePiHarnessRun(
          options,
          agent,
          input,
          context,
          messages,
          inferredTools.runtimeTools,
          inferredTools.nativeToolsets,
        );
      } catch (error) {
        if (getHarnessRunFromError(error)) {
          throw error;
        }

        throw attachHarnessRunToError(
          error,
          createFailedPiAiRun(input, context, error, harnessName, startedAt),
        );
      }
    },
  };

  return harness;
}

function createFailedPiAiRun<TInput>(
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
    source: "harness-pi-ai",
  });

  return run;
}

function validateOptions<
  TAgent,
  TInput,
  TResult,
  TTools extends PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined,
>(options: PiAiHarnessOptions<TAgent, TInput, TResult, TTools, TOutput>) {
  if (options.agent === undefined) {
    throw new Error(
      "piAiHarness requires agent. Pass an agent instance or an agent factory.",
    );
  }
}

async function executePiHarnessRun<
  TAgent,
  TInput,
  TResult,
  TTools extends PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined,
>(
  options: PiAiHarnessRunOptions<TAgent, TInput, TResult, TTools, TOutput>,
  agent: TAgent,
  input: TInput,
  context: HarnessContext,
  messages: NormalizedMessage[],
  runtimeTools: TTools | undefined,
  nativeToolsets?: Array<PiAgentToolLike<TInput>[]>,
): Promise<HarnessRun<TOutput>> {
  const trace = createTraceRecorder(options.name ?? "pi-ai");
  const executionState = createPiToolExecutionState();
  const runtime = createRuntime({
    input,
    context,
    tools: runtimeTools,
    toolReplay: options.toolReplay,
    executionState,
    messages,
  });

  try {
    const result = await withInstrumentedAgentTools(
      agent,
      nativeToolsets,
      {
        input,
        context,
        messages,
        toolCalls: runtime.toolCalls,
        toolReplay: options.toolReplay,
        executionState,
      },
      () =>
        runAgent(options, {
          agent,
          input,
          context,
          runtime,
        }),
    );

    if (isHarnessRun(result) && !hasOutputSelector(options)) {
      if (Object.keys(context.artifacts).length > 0 && !result.artifacts) {
        result.artifacts = context.artifacts;
      }
      attachPiAiTrace(result, trace, new Date());
      return result;
    }

    const normalizeResult = result as TResult;
    const resultArgs = {
      agent,
      input,
      context,
      runtime,
      result: normalizeResult,
    } satisfies PiAiHarnessResultArgs<TAgent, TInput, TResult, TTools>;

    const output = options.output
      ? await options.output(resultArgs)
      : (resolveOutput(normalizeResult) as TOutput | undefined);
    const usage = resolveUsage(normalizeResult, runtime.toolCalls.length);
    const session = resolveSession(normalizeResult, messages, output, usage);
    const errors = resolveErrors(normalizeResult);
    const finishedAt = new Date();

    return {
      session,
      output,
      usage,
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors,
      traces: [
        finishPiAiTrace(trace, {
          session,
          usage,
          errors,
          finishedAt,
        }),
      ],
    } as HarnessRun<TOutput>;
  } catch (error) {
    const usage = resolveUsage(undefined, runtime.toolCalls.length);
    const session = resolveSession(undefined, messages, undefined, usage);
    const finishedAt = new Date();
    const serializedError = serializeError(error);
    const run = {
      session,
      output: undefined,
      usage,
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors: [serializedError],
      traces: [
        finishPiAiTrace(trace, {
          session,
          usage,
          errors: [serializedError],
          finishedAt,
        }),
      ],
    } satisfies HarnessRun;

    throw attachHarnessRunToError(error, run);
  }
}

async function resolveAgent<
  TAgent,
  TInput,
  TResult,
  TTools extends PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TResult, TTools, TOutput>,
  args: PiAiCreateAgentArgs<TInput>,
) {
  return resolveAgentSource(options.agent, args);
}

async function resolveAgentSource<TAgent, TInput>(
  agent: AgentSource<TAgent, TInput>,
  args: PiAiCreateAgentArgs<TInput>,
): Promise<TAgent> {
  if (isAgentFactory(agent)) {
    return agent(args);
  }

  return agent;
}

function isAgentFactory<TAgent, TInput>(
  agent: AgentSource<TAgent, TInput>,
): agent is (args: PiAiCreateAgentArgs<TInput>) => MaybePromise<TAgent> {
  return typeof agent === "function" && !hasPiAiRunMethod(agent);
}

function hasOutputSelector<
  TAgent,
  TInput,
  TResult,
  TTools extends PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined,
>(options: PiAiHarnessRunOptions<TAgent, TInput, TResult, TTools, TOutput>) {
  return Boolean(options.output);
}

type TraceRecorder = {
  id: string;
  rootSpanId: string;
  name: string;
  startedAt: Date;
};

function createTraceRecorder(name: string): TraceRecorder {
  const id = `pi_ai_trace_${++nextTraceId}`;

  return {
    id,
    rootSpanId: `${id}:run`,
    name,
    startedAt: new Date(),
  };
}

function attachPiAiTrace(
  run: HarnessRun,
  trace: TraceRecorder,
  finishedAt: Date,
) {
  const nativeTrace = finishPiAiTrace(trace, {
    session: run.session,
    usage: run.usage,
    errors: run.errors ?? [],
    finishedAt,
  });

  run.traces = [...(run.traces ?? []), nativeTrace];
}

function finishPiAiTrace(
  trace: TraceRecorder,
  options: {
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
      ...createGenAiUsageAttributes(options.usage),
    }),
  };
  const modelSpan = createUsageModelSpan(trace, options.usage);
  const spans = [rootSpan, ...(modelSpan ? [modelSpan] : [])];

  return {
    id: trace.id,
    name: trace.name,
    startedAt: trace.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    metadata: {
      source: "harness-pi-ai",
    },
    spans,
  };
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
    name: usage.model ? `pi-ai ${usage.model}` : "pi-ai model",
    kind: "model",
    status: "ok",
    attributes: normalizeSpanAttributes({
      "gen_ai.operation.name": "chat",
      ...createGenAiUsageAttributes(usage),
    }),
  };
}

function resolveInferredToolSurfaces<TInput>(
  agent: unknown,
): InferredToolSurfaces<TInput> {
  let runtimeTools: InferredPiAiToolset<TInput> | undefined;
  const nativeToolsets: Array<PiAgentToolLike<TInput>[]> = [];
  const seenToolsets = new Set<PiAgentToolLike<TInput>[]>();

  for (const candidate of getAgentToolCandidates(agent)) {
    const nextRuntimeTools = getRuntimeToolset<TInput>(candidate);
    if (runtimeTools === undefined && nextRuntimeTools !== undefined) {
      runtimeTools = nextRuntimeTools;
    }

    const nativeTools = getNativeToolArray(candidate);
    if (nativeTools && !seenToolsets.has(nativeTools)) {
      seenToolsets.add(nativeTools);
      nativeToolsets.push(nativeTools);
    }
  }

  return {
    ...(runtimeTools ? { runtimeTools } : {}),
    ...(nativeToolsets.length > 0 ? { nativeToolsets } : {}),
  };
}

function getAgentToolCandidates(agent: unknown): object[] {
  const roots = getAgentRoots(agent);
  const candidates: object[] = [];
  const seen = new Set<object>();

  for (const root of roots) {
    addUniqueObject(candidates, seen, root);
    addUniqueObject(candidates, seen, getObjectProperty(root, "state"));
    addUniqueObject(candidates, seen, getObjectProperty(root, "initialState"));
  }

  return candidates;
}

function getAgentRoots(agent: unknown): object[] {
  return [asObject(agent)]
    .concat(asObject(getObjectProperty(agent, "agent")))
    .filter((value): value is object => value !== undefined);
}

function addUniqueObject(
  candidates: object[],
  seen: Set<object>,
  value: unknown,
) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }

  seen.add(value);
  candidates.push(value);
}

function asObject(value: unknown): object | undefined {
  return value && typeof value === "object" ? value : undefined;
}

function getObjectProperty(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function getRuntimeToolset<TInput>(
  value: object,
): InferredPiAiToolset<TInput> | undefined {
  const candidate =
    getObjectProperty(value, "tools") ?? getObjectProperty(value, "toolset");

  return isPiAiToolset(candidate)
    ? (candidate as InferredPiAiToolset<TInput>)
    : undefined;
}

function getNativeToolArray<TInput>(
  value: object,
): PiAgentToolLike<TInput>[] | undefined {
  const candidate = getObjectProperty(value, "tools");
  if (isAgentToolArray(candidate)) {
    return candidate as PiAgentToolLike<TInput>[];
  }

  return undefined;
}

async function runAgent<
  TAgent,
  TInput,
  TResult,
  TTools extends PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined,
>(
  options: PiAiHarnessRunOptions<TAgent, TInput, TResult, TTools, TOutput>,
  args: PiAiHarnessRunArgs<TAgent, TInput, TTools>,
): Promise<TResult | HarnessRun<TOutput>> {
  if (options.run) {
    return options.run(args);
  }

  if (hasPiAiRunMethod<TInput, TResult, TOutput, TTools>(args.agent)) {
    return args.agent.run(args.input, args.runtime);
  }

  throw new Error(
    "piAiHarness requires a run() function unless the provided agent exposes run(input, runtime).",
  );
}

function hasExplicitToolset<
  TAgent,
  TInput,
  TResult,
  TTools extends PiAiToolset<TInput>,
  TOutput extends JsonValue | undefined,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TResult, TTools, TOutput>,
): options is PiAiHarnessWithToolsOptions<
  TAgent,
  TInput,
  TResult,
  TTools,
  TOutput
> {
  return options.tools !== undefined;
}

function hasPiAiRunMethod<
  TInput,
  TResult,
  TOutput extends JsonValue | undefined,
  TTools extends PiAiToolset<TInput>,
>(
  agent: unknown,
): agent is PiAiRunnableAgent<TInput, TResult, TOutput, TTools> {
  if (!agent || (typeof agent !== "object" && typeof agent !== "function")) {
    return false;
  }

  return (
    "run" in agent && typeof (agent as { run?: unknown }).run === "function"
  );
}

function isPiAiToolset(value: unknown): value is PiAiToolset {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const tools = Object.values(value);
  return (
    tools.length > 0 &&
    tools.every((tool) =>
      Boolean(
        tool &&
          typeof tool === "object" &&
          "execute" in tool &&
          typeof (tool as { execute?: unknown }).execute === "function",
      ),
    )
  );
}

function isAgentToolArray(value: unknown): value is PiAgentToolLike[] {
  return (
    Array.isArray(value) &&
    value.every((tool) =>
      Boolean(
        tool &&
          typeof tool === "object" &&
          "name" in tool &&
          typeof (tool as { name?: unknown }).name === "string" &&
          "execute" in tool &&
          typeof (tool as { execute?: unknown }).execute === "function",
      ),
    )
  );
}

async function withInstrumentedAgentTools<TResult, TInput>(
  agent: unknown,
  toolsets: Array<PiAgentToolLike<TInput>[]> | undefined,
  args: {
    input: TInput;
    context: HarnessContext;
    messages: NormalizedMessage[];
    toolCalls: ToolCallRecord[];
    toolReplay: PiAiToolReplayPolicies<TInput> | undefined;
    executionState: PiToolExecutionState;
  },
  callback: () => Promise<TResult>,
) {
  if (!toolsets || toolsets.length === 0) {
    return callback();
  }

  const originalExecutions = new Map<
    PiAgentToolLike<TInput>,
    PiAgentToolLike<TInput>["execute"]
  >();
  const originalResets = new Map<ResettableAgent, ResettableAgent["reset"]>();

  const patchTool = (tool: PiAgentToolLike<TInput>) => {
    if (originalExecutions.has(tool)) {
      return;
    }

    const originalExecute = getNativeToolExecuteOrigin(tool.execute);
    originalExecutions.set(tool, originalExecute);
    const instrumentedExecute: NativeToolExecute<TInput> = async (
      toolCallId: string,
      rawArgs: Record<string, JsonValue>,
    ) => {
      const startedAt = new Date();
      const toolContext = {
        input: args.input,
        signal: args.context.signal,
        setArtifact: args.context.setArtifact,
      } satisfies PiAiToolContext<TInput>;
      const leaveNativeTool = enterNativeToolExecution(
        args.executionState,
        tool.name,
      );
      const call: ToolCallRecord = {
        id: toolCallId,
        name: tool.name,
        arguments: rawArgs,
        startedAt: startedAt.toISOString(),
        metadata: normalizeReplayMetadata(undefined),
      } satisfies ToolCallRecord;
      args.toolCalls.push(call);
      args.messages.push({
        role: "assistant",
        toolCalls: [call],
      });

      try {
        const execution = await executeNativeToolWithReplay({
          toolName: tool.name,
          toolCallId,
          execute: originalExecute,
          replay: args.toolReplay?.[tool.name],
          args: rawArgs,
          context: toolContext,
        });
        const finishedAt = new Date();
        call.finishedAt = finishedAt.toISOString();
        call.durationMs = finishedAt.getTime() - startedAt.getTime();
        call.metadata = normalizeReplayMetadata(execution.replay);
        args.messages.push({
          role: "tool",
          toolCallId,
          name: tool.name,
          content: execution.normalizedResult,
          startedAt: call.startedAt,
          finishedAt: call.finishedAt,
          durationMs: call.durationMs,
        });
        return execution.result;
      } catch (error) {
        const finishedAt = new Date();
        call.finishedAt = finishedAt.toISOString();
        call.durationMs = finishedAt.getTime() - startedAt.getTime();
        call.metadata = normalizeReplayMetadata(
          getReplayMetadataFromError(error),
        );
        args.messages.push({
          role: "tool",
          toolCallId,
          name: tool.name,
          error: serializeToolCallError(error),
          startedAt: call.startedAt,
          finishedAt: call.finishedAt,
          durationMs: call.durationMs,
        });
        throw error;
      } finally {
        leaveNativeTool();
      }
    };
    instrumentedExecute[ORIGINAL_NATIVE_EXECUTE] = originalExecute;
    tool.execute = instrumentedExecute;
  };

  const patchToolsets = (nextToolsets: Array<PiAgentToolLike<TInput>[]>) => {
    for (const toolset of nextToolsets) {
      for (const tool of toolset) {
        patchTool(tool);
      }
    }
  };

  patchToolsets(toolsets);

  for (const target of getAgentResetTargets(agent)) {
    const originalReset = target.reset;
    originalResets.set(target, originalReset);
    target.reset = function patchedReset(this: ResettableAgent, ...resetArgs) {
      const resetResult = originalReset.apply(this, resetArgs);

      if (isPromiseLike(resetResult)) {
        return resetResult.finally(() => {
          patchToolsets(resolveInferredNativeToolsets<TInput>(agent));
        });
      }

      patchToolsets(resolveInferredNativeToolsets<TInput>(agent));
      return resetResult;
    };
  }

  try {
    return await callback();
  } finally {
    for (const [target, originalReset] of originalResets) {
      target.reset = originalReset;
    }

    for (const [tool, originalExecute] of originalExecutions) {
      tool.execute = originalExecute;
    }
  }
}

type ResettableAgent = {
  reset: (...args: unknown[]) => unknown;
};

function getAgentResetTargets(agent: unknown): ResettableAgent[] {
  return getAgentRoots(agent).filter(isResettableAgent);
}

function isResettableAgent(value: object): value is ResettableAgent {
  return "reset" in value && typeof value.reset === "function";
}

function resolveInferredNativeToolsets<TInput>(
  agent: unknown,
): Array<PiAgentToolLike<TInput>[]> {
  const toolsets: Array<PiAgentToolLike<TInput>[]> = [];
  const seenToolsets = new Set<PiAgentToolLike<TInput>[]>();

  for (const candidate of getAgentToolCandidates(agent)) {
    const nativeTools = getNativeToolArray(candidate);
    if (nativeTools && !seenToolsets.has(nativeTools)) {
      seenToolsets.add(nativeTools);
      toolsets.push(nativeTools);
    }
  }

  return toolsets;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value && typeof (value as { then?: unknown }).then === "function",
  );
}

function serializeToolCallError(error: unknown): NormalizedError {
  const serialized = serializeError(error);
  const { message, type, ...details } = serialized;

  return {
    ...details,
    message: typeof message === "string" ? message : String(message),
    ...(typeof type === "string" ? { type } : {}),
  };
}

/** Creates a runtime-local id used on both assistant tool calls and tool results. */
function createRuntimeToolCallId(toolName: string, index: number) {
  return `runtime:${toolName}:${index + 1}`;
}

function getNativeToolExecuteOrigin<TInput>(
  execute: PiAgentToolLike<TInput>["execute"],
) {
  const nativeExecute = execute as NativeToolExecute<TInput>;
  return nativeExecute[ORIGINAL_NATIVE_EXECUTE] ?? nativeExecute;
}

function createPiToolExecutionState(): PiToolExecutionState {
  return {
    activeNativeToolNames: new Map(),
  };
}

function enterNativeToolExecution(
  state: PiToolExecutionState,
  toolName: string,
) {
  state.activeNativeToolNames.set(
    toolName,
    (state.activeNativeToolNames.get(toolName) ?? 0) + 1,
  );

  return () => {
    const nextCount = (state.activeNativeToolNames.get(toolName) ?? 1) - 1;
    if (nextCount <= 0) {
      state.activeNativeToolNames.delete(toolName);
      return;
    }

    state.activeNativeToolNames.set(toolName, nextCount);
  };
}

function hasActiveNativeToolExecution(
  state: PiToolExecutionState,
  toolName: string,
) {
  return (state.activeNativeToolNames.get(toolName) ?? 0) > 0;
}

async function executeNativeToolWithReplay<TInput>({
  toolName,
  toolCallId,
  execute,
  replay,
  args,
  context,
}: {
  toolName: string;
  toolCallId: string;
  execute: PiAgentToolLike<TInput>["execute"];
  replay: PiAiToolReplayPolicy<TInput> | undefined;
  args: Record<string, JsonValue>;
  context: PiAiToolContext<TInput>;
}) {
  let didExecute = false;
  let liveResult: unknown;

  const execution = await executeWithReplay({
    toolName: createNativeReplayToolName(toolName),
    args,
    context,
    execute: async (toolArgs) => {
      didExecute = true;
      liveResult = await execute(toolCallId, toolArgs);
      return createNativeToolReplayEnvelope(liveResult);
    },
    replay,
  });

  if (didExecute) {
    return {
      result: liveResult,
      normalizedResult: normalizeReplayToolResult(liveResult),
      replay: execution.replay,
    };
  }

  return {
    ...resolveNativeToolReplayResult(execution.result),
    replay: execution.replay,
  };
}

function createNativeReplayToolName(toolName: string) {
  return `${toolName}.native`;
}

function createRuntime<TInput, TTools extends PiAiToolset<TInput>>({
  input,
  context,
  tools,
  toolReplay,
  executionState,
  messages,
}: {
  input: TInput;
  context: HarnessContext;
  tools: TTools | undefined;
  toolReplay: PiAiToolReplayPolicies<TInput> | undefined;
  executionState: PiToolExecutionState;
  messages: NormalizedMessage[];
}): PiAiRuntime<TTools, TInput> & {
  toolCalls: ToolCallRecord[];
} {
  const toolCalls: ToolCallRecord[] = [];
  const eventSink: PiAiEventSink = {
    message: (message) => {
      messages.push(message);
    },
    system: (content, metadata) => {
      messages.push({
        role: "system",
        content,
        metadata,
      });
    },
    user: (content, metadata) => {
      messages.push({
        role: "user",
        content,
        metadata,
      });
    },
    assistant: (content, metadata) => {
      messages.push({
        role: "assistant",
        content,
        metadata,
      });
    },
    tool: (toolCallId, content, options) => {
      messages.push({
        role: "tool",
        toolCallId,
        ...(options?.name ? { name: options.name } : {}),
        content,
        ...(options?.error ? { error: options.error } : {}),
        ...(options?.metadata ? { metadata: options.metadata } : {}),
      });
    },
  };

  const runtimeTools = Object.fromEntries(
    Object.entries(tools ?? {}).map(([toolName, tool]) => [
      toolName,
      async (args: Record<string, JsonValue>) => {
        const startedAt = new Date();
        const isNativeImplementationCall = hasActiveNativeToolExecution(
          executionState,
          toolName,
        );
        const toolContext = {
          input,
          signal: context.signal,
          setArtifact: context.setArtifact,
        } satisfies PiAiToolContext<TInput>;
        const toolCallId = createRuntimeToolCallId(toolName, toolCalls.length);
        const call: ToolCallRecord = {
          id: toolCallId,
          name: toolName,
          arguments: args,
          startedAt: startedAt.toISOString(),
        } satisfies ToolCallRecord;

        try {
          if (!isNativeImplementationCall) {
            toolCalls.push(call);
            messages.push({
              role: "assistant",
              toolCalls: [call],
            });
          }

          const execution = await executeToolWithReplay({
            toolName,
            tool,
            replay: isNativeImplementationCall
              ? undefined
              : toolReplay?.[toolName],
            args,
            context: toolContext,
          });
          const finishedAt = new Date();

          if (isNativeImplementationCall) {
            return execution.result;
          }

          call.finishedAt = finishedAt.toISOString();
          call.durationMs = finishedAt.getTime() - startedAt.getTime();
          call.metadata = normalizeReplayMetadata(execution.replay);
          messages.push({
            role: "tool",
            toolCallId,
            name: toolName,
            content: execution.result,
            startedAt: call.startedAt,
            finishedAt: call.finishedAt,
            durationMs: call.durationMs,
          });
          return execution.result;
        } catch (error) {
          const finishedAt = new Date();
          if (isNativeImplementationCall) {
            throw error;
          }

          call.finishedAt = finishedAt.toISOString();
          call.durationMs = finishedAt.getTime() - startedAt.getTime();
          call.metadata = normalizeReplayMetadata(
            getReplayMetadataFromError(error),
          );
          messages.push({
            role: "tool",
            toolCallId,
            name: toolName,
            error: serializeToolCallError(error),
            startedAt: call.startedAt,
            finishedAt: call.finishedAt,
            durationMs: call.durationMs,
          });
          throw error;
        }
      },
    ]),
  ) as unknown as PiAiRuntime<TTools, TInput>["tools"];

  return {
    tools: runtimeTools,
    events: eventSink,
    signal: context.signal,
    toolCalls,
  };
}

function resolveOutput(result: unknown): JsonValue | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const candidates = ["output"] satisfies string[];
  const resultRecord = result as Record<string, unknown>;

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(resultRecord, key)) {
      return toOutputValue(resultRecord[key]);
    }
  }

  return undefined;
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

function normalizeToolResult(result: unknown): JsonValue | undefined {
  const details =
    result && typeof result === "object"
      ? toJsonValue((result as { details?: unknown }).details)
      : undefined;
  if (details !== undefined) {
    return details;
  }

  const normalized = toJsonValue(result);
  return normalized !== undefined
    ? normalized
    : result === undefined
      ? undefined
      : String(result);
}

function normalizeReplayToolResult(result: unknown): JsonValue {
  return normalizeToolResult(result) ?? null;
}

type NativeToolReplayEnvelope = {
  __vitestEvals: {
    kind: "pi-ai-native-tool-result";
    version: 2;
  };
  agentResult: JsonValue;
  normalizedResult: JsonValue;
};

type LegacyNativeToolReplayEnvelope = {
  __vitestEvals: {
    kind: "pi-ai-native-tool-result";
    version: 1;
  };
  normalizedResult: JsonValue;
  agentResult?: JsonValue;
};

function createNativeToolReplayEnvelope(
  result: unknown,
): NativeToolReplayEnvelope {
  const normalizedResult = normalizeReplayToolResult(result);

  const agentResult = toJsonValue(result);

  return {
    __vitestEvals: {
      kind: "pi-ai-native-tool-result",
      version: 2,
    },
    agentResult: agentResult !== undefined ? agentResult : normalizedResult,
    normalizedResult,
  };
}

function resolveNativeToolReplayResult(result: JsonValue) {
  if (isNativeToolReplayEnvelope(result)) {
    return {
      result: result.agentResult,
      normalizedResult: result.normalizedResult,
    };
  }

  if (isLegacyNativeToolReplayEnvelope(result)) {
    return {
      result: result.agentResult ?? result.normalizedResult,
      normalizedResult: result.normalizedResult,
    };
  }

  return {
    result,
    normalizedResult: normalizeReplayToolResult(result),
  };
}

function isNativeToolReplayEnvelope(
  value: unknown,
): value is NativeToolReplayEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "__vitestEvals" in value &&
      isNativeToolReplayMarker(
        (value as { __vitestEvals?: unknown }).__vitestEvals,
      ) &&
      "agentResult" in value &&
      "normalizedResult" in value,
  );
}

function isNativeToolReplayMarker(
  value: unknown,
): value is NativeToolReplayEnvelope["__vitestEvals"] {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      (value as { kind?: unknown }).kind === "pi-ai-native-tool-result" &&
      "version" in value &&
      (value as { version?: unknown }).version === 2,
  );
}

function isLegacyNativeToolReplayEnvelope(
  value: unknown,
): value is LegacyNativeToolReplayEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "__vitestEvals" in value &&
      isLegacyNativeToolReplayMarker(
        (value as { __vitestEvals?: unknown }).__vitestEvals,
      ) &&
      "normalizedResult" in value,
  );
}

function isLegacyNativeToolReplayMarker(
  value: unknown,
): value is LegacyNativeToolReplayEnvelope["__vitestEvals"] {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      (value as { kind?: unknown }).kind === "pi-ai-native-tool-result" &&
      "version" in value &&
      (value as { version?: unknown }).version === 1,
  );
}

function resolveUsage(result: unknown, toolCallCount: number): UsageSummary {
  if (!result || typeof result !== "object") {
    return toolCallCount > 0 ? { toolCalls: toolCallCount } : {};
  }

  const usageValue =
    (result as Record<string, unknown>).usage ??
    (result as Record<string, unknown>).metrics;

  if (
    !usageValue ||
    typeof usageValue !== "object" ||
    Array.isArray(usageValue)
  ) {
    return toolCallCount > 0 ? { toolCalls: toolCallCount } : {};
  }

  const usageRecord = usageValue as Record<string, unknown>;
  const usage: UsageSummary = {
    provider: stringField(usageRecord.provider),
    model: stringField(usageRecord.model),
    inputTokens: numberField(usageRecord.inputTokens),
    outputTokens: numberField(usageRecord.outputTokens),
    reasoningTokens: numberField(usageRecord.reasoningTokens),
    totalTokens: numberField(usageRecord.totalTokens),
    toolCalls: numberField(usageRecord.toolCalls),
    retries: numberField(usageRecord.retries),
    metadata: collectUsageMetadata(usageRecord),
  };

  if (usage.toolCalls === undefined && toolCallCount > 0) {
    usage.toolCalls = toolCallCount;
  }

  return usage;
}

function collectUsageMetadata(usage: Record<string, unknown>) {
  const metadata: Record<string, unknown> = {};
  const nestedMetadata = usage.metadata;
  if (
    nestedMetadata &&
    typeof nestedMetadata === "object" &&
    !Array.isArray(nestedMetadata)
  ) {
    Object.assign(metadata, nestedMetadata);
  }

  for (const [key, value] of Object.entries(usage)) {
    if (key === "metadata" || USAGE_SUMMARY_KEYS.has(key)) {
      continue;
    }
    metadata[key] = value;
  }

  return normalizeMetadata(metadata);
}

const USAGE_SUMMARY_KEYS = new Set([
  "provider",
  "model",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "totalTokens",
  "toolCalls",
  "retries",
]);

function stringField(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function resolveSession(
  result: unknown,
  messages: NormalizedMessage[],
  output: JsonValue | undefined,
  usage: UsageSummary,
): NormalizedSession {
  if (
    isNormalizedSession(
      (result as Record<string, unknown> | undefined)?.session,
    )
  ) {
    return (result as { session: NormalizedSession }).session;
  }

  if (
    isNormalizedSession((result as Record<string, unknown> | undefined)?.trace)
  ) {
    return (result as { trace: NormalizedSession }).trace;
  }

  const sessionMessages = [...messages];
  if (
    output !== undefined &&
    !sessionMessages.some(
      (message) =>
        message.role === "assistant" && message.content !== undefined,
    )
  ) {
    sessionMessages.push({
      role: "assistant",
      content: output,
    });
  }

  return {
    messages: sessionMessages,
    provider:
      ((result as Record<string, unknown> | undefined)?.provider as
        | string
        | undefined) ?? usage.provider,
    model:
      ((result as Record<string, unknown> | undefined)?.model as
        | string
        | undefined) ?? usage.model,
  };
}

function resolveErrors(result: unknown): Array<Record<string, JsonValue>> {
  return resolveHarnessRunErrors(result);
}

async function executeToolWithReplay<
  TArgs extends Record<string, JsonValue>,
  TResult extends JsonValue,
  TInput,
>({
  toolName,
  tool,
  replay,
  args,
  context,
}: {
  toolName: string;
  tool: PiAiToolDefinition<TArgs, TResult, TInput>;
  replay: PiAiToolReplayPolicy<TInput> | undefined;
  args: TArgs;
  context: PiAiToolContext<TInput>;
}) {
  return executeWithReplay<
    Record<string, JsonValue>,
    JsonValue,
    PiAiToolContext<TInput>
  >({
    toolName,
    args,
    context,
    execute: (toolArgs, toolContext) =>
      tool.execute(toolArgs as TArgs, toolContext),
    replay,
  });
}
