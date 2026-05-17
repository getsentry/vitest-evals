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

/** Optional provider-facing hints for harness query calls. */
export type HarnessQueryOptions = {
  system?: string;
  metadata?: Record<string, JsonValue>;
  signal?: AbortSignal;
};

/** Provider-agnostic model query function that judges can reuse from a harness. */
export type HarnessQuery = (
  input: string,
  options?: HarnessQueryOptions,
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
  run: (
    input: TInput,
    context: HarnessContext<TMetadata>,
  ) => Promise<HarnessRun>;
};

export type QueryableHarness<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = Harness<TInput, TMetadata> & {
  /** Model query helper for judges; this must not execute the system under test. */
  query: HarnessQuery;
};

export type MaybePromise<T> = T | Promise<T>;

export type SimpleToolCallRecord = Omit<
  ToolCallRecord,
  "arguments" | "result" | "error" | "metadata"
> & {
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

export type SimpleHarnessResult = {
  output?: unknown;
  outputText?: string;
  messages?: NormalizedMessage[];
  toolCalls?: SimpleToolCallRecord[];
  usage?: UsageSummary;
  timings?: TimingSummary;
  artifacts?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  errors?: unknown[];
};

export type HarnessResultLike = HarnessRun | SimpleHarnessResult;

export type CreateHarnessRunArgs<TInput, TMetadata extends HarnessMetadata> = {
  input: TInput;
  context: HarnessContext<TMetadata>;
  metadata: Readonly<TMetadata>;
  signal?: AbortSignal;
  artifacts: HarnessContext<TMetadata>["artifacts"];
  setArtifact: HarnessContext<TMetadata>["setArtifact"];
};

export type CreateHarnessOptions<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = {
  name: string;
  run: (
    args: CreateHarnessRunArgs<TInput, TMetadata>,
  ) => MaybePromise<HarnessResultLike>;
};

export type CreateQueryableHarnessOptions<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = CreateHarnessOptions<TInput, TMetadata> & {
  query: HarnessQuery;
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
  const normalized = toJsonValue(value);
  return normalized !== undefined ? normalized : String(value);
}

/** Creates a harness from the common "run app code and return output" shape. */
export function createHarness<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
>(
  options: CreateQueryableHarnessOptions<TInput, TMetadata>,
): QueryableHarness<TInput, TMetadata>;
export function createHarness<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
>(options: CreateHarnessOptions<TInput, TMetadata>): Harness<TInput, TMetadata>;
export function createHarness<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
>(
  options:
    | CreateHarnessOptions<TInput, TMetadata>
    | CreateQueryableHarnessOptions<TInput, TMetadata>,
): Harness<TInput, TMetadata> | QueryableHarness<TInput, TMetadata> {
  const harness: Harness<TInput, TMetadata> = {
    name: options.name,
    run: async (input, context) => {
      const result = await options.run({
        input,
        context,
        metadata: context.metadata,
        signal: context.signal,
        artifacts: context.artifacts,
        setArtifact: context.setArtifact,
      });

      return normalizeHarnessRun(input, result, context);
    },
  };

  const query = "query" in options ? options.query : undefined;

  if (query) {
    return {
      ...harness,
      query,
    };
  }

  return harness;
}

/** Normalizes a lightweight harness result into the reporter-facing run shape. */
export function normalizeHarnessRun<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
>(
  input: TInput,
  result: HarnessResultLike,
  context?: HarnessContext<TMetadata>,
): HarnessRun {
  if (isHarnessRun(result)) {
    if (
      context &&
      Object.keys(context.artifacts).length > 0 &&
      !result.artifacts
    ) {
      return {
        ...result,
        artifacts: context.artifacts,
      };
    }

    return result;
  }

  const output = toJsonValue(result.output);
  const toolCalls = normalizeSimpleToolCalls(result.toolCalls);
  const outputText = resolveSimpleOutputText(result, output);
  const usage = result.usage ?? {};
  const messages =
    result.messages ??
    createDefaultSessionMessages({
      input,
      output,
      outputText,
      toolCalls,
    });
  const metadata = result.metadata
    ? normalizeMetadata(result.metadata)
    : undefined;
  const artifacts = normalizeMergedArtifacts(
    context?.artifacts,
    result.artifacts,
  );

  return {
    session: {
      messages,
      ...(outputText !== undefined ? { outputText } : {}),
      ...(usage.provider ? { provider: usage.provider } : {}),
      ...(usage.model ? { model: usage.model } : {}),
      ...(metadata ? { metadata } : {}),
    },
    ...(output !== undefined ? { output } : {}),
    usage,
    ...(result.timings ? { timings: result.timings } : {}),
    ...(artifacts ? { artifacts } : {}),
    errors: normalizeSimpleErrors(result.errors),
  };
}

function resolveSimpleOutputText(
  result: SimpleHarnessResult,
  output: JsonValue | undefined,
) {
  if (result.outputText !== undefined) {
    return result.outputText;
  }

  return typeof output === "string" ? output : undefined;
}

function createDefaultSessionMessages<TInput>({
  input,
  output,
  outputText,
  toolCalls: normalizedToolCalls,
}: {
  input: TInput;
  output: JsonValue | undefined;
  outputText: string | undefined;
  toolCalls: ToolCallRecord[];
}): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [
    {
      role: "user",
      content: normalizeContent(input),
    },
  ];
  const assistantContent = output !== undefined ? output : outputText;

  if (assistantContent !== undefined || normalizedToolCalls.length > 0) {
    messages.push({
      role: "assistant",
      ...(assistantContent !== undefined
        ? { content: normalizeContent(assistantContent) }
        : {}),
      ...(normalizedToolCalls.length > 0
        ? { toolCalls: normalizedToolCalls }
        : {}),
    });
  }

  return messages;
}

function normalizeSimpleToolCalls(
  calls: SimpleToolCallRecord[] | undefined,
): ToolCallRecord[] {
  return (calls ?? []).map((call) => {
    const {
      arguments: rawArguments,
      result: rawResult,
      error: rawError,
      metadata: rawMetadata,
      ...toolCall
    } = call;
    const args = normalizeToolCallArguments(rawArguments);
    const result = toJsonValue(rawResult);
    const error = normalizeToolCallError(rawError);
    const metadata = rawMetadata ? normalizeMetadata(rawMetadata) : undefined;

    return {
      ...toolCall,
      ...(args ? { arguments: args } : {}),
      ...(result !== undefined ? { result } : {}),
      ...(error ? { error } : {}),
      ...(metadata ? { metadata } : {}),
    };
  });
}

function normalizeToolCallArguments(
  value: unknown,
): Record<string, JsonValue> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = toJsonValue(value);
  return normalized &&
    typeof normalized === "object" &&
    !Array.isArray(normalized)
    ? normalized
    : undefined;
}

function normalizeToolCallError(
  value: unknown,
): ToolCallRecord["error"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const serialized = serializeError(value);
  const { message, type, ...details } = serialized;

  return {
    ...details,
    message: typeof message === "string" ? message : String(message),
    ...(typeof type === "string" ? { type } : {}),
  };
}

function normalizeMergedArtifacts(
  contextArtifacts: Record<string, JsonValue> | undefined,
  resultArtifacts: Record<string, unknown> | undefined,
) {
  const artifacts = {
    ...(contextArtifacts ?? {}),
    ...(resultArtifacts ? normalizeRecord(resultArtifacts) : {}),
  };

  return Object.keys(artifacts).length > 0 ? artifacts : undefined;
}

function normalizeSimpleErrors(
  errors: unknown[] | undefined,
): Array<Record<string, JsonValue>> {
  return (errors ?? []).map((error) => {
    const normalized = toJsonValue(error);

    if (
      normalized &&
      typeof normalized === "object" &&
      !Array.isArray(normalized) &&
      Object.keys(normalized).length > 0
    ) {
      return normalized;
    }

    return serializeError(error);
  });
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
