import {
  hasCallableMethod,
  isHarnessRun,
  isNormalizedSession,
  normalizeContent,
  normalizeMetadata,
  normalizeRecord,
  resolveHarnessRunErrors,
  serializeError,
  toJsonValue,
  attachHarnessRunToError,
} from "vitest-evals/harness";
import type {
  Harness,
  HarnessContext,
  HarnessMetadata,
  HarnessPrompt,
  HarnessRun,
  JsonValue,
  NormalizedMessage,
  NormalizedSession,
  TimingSummary,
  ToolCallRecord,
  UsageSummary,
} from "vitest-evals/harness";
import {
  executeWithReplay,
  getReplayMetadataFromError,
  normalizeReplayMetadata,
} from "vitest-evals/replay";
import type {
  ReplayMetadata,
  ReplayMode,
  ToolRecording,
  ToolReplayConfig,
} from "vitest-evals/replay";
import type {
  InferToolInput,
  InferToolOutput,
  LanguageModelUsage,
  StepResult,
  Tool,
  ToolExecuteFunction,
  ToolExecutionOptions,
  ToolSet,
} from "ai";

type MaybePromise<T> = T | Promise<T>;
type AgentSource<TAgent> = TAgent | (() => MaybePromise<TAgent>);
type AnyAiSdkToolset<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = Record<string, AiSdkToolDefinition<any, any, TInput, TMetadata>>;

type StepLike = Pick<
  StepResult<ToolSet>,
  | "content"
  | "finishReason"
  | "model"
  | "rawFinishReason"
  | "reasoningText"
  | "response"
  | "stepNumber"
  | "text"
  | "toolCalls"
  | "toolResults"
  | "usage"
>;

type AiSdkLikeResult = {
  steps?: StepLike[];
  usage?: LanguageModelUsage;
  totalUsage?: LanguageModelUsage;
  output?: unknown;
  object?: unknown;
  experimental_output?: unknown;
  result?: unknown;
  text?: string;
  session?: NormalizedSession;
  trace?: NormalizedSession;
  errors?: Array<Record<string, JsonValue>>;
};

export interface AiSdkToolContext<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  input: TInput;
  metadata: HarnessContext<TMetadata>["metadata"];
  signal?: AbortSignal;
  setArtifact: HarnessContext<TMetadata>["setArtifact"];
  execution: ToolExecutionOptions;
}

export type AiSdkReplayMode = ReplayMode;

export type AiSdkToolRecording<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
> = ToolRecording<TArgs, TResult>;

export type AiSdkToolReplayConfig<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = ToolReplayConfig<TArgs, TResult, AiSdkToolContext<TInput, TMetadata>>;

export type AiSdkToolDefinition<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
  _TInput = string,
  _TMetadata extends HarnessMetadata = HarnessMetadata,
> = Tool<TArgs, TResult>;

export type AiSdkToolReplayPolicy<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = boolean | AiSdkToolReplayConfig<JsonValue, JsonValue, TInput, TMetadata>;

export type AiSdkToolReplayPolicies<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = Record<string, AiSdkToolReplayPolicy<TInput, TMetadata>>;

export type AiSdkToolset<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = AnyAiSdkToolset<TInput, TMetadata>;

export type AiSdkRuntimeToolset<TTools extends AnyAiSdkToolset<any, any>> = {
  [K in keyof TTools]: TTools[K] extends AiSdkToolDefinition<
    infer TArgs extends JsonValue,
    infer TResult extends JsonValue,
    infer _TInput,
    infer _TMetadata
  >
    ? Omit<TTools[K], "execute"> & {
        execute?: ToolExecuteFunction<TArgs, TResult>;
      }
    : TTools[K];
};

export interface AiSdkRuntime<
  TTools extends AiSdkToolset<TInput, TMetadata>,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  tools: AiSdkRuntimeToolset<TTools>;
  signal?: AbortSignal;
}

export interface AiSdkHarnessRunArgs<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TTools extends AiSdkToolset<TInput, TMetadata>,
> {
  agent: TAgent | undefined;
  input: TInput;
  context: HarnessContext<TMetadata>;
  runtime: AiSdkRuntime<TTools, TInput, TMetadata>;
  tools: AiSdkRuntimeToolset<TTools>;
}

export interface AiSdkHarnessResultArgs<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
> extends AiSdkHarnessRunArgs<TAgent, TInput, TMetadata, TTools> {
  result: TResult;
}

export type AiSdkHarnessOptions<
  TAgent = unknown,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends AiSdkToolset<TInput, TMetadata> = AiSdkToolset<
    TInput,
    TMetadata
  >,
> = AiSdkHarnessBaseOptions<TAgent, TInput, TMetadata, TResult, TTools> &
  (
    | {
        agent: AgentSource<TAgent>;
        task?: never;
      }
    | {
        task: (
          args: AiSdkHarnessRunArgs<TAgent, TInput, TMetadata, TTools>,
        ) => MaybePromise<TResult | HarnessRun>;
        agent?: never;
      }
  );

interface AiSdkHarnessBaseOptions<
  TAgent = unknown,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends AiSdkToolset<TInput, TMetadata> = AiSdkToolset<
    TInput,
    TMetadata
  >,
> {
  tools?: TTools;
  toolReplay?: AiSdkToolReplayPolicies<TInput, TMetadata>;
  session?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<NormalizedSession>;
  output?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<JsonValue | undefined>;
  usage?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<UsageSummary>;
  timings?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<TimingSummary | undefined>;
  errors?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<Array<Record<string, JsonValue>>>;
  prompt: HarnessPrompt;
  name?: string;
}

type AiSdkRunnableAgent<
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
> = {
  run: (
    input: TInput,
    runtime: AiSdkRuntime<TTools, TInput, TMetadata>,
  ) => MaybePromise<TResult | HarnessRun>;
};

type AiSdkGeneratableAgent<
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
> = {
  generate: (
    input: TInput,
    runtime: AiSdkRuntime<TTools, TInput, TMetadata>,
  ) => MaybePromise<TResult | HarnessRun>;
};

type AiSdkResultOverrides<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
> = Pick<
  AiSdkHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
  "errors" | "output" | "session" | "timings" | "usage"
>;

export function aiSdkHarness<
  TAgent = unknown,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends AiSdkToolset<TInput, TMetadata> = AiSdkToolset<
    TInput,
    TMetadata
  >,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
): Harness<TInput, TMetadata> {
  validateOptions(options);

  return {
    name: options.name ?? "ai-sdk",
    prompt: options.prompt,
    run: async (input, context) => {
      const agent = await resolveAgent(options);
      return runAiSdkHarness(options, agent, input, context);
    },
  };
}

async function runAiSdkHarness<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
  agent: TAgent | undefined,
  input: TInput,
  context: HarnessContext<TMetadata>,
): Promise<HarnessRun> {
  const replayMetadataByToolCallId = new Map<string, ReplayMetadata>();
  const runtimeToolCalls: ToolCallRecord[] = [];
  const tools = createToolset({
    input,
    context,
    tools: options.tools,
    toolReplay: options.toolReplay,
    replayMetadataByToolCallId,
    runtimeToolCalls,
  });
  const runtime = {
    tools,
    signal: context.signal,
  } satisfies AiSdkRuntime<TTools, TInput, TMetadata>;

  try {
    const result = await runAgent(options, {
      agent,
      input,
      context,
      runtime,
      tools,
    });

    if (isHarnessRun(result) && !hasResultOverrides(options)) {
      if (Object.keys(context.artifacts).length > 0 && !result.artifacts) {
        result.artifacts = context.artifacts;
      }
      return result;
    }

    const resultArgs = {
      agent,
      input,
      context,
      runtime,
      tools,
      result: result as TResult,
    } satisfies AiSdkHarnessResultArgs<
      TAgent,
      TInput,
      TMetadata,
      TResult,
      TTools
    >;

    const output = options.output
      ? await options.output(resultArgs)
      : resolveOutput(result);
    const usage = options.usage
      ? await options.usage(resultArgs)
      : resolveUsage(result, runtimeToolCalls.length);
    const session = options.session
      ? await options.session(resultArgs)
      : resolveSession(
          input,
          result,
          output,
          replayMetadataByToolCallId,
          runtimeToolCalls,
        );

    return {
      session,
      output,
      usage,
      timings: options.timings ? await options.timings(resultArgs) : undefined,
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors: options.errors
        ? await options.errors(resultArgs)
        : resolveHarnessRunErrors(result),
    };
  } catch (error) {
    const run = {
      session: resolveSession(
        input,
        undefined,
        undefined,
        replayMetadataByToolCallId,
        runtimeToolCalls,
      ),
      output: undefined,
      usage:
        runtimeToolCalls.length > 0
          ? { toolCalls: runtimeToolCalls.length }
          : {},
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors: [serializeError(error)],
    } satisfies HarnessRun;

    throw attachHarnessRunToError(error, run);
  }
}

function hasResultOverrides<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>(options: AiSdkResultOverrides<TAgent, TInput, TMetadata, TResult, TTools>) {
  return Boolean(
    options.output ??
      options.session ??
      options.usage ??
      options.timings ??
      options.errors,
  );
}

async function resolveAgent<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>(options: AiSdkHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>) {
  return hasAgentSource(options)
    ? await resolveAgentSource(options.agent)
    : undefined;
}

async function runAgent<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
  args: AiSdkHarnessRunArgs<TAgent, TInput, TMetadata, TTools>,
): Promise<TResult | HarnessRun> {
  if (options.task) {
    return options.task(args);
  }

  if (hasAiSdkRunMethod<TInput, TMetadata, TResult, TTools>(args.agent)) {
    return args.agent.run(args.input, args.runtime);
  }

  if (hasAiSdkGenerateMethod<TInput, TMetadata, TResult, TTools>(args.agent)) {
    return args.agent.generate(args.input, args.runtime);
  }

  throw new Error(
    "aiSdkHarness agent must expose run(input, runtime) or generate(input, runtime), or use task() for a custom entrypoint.",
  );
}

function validateOptions<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>(options: AiSdkHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>) {
  const hasAgent = hasAgentSource(options);
  const hasTask = typeof (options as { task?: unknown }).task === "function";

  if (hasAgent && hasTask) {
    throw new Error(
      "aiSdkHarness accepts either agent or task, not both. Use agent for the zero-glue run(input, runtime) or generate(input, runtime) path, or task for a custom entrypoint.",
    );
  }

  if (!hasAgent && !hasTask) {
    throw new Error(
      "aiSdkHarness requires either agent or task. Use agent for objects with run(input, runtime) or generate(input, runtime), or task for a custom entrypoint.",
    );
  }
}

function hasAgentSource<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
): options is AiSdkHarnessBaseOptions<
  TAgent,
  TInput,
  TMetadata,
  TResult,
  TTools
> & { agent: AgentSource<TAgent> } {
  return "agent" in options && options.agent !== undefined;
}

async function resolveAgentSource<TAgent>(
  agent: AgentSource<TAgent>,
): Promise<TAgent> {
  if (isAgentFactory(agent)) {
    return agent();
  }

  return agent;
}

function hasAiSdkRunMethod<
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>(
  agent: unknown,
): agent is AiSdkRunnableAgent<TInput, TMetadata, TResult, TTools> {
  return hasCallableMethod(agent, "run");
}

function hasAiSdkGenerateMethod<
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>(
  agent: unknown,
): agent is AiSdkGeneratableAgent<TInput, TMetadata, TResult, TTools> {
  return hasCallableMethod(agent, "generate");
}

function isAgentFactory<TAgent>(
  agent: AgentSource<TAgent>,
): agent is () => MaybePromise<TAgent> {
  return (
    typeof agent === "function" &&
    !hasCallableMethod(agent, "run") &&
    !hasCallableMethod(agent, "generate")
  );
}

function createToolset<
  TInput,
  TMetadata extends HarnessMetadata,
  TTools extends AiSdkToolset<TInput, TMetadata>,
>({
  input,
  context,
  tools,
  toolReplay,
  replayMetadataByToolCallId,
  runtimeToolCalls,
}: {
  input: TInput;
  context: HarnessContext<TMetadata>;
  tools: TTools | undefined;
  toolReplay: AiSdkToolReplayPolicies<TInput, TMetadata> | undefined;
  replayMetadataByToolCallId: Map<string, ReplayMetadata>;
  runtimeToolCalls: ToolCallRecord[];
}) {
  return Object.fromEntries(
    Object.entries(tools ?? {}).map(([toolName, tool]) => {
      const replay = toolReplay?.[toolName];

      if (replay && !tool.execute) {
        throw new Error(
          `Tool replay requires execute() for ${toolName}. Provider-executed tools cannot be recorded automatically.`,
        );
      }

      if (!tool.execute) {
        return [toolName, tool];
      }

      const execute = tool.execute;
      const wrappedTool = {
        ...tool,
        execute: async (
          toolInput: InferToolInput<typeof tool>,
          execution: ToolExecutionOptions,
        ) => {
          const startedAt = new Date();
          const normalizedArgs = normalizeArguments(toolInput);
          const replayContext = {
            input,
            metadata: context.metadata,
            signal: context.signal,
            setArtifact: context.setArtifact,
            execution,
          } satisfies AiSdkToolContext<TInput, TMetadata>;

          try {
            const executionResult = replay
              ? await executeToolWithReplay({
                  toolName,
                  toolInput,
                  execute,
                  execution,
                  context: replayContext,
                  replay,
                })
              : {
                  result: await execute(toolInput, execution),
                  replay: undefined,
                };
            const finishedAt = new Date();
            const normalizedResult = toJsonValue(executionResult.result);
            const replayMetadata = normalizeReplayMetadata(
              executionResult.replay,
            );

            if (executionResult.replay) {
              replayMetadataByToolCallId.set(
                execution.toolCallId,
                executionResult.replay,
              );
            }

            runtimeToolCalls.push({
              id: execution.toolCallId,
              name: toolName,
              ...(normalizedArgs ? { arguments: normalizedArgs } : {}),
              ...(normalizedResult !== undefined
                ? { result: normalizedResult }
                : {}),
              startedAt: startedAt.toISOString(),
              finishedAt: finishedAt.toISOString(),
              durationMs: finishedAt.getTime() - startedAt.getTime(),
              ...(replayMetadata ? { metadata: replayMetadata } : {}),
            });

            return executionResult.result as InferToolOutput<typeof tool>;
          } catch (error) {
            const replay = getReplayMetadataFromError(error);
            const finishedAt = new Date();
            const replayMetadata = normalizeReplayMetadata(replay);

            if (replay) {
              replayMetadataByToolCallId.set(execution.toolCallId, replay);
            }

            runtimeToolCalls.push({
              id: execution.toolCallId,
              name: toolName,
              ...(normalizedArgs ? { arguments: normalizedArgs } : {}),
              error: normalizeError(error),
              startedAt: startedAt.toISOString(),
              finishedAt: finishedAt.toISOString(),
              durationMs: finishedAt.getTime() - startedAt.getTime(),
              ...(replayMetadata ? { metadata: replayMetadata } : {}),
            });
            throw error;
          }
        },
      } satisfies typeof tool;

      return [toolName, wrappedTool];
    }),
  ) as AiSdkRuntimeToolset<TTools>;
}

async function executeToolWithReplay<
  TInput,
  TMetadata extends HarnessMetadata,
  TTool extends AiSdkToolDefinition<any, any, TInput, TMetadata>,
>({
  toolName,
  toolInput,
  execute,
  execution,
  context,
  replay,
}: {
  toolName: string;
  toolInput: InferToolInput<TTool>;
  execute: NonNullable<TTool["execute"]>;
  execution: ToolExecutionOptions;
  context: AiSdkToolContext<TInput, TMetadata>;
  replay: AiSdkToolReplayPolicy<TInput, TMetadata>;
}) {
  const replayInput = toReplayJsonValue(toolInput, `${toolName} tool input`);

  return executeWithReplay<
    JsonValue,
    JsonValue,
    AiSdkToolContext<TInput, TMetadata>
  >({
    toolName,
    args: replayInput,
    context,
    execute: async (replayedInput) => {
      const output = await execute(
        replayedInput as InferToolInput<TTool>,
        execution,
      );

      if (isAsyncIterable(output)) {
        throw new Error(
          `Tool replay only supports JSON-serializable outputs. ${toolName} returned an async iterable.`,
        );
      }

      return toReplayJsonValue(output, `${toolName} tool output`);
    },
    replay,
  });
}

function resolveOutput(result: unknown): JsonValue | undefined {
  if (!result || typeof result !== "object") {
    return toJsonValue(result);
  }

  const candidates = [
    "output",
    "object",
    "experimental_output",
    "result",
    "text",
  ] satisfies string[];

  for (const key of candidates) {
    const value = (result as Record<string, unknown>)[key];
    const normalized = toJsonValue(value);
    if (normalized !== undefined) {
      return normalized;
    }
  }

  return undefined;
}

function resolveUsage(result: unknown, runtimeToolCallCount = 0): UsageSummary {
  const steps = resolveSteps(result);
  const usage = resolveLanguageModelUsage(result) ?? resolveStepUsage(steps);
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;

  if (!usage) {
    if (steps.length > 0) {
      const toolCallCount = countStepToolCalls(steps);

      return {
        provider: lastStep?.model.provider,
        model: lastStep?.model.modelId,
        ...(toolCallCount > 0 ? { toolCalls: toolCallCount } : {}),
      };
    }

    return runtimeToolCallCount > 0 ? { toolCalls: runtimeToolCallCount } : {};
  }

  const stepToolCallCount = countStepToolCalls(steps);
  const toolCallCount =
    stepToolCallCount > 0 ? stepToolCallCount : runtimeToolCallCount;

  return {
    provider: lastStep?.model.provider,
    model: lastStep?.model.modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens:
      usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens,
    totalTokens:
      usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    toolCalls: toolCallCount > 0 ? toolCallCount : undefined,
    metadata: normalizeMetadata({
      cacheReadTokens:
        usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens,
      cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
      raw: usage.raw,
    }),
  };
}

function resolveStepUsage(steps: StepLike[]): LanguageModelUsage | undefined {
  const usages = steps
    .map((step) => step.usage)
    .filter((usage): usage is LanguageModelUsage => Boolean(usage));

  if (usages.length === 0) {
    return undefined;
  }

  return usages.reduce(addLanguageModelUsage);
}

function addLanguageModelUsage(
  left: LanguageModelUsage,
  right: LanguageModelUsage,
): LanguageModelUsage {
  return {
    inputTokens: addTokenCounts(left.inputTokens, right.inputTokens),
    inputTokenDetails: {
      noCacheTokens: addTokenCounts(
        left.inputTokenDetails?.noCacheTokens,
        right.inputTokenDetails?.noCacheTokens,
      ),
      cacheReadTokens: addTokenCounts(
        left.inputTokenDetails?.cacheReadTokens,
        right.inputTokenDetails?.cacheReadTokens,
      ),
      cacheWriteTokens: addTokenCounts(
        left.inputTokenDetails?.cacheWriteTokens,
        right.inputTokenDetails?.cacheWriteTokens,
      ),
    },
    outputTokens: addTokenCounts(left.outputTokens, right.outputTokens),
    outputTokenDetails: {
      textTokens: addTokenCounts(
        left.outputTokenDetails?.textTokens,
        right.outputTokenDetails?.textTokens,
      ),
      reasoningTokens: addTokenCounts(
        left.outputTokenDetails?.reasoningTokens,
        right.outputTokenDetails?.reasoningTokens,
      ),
    },
    totalTokens: addTokenCounts(left.totalTokens, right.totalTokens),
    reasoningTokens: addTokenCounts(
      left.reasoningTokens,
      right.reasoningTokens,
    ),
    cachedInputTokens: addTokenCounts(
      left.cachedInputTokens,
      right.cachedInputTokens,
    ),
  };
}

function addTokenCounts(left: number | undefined, right: number | undefined) {
  return left == null && right == null ? undefined : (left ?? 0) + (right ?? 0);
}

function countStepToolCalls(steps: StepLike[]) {
  return steps.reduce(
    (count, step) => count + (step.toolCalls?.length ?? 0),
    0,
  );
}

function resolveSession(
  input: unknown,
  result: unknown,
  output: JsonValue | undefined,
  replayMetadataByToolCallId: Map<string, ReplayMetadata>,
  runtimeToolCalls: ToolCallRecord[] = [],
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

  const steps = resolveSteps(result);
  const messages: NormalizedMessage[] = [
    {
      role: "user",
      content: normalizeContent(input),
    },
  ];
  const stepToolCallIds = new Set<string>();

  for (const step of steps) {
    for (const toolCall of step.toolCalls ?? []) {
      stepToolCallIds.add(toolCall.toolCallId);
    }
    messages.push(...normalizeStep(step, replayMetadataByToolCallId));
  }

  const unmatchedRuntimeToolCalls = runtimeToolCalls.filter(
    (call) => call.id === undefined || !stepToolCallIds.has(call.id),
  );

  if (unmatchedRuntimeToolCalls.length > 0) {
    messages.push(...normalizeRuntimeToolCalls(unmatchedRuntimeToolCalls));
  }

  if (
    output !== undefined &&
    !messages.some(
      (message) =>
        message.role === "assistant" && message.content !== undefined,
    )
  ) {
    messages.push({
      role: "assistant",
      content: output,
    });
  }

  const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;
  const outputText = resolveOutputText(result, output, lastStep);

  return {
    messages,
    outputText,
    provider: lastStep?.model.provider,
    model: lastStep?.model.modelId,
  };
}

function normalizeRuntimeToolCalls(
  runtimeToolCalls: ToolCallRecord[],
): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [
    {
      role: "assistant",
      toolCalls: runtimeToolCalls,
    },
  ];

  for (const call of runtimeToolCalls) {
    if (call.result === undefined && !call.error) {
      continue;
    }

    const content =
      call.result !== undefined
        ? call.result
        : call.error && call.error.message.length > 0
          ? call.error.message
          : undefined;

    messages.push({
      role: "tool",
      ...(content !== undefined ? { content } : {}),
      metadata: normalizeMetadata({
        name: call.name,
        toolCallId: call.id,
        isError: Boolean(call.error),
      }),
    });
  }

  return messages;
}

function resolveSteps(result: unknown): StepLike[] {
  if (!result || typeof result !== "object") {
    return [];
  }

  return Array.isArray((result as AiSdkLikeResult).steps)
    ? ((result as AiSdkLikeResult).steps ?? [])
    : [];
}

function resolveLanguageModelUsage(
  result: unknown,
): LanguageModelUsage | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const aiResult = result as AiSdkLikeResult;
  return aiResult.totalUsage ?? aiResult.usage;
}

function resolveOutputText(
  result: unknown,
  output: JsonValue | undefined,
  lastStep: StepLike | undefined,
) {
  if (lastStep?.text) {
    return lastStep.text;
  }

  if (
    result &&
    typeof result === "object" &&
    typeof (result as AiSdkLikeResult).text === "string"
  ) {
    return (result as AiSdkLikeResult).text;
  }

  return typeof output === "string" ? output : undefined;
}

function normalizeStep(
  step: StepLike,
  replayMetadataByToolCallId: Map<string, ReplayMetadata>,
): NormalizedMessage[] {
  const toolResultsById = new Map(
    (step.toolResults ?? []).map((toolResult) => [
      toolResult.toolCallId,
      toolResult,
    ]),
  );

  const normalizedCalls = (step.toolCalls ?? []).map((toolCall) =>
    normalizeToolCall(toolCall, toolResultsById, replayMetadataByToolCallId),
  );
  const normalizedCallsById = new Map(
    normalizedCalls.map((toolCall) => [toolCall.id, toolCall]),
  );
  const assistantMetadata = normalizeMetadata({
    stepNumber: step.stepNumber,
    finishReason: step.finishReason,
    rawFinishReason: step.rawFinishReason,
    reasoningText: step.reasoningText,
    response: step.response,
  });
  const messages: NormalizedMessage[] = [];

  if (step.text || normalizedCalls.length > 0 || assistantMetadata) {
    messages.push({
      role: "assistant",
      ...(step.text ? { content: step.text } : {}),
      ...(normalizedCalls.length > 0 ? { toolCalls: normalizedCalls } : {}),
      ...(assistantMetadata ? { metadata: assistantMetadata } : {}),
    });
  }

  for (const toolResult of step.toolResults ?? []) {
    const content =
      toolResult.output === undefined
        ? undefined
        : normalizeContent(toolResult.output);
    messages.push({
      role: "tool",
      ...(content !== undefined ? { content } : {}),
      metadata: normalizeMetadata({
        name: toolResult.toolName,
        toolCallId: toolResult.toolCallId,
        isError: Boolean(normalizedCallsById.get(toolResult.toolCallId)?.error),
        preliminary: toolResult.preliminary,
        providerExecuted: toolResult.providerExecuted,
        title: toolResult.title,
        providerMetadata: toolResult.providerMetadata,
      }),
    });
  }

  return messages;
}

function normalizeToolCall(
  toolCall: StepLike["toolCalls"][number],
  toolResultsById: Map<string, StepLike["toolResults"][number]>,
  replayMetadataByToolCallId: Map<string, ReplayMetadata>,
): ToolCallRecord {
  const toolResult = toolResultsById.get(toolCall.toolCallId);
  const normalizedArguments = normalizeArguments(toolCall.input);
  const normalizedResult =
    toolResult !== undefined ? toJsonValue(toolResult.output) : undefined;
  const errorValue =
    toolCall.invalid || toolCall.error !== undefined
      ? normalizeError(toolCall.error ?? toolCall.invalid)
      : undefined;
  const replayMetadata = normalizeReplayMetadata(
    replayMetadataByToolCallId.get(toolCall.toolCallId),
  );

  return {
    id: toolCall.toolCallId,
    name: toolCall.toolName,
    ...(normalizedArguments ? { arguments: normalizedArguments } : {}),
    ...(toolResult && normalizedResult !== undefined
      ? { result: normalizedResult }
      : {}),
    ...(errorValue ? { error: errorValue } : {}),
    metadata: normalizeMetadata({
      providerExecuted:
        toolCall.providerExecuted ?? toolResult?.providerExecuted,
      title: toolCall.title ?? toolResult?.title,
      dynamic: toolCall.dynamic,
      invalid: toolCall.invalid,
      preliminary: toolResult?.preliminary,
      providerMetadata:
        toolCall.providerMetadata ?? toolResult?.providerMetadata,
      ...(replayMetadata ?? {}),
    }),
  };
}

function normalizeArguments(
  value: unknown,
): Record<string, JsonValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return normalizeRecord(value as Record<string, unknown>);
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
    };
  }

  const normalized = toJsonValue(error);
  if (
    normalized &&
    typeof normalized === "object" &&
    !Array.isArray(normalized) &&
    typeof normalized.message === "string"
  ) {
    return {
      message: normalized.message,
      type: typeof normalized.type === "string" ? normalized.type : "Error",
    };
  }

  return {
    type: "Error",
    message: String(error ?? "Unknown tool call error"),
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

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    Symbol.asyncIterator in value
  );
}
