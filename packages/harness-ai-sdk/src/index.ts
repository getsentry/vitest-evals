import { attachHarnessRunToError } from "vitest-evals";
import type {
  Harness,
  HarnessCase,
  HarnessContext,
  HarnessRun,
  JsonValue,
  NormalizedMessage,
  NormalizedSession,
  TimingSummary,
  ToolCallRecord,
  UsageSummary,
} from "vitest-evals";
import type { LanguageModelUsage, StepResult, ToolSet } from "ai";

type MaybePromise<T> = T | Promise<T>;

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

export interface AiSdkHarnessRunArgs<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
> {
  agent: TAgent | undefined;
  input: TInput;
  context: HarnessContext<TCase>;
}

export interface AiSdkHarnessResultArgs<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
> extends AiSdkHarnessRunArgs<TAgent, TInput, TCase> {
  result: TResult;
}

export interface AiSdkHarnessOptions<
  TAgent = unknown,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
> {
  agent?: TAgent;
  createAgent?: () => MaybePromise<TAgent>;
  run?: (
    args: AiSdkHarnessRunArgs<TAgent, TInput, TCase>,
  ) => MaybePromise<TResult | HarnessRun>;
  session?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult>,
  ) => MaybePromise<NormalizedSession>;
  output?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult>,
  ) => MaybePromise<JsonValue | undefined>;
  usage?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult>,
  ) => MaybePromise<UsageSummary>;
  timings?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult>,
  ) => MaybePromise<TimingSummary | undefined>;
  errors?: (
    args: AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult>,
  ) => MaybePromise<Array<Record<string, JsonValue>>>;
  name?: string;
}

export function aiSdkHarness<
  TAgent = unknown,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult>,
): Harness<TInput, TCase> {
  return {
    name: options.name ?? "ai-sdk",
    run: async (input, context) => {
      const agent = await resolveAgent(options);

      try {
        const result = await runAgent(options, {
          agent,
          input,
          context,
        });

        if (isHarnessRun(result)) {
          if (Object.keys(context.artifacts).length > 0 && !result.artifacts) {
            result.artifacts = context.artifacts;
          }
          return result;
        }

        const resultArgs = {
          agent,
          input,
          context,
          result,
        } satisfies AiSdkHarnessResultArgs<TAgent, TInput, TCase, TResult>;

        const output = options.output
          ? await options.output(resultArgs)
          : resolveOutput(result);
        const usage = options.usage
          ? await options.usage(resultArgs)
          : resolveUsage(result);
        const session = options.session
          ? await options.session(resultArgs)
          : resolveSession(input, result, output);

        return {
          session,
          output,
          usage,
          timings: options.timings
            ? await options.timings(resultArgs)
            : undefined,
          artifacts:
            Object.keys(context.artifacts).length > 0
              ? context.artifacts
              : undefined,
          errors: options.errors
            ? await options.errors(resultArgs)
            : resolveErrors(result),
        };
      } catch (error) {
        const run = {
          session: resolveSession(input, undefined, undefined),
          output: undefined,
          usage: {},
          artifacts:
            Object.keys(context.artifacts).length > 0
              ? context.artifacts
              : undefined,
          errors: [serializeError(error)],
        } satisfies HarnessRun;

        throw attachHarnessRunToError(error, run);
      }
    },
  };
}

async function resolveAgent<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
>(options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult>) {
  if (options.agent !== undefined) {
    return options.agent;
  }

  if (options.createAgent) {
    return options.createAgent();
  }

  return undefined;
}

async function runAgent<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
>(
  options: AiSdkHarnessOptions<TAgent, TInput, TCase, TResult>,
  args: AiSdkHarnessRunArgs<TAgent, TInput, TCase>,
): Promise<TResult | HarnessRun> {
  if (options.run) {
    return options.run(args);
  }

  if (
    args.agent &&
    typeof args.agent === "object" &&
    "run" in args.agent &&
    typeof (args.agent as { run?: unknown }).run === "function"
  ) {
    return (
      args.agent as {
        run: (input: TInput) => MaybePromise<TResult | HarnessRun>;
      }
    ).run(args.input);
  }

  if (
    args.agent &&
    typeof args.agent === "object" &&
    "generate" in args.agent &&
    typeof (args.agent as { generate?: unknown }).generate === "function"
  ) {
    return (
      args.agent as {
        generate: (input: TInput) => MaybePromise<TResult | HarnessRun>;
      }
    ).generate(args.input);
  }

  throw new Error(
    "aiSdkHarness requires a run() function unless the provided agent exposes run(input) or generate(input).",
  );
}

function isHarnessRun(value: unknown): value is HarnessRun {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "session" in value &&
    "usage" in value &&
    "errors" in value &&
    Array.isArray((value as HarnessRun).errors)
  );
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

function resolveUsage(result: unknown): UsageSummary {
  const steps = resolveSteps(result);
  const usage = resolveLanguageModelUsage(result);
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;

  if (!usage) {
    return steps.length > 0
      ? {
          provider: lastStep?.model.provider,
          model: lastStep?.model.modelId,
          toolCalls: steps.reduce(
            (count, step) => count + (step.toolCalls?.length ?? 0),
            0,
          ),
        }
      : {};
  }

  const toolCallCount = steps.reduce(
    (count, step) => count + (step.toolCalls?.length ?? 0),
    0,
  );

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

function resolveSession(
  input: unknown,
  result: unknown,
  output: JsonValue | undefined,
): NormalizedSession {
  if (
    looksLikeSession((result as Record<string, unknown> | undefined)?.session)
  ) {
    return (result as { session: NormalizedSession }).session;
  }

  if (
    looksLikeSession((result as Record<string, unknown> | undefined)?.trace)
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
    messages.push(...normalizeStep(step));
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

function resolveErrors(result: unknown): Array<Record<string, JsonValue>> {
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as Record<string, unknown>).errors)
  ) {
    return (result as { errors: Array<Record<string, JsonValue>> }).errors;
  }

  return [];
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

function normalizeStep(step: StepLike): NormalizedMessage[] {
  const toolResultsById = new Map(
    (step.toolResults ?? []).map((toolResult) => [
      toolResult.toolCallId,
      toolResult,
    ]),
  );

  const normalizedCalls = (step.toolCalls ?? []).map((toolCall) =>
    normalizeToolCall(toolCall, toolResultsById),
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
): ToolCallRecord {
  const toolResult = toolResultsById.get(toolCall.toolCallId);
  const errorValue =
    toolCall.invalid || toolCall.error !== undefined
      ? normalizeError(toolCall.error)
      : undefined;

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

function normalizeRecord(
  value: Record<string, unknown>,
): Record<string, JsonValue> | undefined {
  const entries = Object.entries(value).flatMap(([key, entryValue]) => {
    const normalized = toJsonValue(entryValue);
    return normalized === undefined ? [] : [[key, normalized] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeMetadata(
  value: Record<string, unknown>,
): Record<string, JsonValue> | undefined {
  return normalizeRecord(value);
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

function serializeError(error: unknown): Record<string, JsonValue> {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
    };
  }

  return {
    type: "Error",
    message: String(error),
  };
}

function normalizeContent(value: unknown): JsonValue {
  return toJsonValue(value) ?? String(value);
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const normalizedItems = value.flatMap((item) => {
      const normalized = toJsonValue(item);
      return normalized === undefined ? [] : [normalized];
    });
    return normalizedItems;
  }

  if (typeof value === "object" && value !== null) {
    return normalizeRecord(value as Record<string, unknown>);
  }

  return undefined;
}

function looksLikeSession(value: unknown): value is NormalizedSession {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "messages" in value &&
    Array.isArray((value as { messages?: unknown[] }).messages)
  );
}
