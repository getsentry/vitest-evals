import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
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

type MaybePromise<T> = T | Promise<T>;
const DEFAULT_REPLAY_DIR = ".vitest-evals/recordings";

export type PiAiReplayMode = "off" | "auto" | "strict" | "record";

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

export interface PiAiToolRecording<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
> {
  writtenAt: string;
  toolName: string;
  input: TArgs;
  output?: TResult;
  error?: {
    message: string;
    type?: string;
    [key: string]: JsonValue | undefined;
  };
  metadata?: Record<string, JsonValue | undefined>;
}

export interface PiAiToolReplayConfig<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> {
  key?: (
    args: TArgs,
    context: PiAiToolContext<TInput, TCase>,
  ) => MaybePromise<JsonValue>;
  sanitize?: (
    recording: PiAiToolRecording<TArgs, TResult>,
  ) => MaybePromise<PiAiToolRecording<TArgs, TResult>>;
  version?: string;
}

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

type ReplayMetadata = {
  status: "recorded" | "replayed";
  recordingPath: string;
  cacheKey: string;
};

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
  agent: TAgent;
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

export interface PiAiHarnessOptions<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
> {
  agent?: TAgent;
  createAgent?: () => MaybePromise<TAgent>;
  tools?: TTools;
  run?: (
    args: PiAiHarnessRunArgs<TAgent, TInput, TCase, TTools>,
  ) => MaybePromise<TResult | HarnessRun>;
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
): Harness<TInput, TCase> {
  return {
    name: options.name ?? "pi-ai",
    run: async (input, context) => {
      const agent = await resolveAgent(options);
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
        } satisfies PiAiHarnessResultArgs<
          TAgent,
          TInput,
          TCase,
          TResult,
          TTools
        >;

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
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
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
          runtime: PiAiRuntime<TTools, TInput, TCase>,
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
            metadata: normalizeToolMetadata(execution.replay),
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
          const replay =
            error && typeof error === "object" && "vitestEvalsReplay" in error
              ? ((
                  error as {
                    vitestEvalsReplay?: ReplayMetadata;
                  }
                ).vitestEvalsReplay ?? undefined)
              : undefined;
          const call = {
            name: toolName,
            arguments: args,
            error: serializeToolError(error),
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            metadata: normalizeToolMetadata(replay),
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
  const replay = normalizeReplayConfig(tool.replay);
  const replayMode = resolveReplayMode();

  if (!replay || replayMode === "off") {
    return {
      result: await tool.execute(args, context),
    };
  }

  const cacheKeyInput = replay.key ? await replay.key(args, context) : args;
  const cacheKey = createCacheKey(toolName, cacheKeyInput, replay.version);
  const absoluteRecordingPath = resolve(
    process.cwd(),
    resolveReplayDirectory(),
    toolName,
    `${cacheKey}.json`,
  );
  const recordingPath = relative(process.cwd(), absoluteRecordingPath);

  if (replayMode === "auto" || replayMode === "strict") {
    const recording = await readRecording<TResult>(absoluteRecordingPath);
    if (recording) {
      const replayMetadata = {
        status: "replayed",
        recordingPath,
        cacheKey,
      } satisfies ReplayMetadata;

      if (recording.error) {
        throw attachReplayMetadata(
          deserializeRecordedError(recording.error),
          replayMetadata,
        );
      }

      return {
        result: recording.output as TResult,
        replay: replayMetadata,
      };
    }

    if (replayMode === "strict") {
      throw new Error(
        `Missing replay recording for ${toolName}: ${recordingPath}`,
      );
    }
  }

  try {
    const result = await tool.execute(args, context);
    const replayMetadata = {
      status: "recorded",
      recordingPath,
      cacheKey,
    } satisfies ReplayMetadata;

    await writeRecording(absoluteRecordingPath, replay, {
      writtenAt: new Date().toISOString(),
      toolName,
      input: args,
      output: result,
      metadata: {
        cacheKey,
        version: replay.version,
        mode: replayMode,
      },
    });

    return {
      result,
      replay: replayMetadata,
    };
  } catch (error) {
    const replayMetadata = {
      status: "recorded",
      recordingPath,
      cacheKey,
    } satisfies ReplayMetadata;
    const serializedError = serializeToolError(error);

    await writeRecording(absoluteRecordingPath, replay, {
      writtenAt: new Date().toISOString(),
      toolName,
      input: args,
      error: serializedError,
      metadata: {
        cacheKey,
        version: replay.version,
        mode: replayMode,
      },
    });

    throw attachReplayMetadata(error, replayMetadata);
  }
}

function normalizeReplayConfig<
  TArgs extends Record<string, JsonValue>,
  TResult extends JsonValue,
  TInput,
  TCase extends HarnessCase<TInput>,
>(
  replay:
    | boolean
    | PiAiToolReplayConfig<TArgs, TResult, TInput, TCase>
    | undefined,
) {
  if (!replay) {
    return null;
  }

  return replay === true ? {} : replay;
}

function resolveReplayMode(): PiAiReplayMode {
  const value = process.env.VITEST_EVALS_REPLAY_MODE;
  if (
    value === "auto" ||
    value === "strict" ||
    value === "record" ||
    value === "off"
  ) {
    return value;
  }

  return "off";
}

function resolveReplayDirectory() {
  return process.env.VITEST_EVALS_REPLAY_DIR ?? DEFAULT_REPLAY_DIR;
}

function createCacheKey(
  toolName: string,
  input: JsonValue,
  version: string | undefined,
) {
  return createHash("sha256")
    .update(
      stableStringify({
        toolName,
        input,
        version: version ?? null,
      }),
    )
    .digest("hex");
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

async function readRecording<TResult extends JsonValue>(
  recordingPath: string,
): Promise<PiAiToolRecording<Record<string, JsonValue>, TResult> | null> {
  try {
    const content = await readFile(recordingPath, "utf8");
    return JSON.parse(content) as PiAiToolRecording<
      Record<string, JsonValue>,
      TResult
    >;
  } catch {
    return null;
  }
}

async function writeRecording<
  TArgs extends Record<string, JsonValue>,
  TResult extends JsonValue,
>(
  recordingPath: string,
  replay: PiAiToolReplayConfig<TArgs, TResult, any, any>,
  recording: PiAiToolRecording<TArgs, TResult>,
) {
  const sanitized = replay.sanitize
    ? await replay.sanitize(recording)
    : recording;
  await mkdir(dirname(recordingPath), { recursive: true });
  await writeFile(recordingPath, JSON.stringify(sanitized, null, 2));
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

function deserializeRecordedError(error: {
  message: string;
  type?: string;
}) {
  const replayedError = new Error(error.message);
  replayedError.name = error.type ?? "Error";
  return replayedError;
}

function attachReplayMetadata(error: unknown, replay: ReplayMetadata) {
  const baseError =
    error instanceof Error
      ? error
      : new Error(String(error ?? "Unknown error"));
  return Object.assign(baseError, {
    vitestEvalsReplay: replay,
  });
}

function normalizeToolMetadata(replay: ReplayMetadata | undefined) {
  if (!replay) {
    return undefined;
  }

  return {
    replay: {
      status: replay.status,
      recordingPath: replay.recordingPath,
      cacheKey: replay.cacheKey,
    },
  } satisfies Record<string, JsonValue>;
}
