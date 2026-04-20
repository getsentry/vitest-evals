import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { JsonValue } from "./harness";

type MaybePromise<T> = T | Promise<T>;

const DEFAULT_REPLAY_DIR = ".vitest-evals/recordings";

export type ReplayMode = "off" | "auto" | "strict" | "record";

export type ReplayMetadata = {
  status: "recorded" | "replayed";
  recordingPath: string;
  cacheKey: string;
};

export interface ToolRecording<
  TArgs extends JsonValue = JsonValue,
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

export interface ToolReplayConfig<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
  TContext = unknown,
> {
  key?: (args: TArgs, context: TContext) => MaybePromise<JsonValue>;
  sanitize?: (
    recording: ToolRecording<TArgs, TResult>,
  ) => MaybePromise<ToolRecording<TArgs, TResult>>;
  version?: string;
}

export async function executeWithReplay<
  TArgs extends JsonValue,
  TResult extends JsonValue,
  TContext,
>({
  toolName,
  args,
  context,
  execute,
  replay,
}: {
  toolName: string;
  args: TArgs;
  context: TContext;
  execute: (args: TArgs, context: TContext) => MaybePromise<TResult>;
  replay: boolean | ToolReplayConfig<TArgs, TResult, TContext> | undefined;
}) {
  const replayConfig = normalizeReplayConfig(replay);
  const replayMode = resolveReplayMode();

  if (!replayConfig || replayMode === "off") {
    return {
      result: await execute(args, context),
    };
  }

  const cacheKeyInput = replayConfig.key
    ? await replayConfig.key(args, context)
    : args;
  const cacheKey = createCacheKey(
    toolName,
    cacheKeyInput,
    replayConfig.version,
  );
  const absoluteRecordingPath = resolve(
    process.cwd(),
    resolveReplayDirectory(),
    toolName,
    `${cacheKey}.json`,
  );
  const recordingPath = relative(process.cwd(), absoluteRecordingPath);

  if (replayMode === "auto" || replayMode === "strict") {
    const recording = await readRecording<TArgs, TResult>(
      absoluteRecordingPath,
    );
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
    const result = await execute(args, context);
    const replayMetadata = {
      status: "recorded",
      recordingPath,
      cacheKey,
    } satisfies ReplayMetadata;

    await writeRecording(absoluteRecordingPath, replayConfig, {
      writtenAt: new Date().toISOString(),
      toolName,
      input: args,
      output: result,
      metadata: {
        cacheKey,
        version: replayConfig.version,
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

    await writeRecording(absoluteRecordingPath, replayConfig, {
      writtenAt: new Date().toISOString(),
      toolName,
      input: args,
      error: serializeToolError(error),
      metadata: {
        cacheKey,
        version: replayConfig.version,
        mode: replayMode,
      },
    });

    throw attachReplayMetadata(error, replayMetadata);
  }
}

export function getReplayMetadataFromError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "vitestEvalsReplay" in error &&
    isReplayMetadata(
      (error as { vitestEvalsReplay?: unknown }).vitestEvalsReplay,
    )
  ) {
    return (error as { vitestEvalsReplay: ReplayMetadata }).vitestEvalsReplay;
  }

  return undefined;
}

export function normalizeReplayMetadata(replay: ReplayMetadata | undefined) {
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

function normalizeReplayConfig<
  TArgs extends JsonValue,
  TResult extends JsonValue,
  TContext,
>(replay: boolean | ToolReplayConfig<TArgs, TResult, TContext> | undefined) {
  if (!replay) {
    return null;
  }

  return replay === true ? {} : replay;
}

function resolveReplayMode(): ReplayMode {
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

async function readRecording<
  TArgs extends JsonValue,
  TResult extends JsonValue,
>(recordingPath: string): Promise<ToolRecording<TArgs, TResult> | null> {
  try {
    const content = await readFile(recordingPath, "utf8");
    return JSON.parse(content) as ToolRecording<TArgs, TResult>;
  } catch {
    return null;
  }
}

async function writeRecording<
  TArgs extends JsonValue,
  TResult extends JsonValue,
  TContext,
>(
  recordingPath: string,
  replay: ToolReplayConfig<TArgs, TResult, TContext>,
  recording: ToolRecording<TArgs, TResult>,
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

function isReplayMetadata(value: unknown): value is ReplayMetadata {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "recordingPath" in value &&
    "cacheKey" in value
  );
}
