import {
  attachHarnessRunToError,
  isHarnessRun,
  isNormalizedSession,
  resolveHarnessRunErrors,
  serializeError,
} from "vitest-evals";
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

type MaybePromise<T> = T | Promise<T>;
type AgentSource<TAgent> = TAgent | (() => MaybePromise<TAgent>);

export type PiAiReplayMode = ReplayMode;

export interface PiAiEventSink {
  message: (message: NormalizedMessage) => void;
  system: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  user: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  assistant: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  tool: (
    name: string,
    content: JsonValue,
    metadata?: Record<string, JsonValue>,
  ) => void;
}

export interface PiAiToolContext<
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> {
  input: TInput;
  caseData: TCase;
  signal?: AbortSignal;
  setArtifact: HarnessContext<TCase>["setArtifact"];
}

export type PiAiToolRecording<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
> = ToolRecording<TArgs, TResult>;

export type PiAiToolReplayConfig<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = ToolReplayConfig<TArgs, TResult, PiAiToolContext<TInput, TCase>>;

export interface PiAiToolDefinition<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> {
  description?: string;
  replay?: boolean | PiAiToolReplayConfig<TArgs, TResult, TInput, TCase>;
  execute: (
    args: TArgs,
    context: PiAiToolContext<TInput, TCase>,
  ) => MaybePromise<TResult>;
}

export type PiAiToolset<
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = Record<string, PiAiToolDefinition<any, any, TInput, TCase>>;

type ToolArgs<TTool> = TTool extends PiAiToolDefinition<
  infer TArgs,
  any,
  any,
  any
>
  ? TArgs
  : never;

type ToolResult<TTool> = TTool extends PiAiToolDefinition<
  any,
  infer TResult,
  any,
  any
>
  ? TResult
  : never;

export type PiAiRuntime<
  TTools extends PiAiToolset<TInput, TCase>,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = {
  tools: {
    [K in keyof TTools]: (
      args: ToolArgs<TTools[K]>,
    ) => Promise<ToolResult<TTools[K]>>;
  };
  events: PiAiEventSink;
  signal?: AbortSignal;
};

export interface PiAiHarnessRunArgs<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TTools extends PiAiToolset<TInput, TCase>,
> {
  agent: TAgent | undefined;
  input: TInput;
  context: HarnessContext<TCase>;
  runtime: PiAiRuntime<TTools, TInput, TCase>;
}

export interface PiAiHarnessResultArgs<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
> extends PiAiHarnessRunArgs<TAgent, TInput, TCase, TTools> {
  result: TResult;
}

export type PiAiHarnessOptions<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
> = PiAiHarnessBaseOptions<TAgent, TInput, TCase, TResult, TTools> &
  (
    | {
        agent: AgentSource<TAgent>;
        task?: never;
      }
    | {
        task: (
          args: PiAiHarnessRunArgs<TAgent, TInput, TCase, TTools>,
        ) => MaybePromise<TResult | HarnessRun>;
        agent?: never;
      }
  );

interface PiAiHarnessBaseOptions<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
> {
  tools?: TTools;
  session?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<NormalizedSession>;
  output?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<JsonValue | undefined>;
  usage?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<UsageSummary>;
  timings?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<TimingSummary | undefined>;
  errors?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<Array<Record<string, JsonValue>>>;
  name?: string;
}

export function piAiHarness<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
): Harness<TInput, TCase, TAgent> {
  validateOptions(options);

  return {
    name: options.name ?? "pi-ai",
    setup: async () => {
      const agent = await resolveAgent(options);
      return {
        agent,
        run: (input, context) => runPiAiHarness(options, agent, input, context),
      };
    },
    run: async (input, context) => {
      const agent = await resolveAgent(options);
      return runPiAiHarness(options, agent, input, context);
    },
  };
}

async function runPiAiHarness<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  agent: TAgent | undefined,
  input: TInput,
  context: HarnessContext<TCase>,
): Promise<HarnessRun> {
  const messages: NormalizedMessage[] = [
    {
      role: "user",
      content: normalizeContent(input),
    },
  ];

  const runtime = createRuntime({
    input,
    context,
    tools: options.tools,
    messages,
  });

  try {
    const result = await runAgent(options, {
      agent,
      input,
      context,
      runtime,
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
      runtime,
      result,
    } satisfies PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>;

    const output = options.output
      ? await options.output(resultArgs)
      : resolveOutput(result);
    const usage = options.usage
      ? await options.usage(resultArgs)
      : resolveUsage(result, runtime.toolCalls.length);
    const session = options.session
      ? await options.session(resultArgs)
      : resolveSession(result, messages, output, usage);

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
    const usage = resolveUsage(undefined, runtime.toolCalls.length);
    const run = {
      session: resolveSession(undefined, messages, undefined, usage),
      output: undefined,
      usage,
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors: [serializeError(error)],
    } satisfies HarnessRun;

    throw attachHarnessRunToError(error, run);
  }
}

async function resolveAgent<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
  if (!hasAgentSource(options)) {
    return undefined;
  }

  return resolveAgentSource(options.agent);
}

async function runAgent<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  args: PiAiHarnessRunArgs<TAgent, TInput, TCase, TTools>,
): Promise<TResult | HarnessRun> {
  if (options.task) {
    return options.task(args);
  }

  if (hasCallableMethod(args.agent, "run")) {
    return (
      args.agent as {
        run: (
          input: TInput,
          runtime: PiAiRuntime<TTools, TInput, TCase>,
        ) => MaybePromise<TResult | HarnessRun>;
      }
    ).run(args.input, args.runtime);
  }

  throw new Error(
    "piAiHarness agent must expose run(input, runtime), or use task() for a custom entrypoint.",
  );
}

function validateOptions<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
  const hasAgent = hasAgentSource(options);
  const hasTask = typeof (options as { task?: unknown }).task === "function";

  if (hasAgent && hasTask) {
    throw new Error(
      "piAiHarness accepts either agent or task, not both. Use agent for the zero-glue run(input, runtime) path, or task for a custom entrypoint.",
    );
  }

  if (!hasAgent && !hasTask) {
    throw new Error(
      "piAiHarness requires either agent or task. Use agent for objects with run(input, runtime), or task for a custom entrypoint.",
    );
  }
}

function hasAgentSource<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
): options is PiAiHarnessBaseOptions<TAgent, TInput, TCase, TResult, TTools> & {
  agent: AgentSource<TAgent>;
} {
  return "agent" in options && options.agent !== undefined;
}

async function resolveAgentSource<TAgent>(
  agent: AgentSource<TAgent>,
): Promise<TAgent> {
  if (typeof agent === "function" && !hasCallableMethod(agent, "run")) {
    return (agent as () => MaybePromise<TAgent>)();
  }

  return agent as TAgent;
}

function hasCallableMethod(value: unknown, methodName: string) {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    methodName in value &&
    typeof (value as Record<string, unknown>)[methodName] === "function"
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}

function normalizeContent(value: unknown): JsonValue {
  if (isJsonValue(value)) {
    return value;
  }

  return String(value);
}

function createRuntime<
  TInput,
  TCase extends HarnessCase<TInput>,
  TTools extends PiAiToolset<TInput, TCase>,
>({
  input,
  context,
  tools,
  messages,
}: {
  input: TInput;
  context: HarnessContext<TCase>;
  tools: TTools | undefined;
  messages: NormalizedMessage[];
}) {
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
    tool: (name, content, metadata) => {
      messages.push({
        role: "tool",
        content,
        metadata: {
          name,
          ...(metadata ?? {}),
        },
      });
    },
  };

  const runtimeTools = Object.fromEntries(
    Object.entries(tools ?? {}).map(([toolName, tool]) => [
      toolName,
      async (args: Record<string, JsonValue>) => {
        const startedAt = new Date();
        const toolContext = {
          input,
          caseData: context.caseData,
          signal: context.signal,
          setArtifact: context.setArtifact,
        } satisfies PiAiToolContext<TInput, TCase>;

        try {
          const execution = await executeToolWithReplay({
            toolName,
            tool,
            args,
            context: toolContext,
          });
          const finishedAt = new Date();
          const call = {
            name: toolName,
            arguments: args,
            result: execution.result,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            metadata: normalizeReplayMetadata(execution.replay),
          } satisfies ToolCallRecord;
          toolCalls.push(call);
          messages.push({
            role: "assistant",
            toolCalls: [call],
          });
          messages.push({
            role: "tool",
            content: execution.result,
            metadata: {
              name: toolName,
            },
          });
          return execution.result;
        } catch (error) {
          const finishedAt = new Date();
          const call = {
            name: toolName,
            arguments: args,
            error: serializeToolError(error),
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            metadata: normalizeReplayMetadata(
              getReplayMetadataFromError(error),
            ),
          } satisfies ToolCallRecord;
          toolCalls.push(call);
          messages.push({
            role: "assistant",
            toolCalls: [call],
          });
          throw error;
        }
      },
    ]),
  ) as unknown as PiAiRuntime<TTools, TInput, TCase>["tools"];

  return {
    tools: runtimeTools,
    events: eventSink,
    signal: context.signal,
    toolCalls,
  };
}

function resolveOutput(result: unknown): JsonValue | undefined {
  if (!result || typeof result !== "object") {
    return isJsonValue(result) ? result : undefined;
  }

  const candidates = [
    "output",
    "decision",
    "result",
    "final",
  ] satisfies string[];

  for (const key of candidates) {
    const value = (result as Record<string, unknown>)[key];
    if (isJsonValue(value)) {
      return value;
    }
  }

  return undefined;
}

function resolveUsage(result: unknown, toolCallCount: number): UsageSummary {
  if (!result || typeof result !== "object") {
    return toolCallCount > 0 ? { toolCalls: toolCallCount } : {};
  }

  const usageValue =
    (result as Record<string, unknown>).usage ??
    (result as Record<string, unknown>).metrics;

  const usage =
    usageValue && typeof usageValue === "object"
      ? ({ ...(usageValue as Record<string, unknown>) } as UsageSummary)
      : {};

  if (usage.toolCalls === undefined && toolCallCount > 0) {
    usage.toolCalls = toolCallCount;
  }

  return usage;
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
    outputText: typeof output === "string" ? output : undefined,
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

async function executeToolWithReplay<
  TArgs extends Record<string, JsonValue>,
  TResult extends JsonValue,
  TInput,
  TCase extends HarnessCase<TInput>,
>({
  toolName,
  tool,
  args,
  context,
}: {
  toolName: string;
  tool: PiAiToolDefinition<TArgs, TResult, TInput, TCase>;
  args: TArgs;
  context: PiAiToolContext<TInput, TCase>;
}) {
  return executeWithReplay({
    toolName,
    args,
    context,
    execute: tool.execute,
    replay: tool.replay,
  });
}

function serializeToolError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      type: error.name,
    };
  }

  return {
    message: String(error),
    type: "Error",
  };
}
