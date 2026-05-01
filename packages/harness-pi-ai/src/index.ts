import { attachHarnessRunToError } from "vitest-evals";
import type {
  Harness,
  HarnessContext,
  HarnessMetadata,
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

type PiAgentToolLike = {
  name: string;
  replay?: boolean | PiAiToolReplayConfig<any, any, any, any>;
  execute: (toolCallId: string, args: Record<string, JsonValue>) => unknown;
};

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
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  input: TInput;
  metadata: HarnessContext<TMetadata>["metadata"];
  signal?: AbortSignal;
  setArtifact: HarnessContext<TMetadata>["setArtifact"];
}

export type PiAiToolRecording<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
> = ToolRecording<TArgs, TResult>;

export type PiAiToolReplayConfig<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = ToolReplayConfig<TArgs, TResult, PiAiToolContext<TInput, TMetadata>>;

export interface PiAiToolDefinition<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  description?: string;
  replay?: boolean | PiAiToolReplayConfig<TArgs, TResult, TInput, TMetadata>;
  execute: (
    args: TArgs,
    context: PiAiToolContext<TInput, TMetadata>,
  ) => MaybePromise<TResult>;
}

export type PiAiToolset<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = Record<string, PiAiToolDefinition<any, any, TInput, TMetadata>>;

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
  TTools extends PiAiToolset<TInput, TMetadata>,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
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
  TMetadata extends HarnessMetadata,
  TTools extends PiAiToolset<TInput, TMetadata>,
> {
  agent: TAgent;
  input: TInput;
  context: HarnessContext<TMetadata>;
  runtime: PiAiRuntime<TTools, TInput, TMetadata>;
}

export interface PiAiHarnessResultArgs<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
> extends PiAiHarnessRunArgs<TAgent, TInput, TMetadata, TTools> {
  result: TResult;
}

export interface PiAiHarnessOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
> {
  agent?: TAgent;
  createAgent?: () => MaybePromise<TAgent>;
  tools?: TTools;
  run?: (
    args: PiAiHarnessRunArgs<TAgent, TInput, TMetadata, TTools>,
  ) => MaybePromise<TResult | HarnessRun>;
  normalize?: PiAiHarnessNormalizeOptions<
    TAgent,
    TInput,
    TMetadata,
    TResult,
    TTools
  >;
  name?: string;
}

export interface PiAiHarnessNormalizeOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
> {
  session?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<NormalizedSession>;
  output?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<JsonValue | undefined>;
  usage?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<UsageSummary>;
  timings?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<TimingSummary | undefined>;
  errors?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<Array<Record<string, JsonValue>>>;
}

/** Adapts a Pi agent runtime into a normalized vitest-evals harness. */
export function piAiHarness<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
): Harness<TInput, TMetadata> {
  return {
    name: options.name ?? "pi-ai",
    run: async (input, context) => {
      const agent = await resolveAgent(options);
      const tools = resolveToolset(options, agent);
      const agentTools = tools ? undefined : resolveAgentTools(agent);
      const messages: NormalizedMessage[] = [
        {
          role: "user",
          content: normalizeContent(input),
        },
      ];

      const runtime = createRuntime({
        input,
        context,
        tools,
        messages,
      });

      try {
        const result = await withInstrumentedAgentTools(
          agentTools,
          {
            input,
            context,
            messages,
            toolCalls: runtime.toolCalls,
          },
          () =>
            runAgent(options, {
              agent,
              input,
              context,
              runtime,
            }),
        );

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
        } satisfies PiAiHarnessResultArgs<
          TAgent,
          TInput,
          TMetadata,
          TResult,
          TTools
        >;

        const output = options.normalize?.output
          ? await options.normalize.output(resultArgs)
          : resolveOutput(result);
        const usage = options.normalize?.usage
          ? await options.normalize.usage(resultArgs)
          : resolveUsage(result, runtime.toolCalls.length);
        const session = options.normalize?.session
          ? await options.normalize.session(resultArgs)
          : resolveSession(result, messages, output, usage);

        return {
          session,
          output,
          usage,
          timings: options.normalize?.timings
            ? await options.normalize.timings(resultArgs)
            : undefined,
          artifacts:
            Object.keys(context.artifacts).length > 0
              ? context.artifacts
              : undefined,
          errors: options.normalize?.errors
            ? await options.normalize.errors(resultArgs)
            : resolveErrors(result),
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
    },
  };
}

async function resolveAgent<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
>(options: PiAiHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>) {
  if (options.agent !== undefined) {
    return options.agent;
  }

  if (options.createAgent) {
    return options.createAgent();
  }

  throw new Error(
    "piAiHarness requires either an agent instance or a createAgent() function.",
  );
}

function resolveToolset<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
  agent: TAgent,
): TTools | undefined {
  if (options.tools) {
    return options.tools;
  }

  if (!agent || typeof agent !== "object") {
    return undefined;
  }

  const candidate =
    "tools" in agent
      ? (agent as { tools?: unknown }).tools
      : "toolset" in agent
        ? (agent as { toolset?: unknown }).toolset
        : undefined;

  return isPiAiToolset(candidate)
    ? (candidate as unknown as TTools)
    : undefined;
}

function resolveAgentTools(agent: unknown) {
  const seen = new Set<object>();
  const queue: Array<{ value: unknown; depth: number }> = [
    { value: agent, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !current.value || typeof current.value !== "object") {
      continue;
    }
    if (seen.has(current.value)) {
      continue;
    }
    seen.add(current.value);

    const tools = getAgentToolArray(current.value);
    if (tools) {
      return tools;
    }

    if (current.depth >= 2) {
      continue;
    }

    for (const value of Object.values(current.value)) {
      if (value && typeof value === "object") {
        queue.push({
          value,
          depth: current.depth + 1,
        });
      }
    }
  }

  return undefined;
}

function getAgentToolArray(value: object) {
  const directTools =
    "tools" in value ? (value as { tools?: unknown }).tools : undefined;
  if (isAgentToolArray(directTools)) {
    return directTools;
  }

  const stateTools =
    "state" in value &&
    (value as { state?: { tools?: unknown } }).state &&
    typeof (value as { state?: unknown }).state === "object"
      ? (value as { state?: { tools?: unknown } }).state?.tools
      : undefined;
  if (isAgentToolArray(stateTools)) {
    return stateTools;
  }

  const initialStateTools =
    "initialState" in value &&
    (value as { initialState?: { tools?: unknown } }).initialState &&
    typeof (value as { initialState?: unknown }).initialState === "object"
      ? (value as { initialState?: { tools?: unknown } }).initialState?.tools
      : undefined;
  if (isAgentToolArray(initialStateTools)) {
    return initialStateTools;
  }

  return undefined;
}

async function runAgent<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
  args: PiAiHarnessRunArgs<TAgent, TInput, TMetadata, TTools>,
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
        run: (
          input: TInput,
          runtime: PiAiRuntime<TTools, TInput, TMetadata>,
        ) => MaybePromise<TResult | HarnessRun>;
      }
    ).run(args.input, args.runtime);
  }

  throw new Error(
    "piAiHarness requires a run() function unless the provided agent exposes run(input, runtime).",
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

function isPiAiToolset(value: unknown): value is PiAiToolset {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((tool) =>
    Boolean(
      tool &&
        typeof tool === "object" &&
        "execute" in tool &&
        typeof (tool as { execute?: unknown }).execute === "function",
    ),
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

function normalizeContent(value: unknown): JsonValue {
  if (isJsonValue(value)) {
    return value;
  }

  return String(value);
}

async function withInstrumentedAgentTools<
  TResult,
  TInput,
  TMetadata extends HarnessMetadata,
>(
  tools: PiAgentToolLike[] | undefined,
  args: {
    input: TInput;
    context: HarnessContext<TMetadata>;
    messages: NormalizedMessage[];
    toolCalls: ToolCallRecord[];
  },
  callback: () => Promise<TResult>,
) {
  if (!tools || tools.length === 0) {
    return callback();
  }

  const originalExecutions = tools.map((tool) => tool.execute);

  for (const [index, tool] of tools.entries()) {
    const originalExecute = originalExecutions[index];
    tool.execute = async (toolCallId, rawArgs) => {
      const startedAt = new Date();
      const toolContext = {
        input: args.input,
        metadata: args.context.metadata,
        signal: args.context.signal,
        setArtifact: args.context.setArtifact,
      } satisfies PiAiToolContext<TInput, TMetadata>;

      try {
        const execution = await executeWithReplay({
          toolName: tool.name,
          args: rawArgs,
          context: toolContext,
          execute: async (toolArgs) =>
            normalizeReplayToolResult(
              await originalExecute(toolCallId, toolArgs),
            ),
          replay: tool.replay,
        });
        const finishedAt = new Date();
        const call = {
          name: tool.name,
          arguments: rawArgs,
          result: normalizeToolResult(execution.result),
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          metadata: normalizeReplayMetadata(execution.replay),
        } satisfies ToolCallRecord;
        args.toolCalls.push(call);
        args.messages.push({
          role: "assistant",
          toolCalls: [call],
        });
        args.messages.push({
          role: "tool",
          content: normalizeToolResult(execution.result),
          metadata: {
            name: tool.name,
          },
        });
        return execution.result;
      } catch (error) {
        const finishedAt = new Date();
        const call = {
          name: tool.name,
          arguments: rawArgs,
          error: serializeToolError(error),
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          metadata: normalizeReplayMetadata(getReplayMetadataFromError(error)),
        } satisfies ToolCallRecord;
        args.toolCalls.push(call);
        args.messages.push({
          role: "assistant",
          toolCalls: [call],
        });
        throw error;
      }
    };
  }

  try {
    return await callback();
  } finally {
    for (const [index, tool] of tools.entries()) {
      tool.execute = originalExecutions[index];
    }
  }
}

function createRuntime<
  TInput,
  TMetadata extends HarnessMetadata,
  TTools extends PiAiToolset<TInput, TMetadata>,
>({
  input,
  context,
  tools,
  messages,
}: {
  input: TInput;
  context: HarnessContext<TMetadata>;
  tools: TTools | undefined;
  messages: NormalizedMessage[];
}): PiAiRuntime<TTools, TInput, TMetadata> & {
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
          metadata: context.metadata,
          signal: context.signal,
          setArtifact: context.setArtifact,
        } satisfies PiAiToolContext<TInput, TMetadata>;

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
  ) as unknown as PiAiRuntime<TTools, TInput, TMetadata>["tools"];

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

function normalizeToolResult(result: unknown): JsonValue | undefined {
  if (
    result &&
    typeof result === "object" &&
    "details" in result &&
    isJsonValue((result as { details?: unknown }).details)
  ) {
    return (result as { details: JsonValue }).details;
  }

  if (isJsonValue(result)) {
    return result;
  }

  return result === undefined ? undefined : String(result);
}

function normalizeReplayToolResult(result: unknown): JsonValue {
  return normalizeToolResult(result) ?? null;
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
    looksLikeSession((result as Record<string, unknown> | undefined)?.session)
  ) {
    return (result as { session: NormalizedSession }).session;
  }

  if (
    looksLikeSession((result as Record<string, unknown> | undefined)?.trace)
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

function looksLikeSession(value: unknown): value is NormalizedSession {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "messages" in value &&
    Array.isArray((value as { messages?: unknown[] }).messages)
  );
}

async function executeToolWithReplay<
  TArgs extends Record<string, JsonValue>,
  TResult extends JsonValue,
  TInput,
  TMetadata extends HarnessMetadata,
>({
  toolName,
  tool,
  args,
  context,
}: {
  toolName: string;
  tool: PiAiToolDefinition<TArgs, TResult, TInput, TMetadata>;
  args: TArgs;
  context: PiAiToolContext<TInput, TMetadata>;
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
