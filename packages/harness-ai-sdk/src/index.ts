import {
  attachHarnessRunToError,
  hasCallableMethod,
  isHarnessRun,
  isNormalizedSession,
  normalizeContent,
  normalizeMetadata,
  normalizeRecord,
  resolveHarnessRunErrors,
  serializeError,
  toJsonValue,
} from "vitest-evals";
import type {
  Harness,
  HarnessCase,
  HarnessContext,
  HarnessPrompt,
  HarnessRun,
  JsonValue,
  NormalizedMessage,
  NormalizedSession,
  TimingSummary,
  ToolCallRecord,
  UsageSummary,
} from "vitest-evals";
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
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> {
  input: TInput;
  caseData: TCase;
  signal?: AbortSignal;
  setArtifact: HarnessContext<TCase>["setArtifact"];
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
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = ToolReplayConfig<TArgs, TResult, AiSdkToolContext<TInput, TCase>>;

export type AiSdkToolDefinition<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = Tool<TArgs, TResult> & {
  replay?: boolean | AiSdkToolReplayConfig<TArgs, TResult, TInput, TCase>;
};

export type AiSdkToolset<
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = Record<string, AiSdkToolDefinition<any, any, TInput, TCase>>;

export type AiSdkRuntimeToolset<TTools extends AiSdkToolset<any, any>> = {
  [K in keyof TTools]: TTools[K] extends AiSdkToolDefinition<
    infer TArgs extends JsonValue,
    infer TResult extends JsonValue,
    any,
    any
  >
    ? Omit<TTools[K], "execute"> & {
        execute?: ToolExecuteFunction<TArgs, TResult>;
      }
    : TTools[K];
};

export interface AiSdkRuntime<
  TTools extends AiSdkToolset<TInput, TCase>,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> {
  tools: AiSdkRuntimeToolset<TTools>;
  signal?: AbortSignal;
}

export interface AiSdkHarnessRunArgs<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TTools extends AiSdkToolset<TInput, TCase>,
> {
  agent: TAgent | undefined;
  input: TInput;
  context: HarnessContext<TCase>;
  runtime: AiSdkRuntime<TTools, TInput, TCase>;
  tools: AiSdkRuntimeToolset<TTools>;
}

export interface AiSdkHarnessResultArgs<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends AiSdkToolset<TInput, TCase>,
> extends AiSdkHarnessRunArgs<TAgent, TInput, TCase, TTools> {
  result: TResult;
}

export type AiSdkHarnessOptions<
  TAgent = unknown,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends AiSdkToolset<TInput, TCase> = AiSdkToolset<TInput, TCase>,
> = AiSdkHarnessBaseOptions<TAgent, TInput, TCase, TResult, TTools> &
  (
    | {
        agent: AgentSource<TAgent>;
        task?: never;
      }
    | {
        task: (
          args: AiSdkHarnessRunArgs<TAgent, TInput, TCase, TTools>,
        ) => MaybePromise<TResult | HarnessRun>;
        agent?: never;
      }
  );

interface AiSdkHarnessBaseOptions<
  TAgent = unknown,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends AiSdkToolset<TInput, TCase> = AiSdkToolset<TInput, TCase>,
> {
  tools?: TTools;
  session?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<NormalizedSession>;
  output?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<JsonValue | undefined>;
  usage?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<UsageSummary>;
  timings?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<TimingSummary | undefined>;
  errors?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<Array<Record<string, JsonValue>>>;
  prompt?: HarnessPrompt;
  name?: string;
}

export function aiSdkHarness<
  TAgent = unknown,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends AiSdkToolset<TInput, TCase> = AiSdkToolset<TInput, TCase>,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
): Harness<TInput, TCase, TAgent> {
  validateOptions(options);

  return {
    name: options.name ?? "ai-sdk",
    prompt: options.prompt,
    setup: () => createAiSdkHarnessExecution(options),
    run: async (input, context) => {
      const execution = await createAiSdkHarnessExecution(options);
      return execution.run(input, context);
    },
  };
}

async function createAiSdkHarnessExecution<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends AiSdkToolset<TInput, TCase>,
>(options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
  const agent = await resolveAgent(options);
  return {
    agent,
    run: (input: TInput, context: HarnessContext<TCase>) =>
      runAiSdkHarness(options, agent, input, context),
  };
}

async function runAiSdkHarness<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends AiSdkToolset<TInput, TCase>,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  agent: TAgent | undefined,
  input: TInput,
  context: HarnessContext<TCase>,
): Promise<HarnessRun> {
  const replayMetadataByToolCallId = new Map<string, ReplayMetadata>();
  const runtimeToolCalls: ToolCallRecord[] = [];
  const tools = createToolset({
    input,
    context,
    tools: options.tools,
    replayMetadataByToolCallId,
    runtimeToolCalls,
  });
  const runtime = {
    tools,
    signal: context.signal,
  } satisfies AiSdkRuntime<TTools, TInput, TCase>;

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
    } satisfies AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>;

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

function hasResultOverrides(
  options: Pick<
    AiSdkHarnessOptions<any, any, any, any, any>,
    "errors" | "output" | "session" | "timings" | "usage"
  >,
) {
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
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends AiSdkToolset<TInput, TCase>,
>(options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
  return hasAgentSource(options)
    ? await resolveAgentSource(options.agent)
    : undefined;
}

async function runAgent<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends AiSdkToolset<TInput, TCase>,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  args: AiSdkHarnessRunArgs<TAgent, TInput, TCase, TTools>,
): Promise<TResult | HarnessRun> {
  if (options.task) {
    return options.task(args);
  }

  if (hasCallableMethod(args.agent, "run")) {
    return (
      args.agent as {
        run: (
          input: TInput,
          runtime: AiSdkRuntime<TTools, TInput, TCase>,
        ) => MaybePromise<TResult | HarnessRun>;
      }
    ).run(args.input, args.runtime);
  }

  if (hasCallableMethod(args.agent, "generate")) {
    return (
      args.agent as {
        generate: (
          input: TInput,
          runtime: AiSdkRuntime<TTools, TInput, TCase>,
        ) => MaybePromise<TResult | HarnessRun>;
      }
    ).generate(args.input, args.runtime);
  }

  throw new Error(
    "aiSdkHarness agent must expose run(input, runtime) or generate(input, runtime), or use task() for a custom entrypoint.",
  );
}

function validateOptions<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends AiSdkToolset<TInput, TCase>,
>(options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
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
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends AiSdkToolset<TInput, TCase>,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
): options is AiSdkHarnessBaseOptions<
  TAgent,
  TInput,
  TCase,
  TResult,
  TTools
> & { agent: AgentSource<TAgent> } {
  return "agent" in options && options.agent !== undefined;
}

async function resolveAgentSource<TAgent>(
  agent: AgentSource<TAgent>,
): Promise<TAgent> {
  if (
    typeof agent === "function" &&
    !hasCallableMethod(agent, "run") &&
    !hasCallableMethod(agent, "generate")
  ) {
    return (agent as () => MaybePromise<TAgent>)();
  }

  return agent as TAgent;
}

function createToolset<
  TInput,
  TCase extends HarnessCase<TInput>,
  TTools extends AiSdkToolset<TInput, TCase>,
>({
  input,
  context,
  tools,
  replayMetadataByToolCallId,
  runtimeToolCalls,
}: {
  input: TInput;
  context: HarnessContext<TCase>;
  tools: TTools | undefined;
  replayMetadataByToolCallId: Map<string, ReplayMetadata>;
  runtimeToolCalls: ToolCallRecord[];
}) {
  return Object.fromEntries(
    Object.entries(tools ?? {}).map(([toolName, tool]) => {
      if (tool.replay && !tool.execute) {
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
            caseData: context.caseData,
            signal: context.signal,
            setArtifact: context.setArtifact,
            execution,
          } satisfies AiSdkToolContext<TInput, TCase>;

          try {
            const executionResult = tool.replay
              ? await executeToolWithReplay({
                  toolName,
                  toolInput,
                  execute,
                  execution,
                  context: replayContext,
                  replay: tool.replay,
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
  TCase extends HarnessCase<TInput>,
  TTool extends AiSdkToolDefinition<any, any, TInput, TCase>,
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
  context: AiSdkToolContext<TInput, TCase>;
  replay: NonNullable<TTool["replay"]>;
}) {
  const replayInput = toReplayJsonValue(
    toolInput,
    `${toolName} tool input`,
  ) as InferToolInput<TTool> & JsonValue;

  return executeWithReplay({
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

      return toReplayJsonValue(
        output,
        `${toolName} tool output`,
      ) as InferToolOutput<TTool> & JsonValue;
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

  for (const step of steps) {
    messages.push(...normalizeStep(step, replayMetadataByToolCallId));
  }

  if (steps.length === 0 && runtimeToolCalls.length > 0) {
    messages.push(...normalizeRuntimeToolCalls(runtimeToolCalls));
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

    messages.push({
      role: "tool",
      content: call.result ?? call.error?.message ?? "",
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
    messages.push({
      role: "tool",
      content: normalizeContent(toolResult.output),
      metadata: normalizeMetadata({
        name: toolResult.toolName,
        toolCallId: toolResult.toolCallId,
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
  const errorValue =
    toolCall.invalid || toolCall.error !== undefined
      ? normalizeError(toolCall.error)
      : undefined;
  const replayMetadata = normalizeReplayMetadata(
    replayMetadataByToolCallId.get(toolCall.toolCallId),
  );

  return {
    id: toolCall.toolCallId,
    name: toolCall.toolName,
    arguments: normalizeArguments(toolCall.input),
    ...(toolResult
      ? {
          result: toJsonValue(toolResult.output),
        }
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
