export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ToolCallRecord = {
  id?: string;
  name: string;
  arguments?: Record<string, JsonValue>;
  result?: JsonValue;
  error?: {
    message: string;
    type?: string;
    [key: string]: JsonValue | undefined;
  };
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  metadata?: Record<string, JsonValue>;
};

export type NormalizedMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: JsonValue;
  toolCalls?: ToolCallRecord[];
  metadata?: Record<string, JsonValue>;
};

export type UsageSummary = {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  toolCalls?: number;
  retries?: number;
  metadata?: Record<string, JsonValue>;
};

export type TimingSummary = {
  totalMs?: number;
  metadata?: Record<string, JsonValue>;
};

export type NormalizedSession = {
  messages: NormalizedMessage[];
  outputText?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, JsonValue>;
};

export type HarnessRun = {
  session: NormalizedSession;
  output?: JsonValue;
  usage: UsageSummary;
  timings?: TimingSummary;
  artifacts?: Record<string, JsonValue>;
  errors: Array<Record<string, JsonValue>>;
};

/** Optional provider-facing hints for harness prompt calls. */
export type HarnessPromptOptions = {
  system?: string;
  metadata?: Record<string, JsonValue>;
};

/** Provider-agnostic prompt seam that judges can reuse from a harness. */
export type HarnessPrompt = (
  input: string,
  options?: HarnessPromptOptions,
) => Promise<string>;

export type HarnessRunError = Error & {
  vitestEvalsRun: HarnessRun;
};

export type HarnessMetadata = Record<string, unknown>;

export type HarnessContext<
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = {
  metadata: Readonly<TMetadata>;
  task: {
    meta: Record<string, unknown>;
  };
  signal?: AbortSignal;
  artifacts: Record<string, JsonValue>;
  setArtifact: (name: string, value: JsonValue) => void;
};

export type Harness<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = {
  name: string;
  /** Prompt seam reused by LLM-backed judges. */
  prompt: HarnessPrompt;
  run: (
    input: TInput,
    context: HarnessContext<TMetadata>,
  ) => Promise<HarnessRun>;
};

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJsonArray(value: unknown[]): JsonValue[] {
  return value.map((item) => {
    const normalized = toJsonValue(item);
    return normalized === undefined ? null : normalized;
  });
}

function normalizeJsonObject(
  value: Record<string, unknown>,
): Record<string, JsonValue> {
  const normalized: Record<string, JsonValue> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    const entry = toJsonValue(entryValue);
    if (entry !== undefined) {
      normalized[key] = entry;
    }
  }

  return normalized;
}

/** Returns true when a value exposes a callable method with the given name. */
export function hasCallableMethod(value: unknown, methodName: string) {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    methodName in value &&
    typeof (value as Record<string, unknown>)[methodName] === "function"
  );
}

/** Normalizes an unknown value into the JSON-safe shape used by harness runs. */
export function toJsonValue(value: unknown): JsonValue | undefined {
  if (isJsonPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return normalizeJsonArray(value);
  }

  if (isJsonRecord(value)) {
    return normalizeJsonObject(value);
  }

  return undefined;
}

/** Drops non-JSON properties from a record while preserving valid values. */
export function normalizeRecord(
  value: Record<string, unknown>,
): Record<string, JsonValue> {
  return normalizeJsonObject(value);
}

/** Normalizes metadata and omits the field entirely when nothing survives. */
export function normalizeMetadata(
  value: Record<string, unknown>,
): Record<string, JsonValue> | undefined {
  const normalized = normalizeRecord(value);
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/** Converts arbitrary content into the JSON-safe message content shape. */
export function normalizeContent(value: unknown): JsonValue {
  return toJsonValue(value) ?? String(value);
}

/** Flattens every recorded tool call from a normalized session. */
export function toolCalls(session: NormalizedSession): ToolCallRecord[] {
  return session.messages.flatMap((message) => message.toolCalls ?? []);
}

/** Filters normalized session messages by role. */
export function messagesByRole(
  session: NormalizedSession,
  role: NormalizedMessage["role"],
): NormalizedMessage[] {
  return session.messages.filter((message) => message.role === role);
}

/** Returns every normalized system message from a session. */
export function systemMessages(session: NormalizedSession) {
  return messagesByRole(session, "system");
}

/** Returns every normalized user message from a session. */
export function userMessages(session: NormalizedSession) {
  return messagesByRole(session, "user");
}

/** Returns every normalized assistant message from a session. */
export function assistantMessages(session: NormalizedSession) {
  return messagesByRole(session, "assistant");
}

/** Returns every normalized tool message from a session. */
export function toolMessages(session: NormalizedSession) {
  return messagesByRole(session, "tool");
}

/** Attaches a partial or complete harness run to an arbitrary thrown error. */
export function attachHarnessRunToError(
  error: unknown,
  run: HarnessRun,
): HarnessRunError {
  const baseError =
    error instanceof Error
      ? error
      : new Error(String(error ?? "Unknown error"));
  return Object.assign(baseError, {
    vitestEvalsRun: run,
  });
}

/** Reads an attached harness run back off a previously wrapped error value. */
export function getHarnessRunFromError(error: unknown): HarnessRun | undefined {
  if (
    error &&
    typeof error === "object" &&
    "vitestEvalsRun" in error &&
    isHarnessRun((error as { vitestEvalsRun?: unknown }).vitestEvalsRun)
  ) {
    return (error as { vitestEvalsRun: HarnessRun }).vitestEvalsRun;
  }

  return undefined;
}

/** Returns true when a value matches the normalized `HarnessRun` contract. */
export function isHarnessRun(value: unknown): value is HarnessRun {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    session?: unknown;
    usage?: unknown;
    errors?: unknown;
  };

  return (
    isNormalizedSession(candidate.session) &&
    Boolean(candidate.usage) &&
    typeof candidate.usage === "object" &&
    !Array.isArray(candidate.usage) &&
    Array.isArray(candidate.errors)
  );
}

/** Returns true when a value matches the normalized session contract. */
export function isNormalizedSession(
  value: unknown,
): value is NormalizedSession {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "messages" in value &&
    Array.isArray((value as { messages?: unknown }).messages)
  );
}

/** Reuses pre-normalized harness errors when a runtime already returns them. */
export function resolveHarnessRunErrors(
  result: unknown,
): Array<Record<string, JsonValue>> {
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as Record<string, unknown>).errors)
  ) {
    return (result as { errors: Array<Record<string, JsonValue>> }).errors;
  }

  return [];
}

/** Serializes an arbitrary thrown value into the normalized error shape. */
export function serializeError(error: unknown): Record<string, JsonValue> {
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
