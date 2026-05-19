/** Primitive scalar values allowed in normalized JSON-safe eval data. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-safe value shape used by normalized sessions, artifacts, and errors. */
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Normalized record for one tool call observed during a harness run.
 *
 * @example
 * ```ts
 * const call: ToolCallRecord = {
 *   name: "lookupInvoice",
 *   arguments: { invoiceId: "inv_123" },
 *   result: { refundable: true },
 * };
 * ```
 */
export type ToolCallRecord = {
  /** Provider or runtime tool-call id when one is available. */
  id?: string;
  /** Tool name as exposed to the agent or application runtime. */
  name: string;
  /** JSON-safe tool arguments after provider/runtime normalization. */
  arguments?: Record<string, JsonValue>;
  /** JSON-safe tool result returned by the application tool. */
  result?: JsonValue;
  /** Normalized tool error when execution failed. */
  error?: {
    message: string;
    type?: string;
    [key: string]: JsonValue | undefined;
  };
  /** ISO timestamp for the start of tool execution. */
  startedAt?: string;
  /** ISO timestamp for the end of tool execution. */
  finishedAt?: string;
  /** Tool execution duration in milliseconds. */
  durationMs?: number;
  /** Extra JSON-safe tool metadata for reporters and custom judges. */
  metadata?: Record<string, JsonValue>;
};

/**
 * Normalized message recorded in a harness session transcript.
 *
 * @example
 * ```ts
 * const message: NormalizedMessage = {
 *   role: "assistant",
 *   content: { status: "approved" },
 *   toolCalls: [{ name: "lookupInvoice" }],
 * };
 * ```
 */
export type NormalizedMessage = {
  /** Transcript role for the normalized message. */
  role: "system" | "user" | "assistant" | "tool";
  /** JSON-safe message content. */
  content?: JsonValue;
  /** Tool calls associated with this message. */
  toolCalls?: ToolCallRecord[];
  /** Extra JSON-safe message metadata. */
  metadata?: Record<string, JsonValue>;
};

/**
 * Provider usage summary attached to a normalized harness run.
 *
 * @example
 * ```ts
 * const usage: UsageSummary = {
 *   provider: "openai",
 *   model: "gpt-4o-mini",
 *   inputTokens: 212,
 *   outputTokens: 48,
 *   totalTokens: 260,
 * };
 * ```
 */
export type UsageSummary = {
  /** Provider that served the application run. */
  provider?: string;
  /** Model used for the application run. */
  model?: string;
  /** Input, prompt, or request tokens consumed by the run. */
  inputTokens?: number;
  /** Output or completion tokens produced by the run. */
  outputTokens?: number;
  /** Reasoning tokens reported by providers that expose them. */
  reasoningTokens?: number;
  /** Total token count reported by the provider or adapter. */
  totalTokens?: number;
  /** Count of tool calls observed during the run. */
  toolCalls?: number;
  /** Retry count observed during the run. */
  retries?: number;
  /** Provider-specific JSON-safe usage details. Cost estimates belong here. */
  metadata?: Record<string, JsonValue>;
};

/** Timing summary attached to a normalized harness run. */
export type TimingSummary = {
  /** End-to-end run duration in milliseconds. */
  totalMs?: number;
  /** Extra JSON-safe timing metadata. */
  metadata?: Record<string, JsonValue>;
};

/**
 * JSON-serializable transcript produced by the system under test.
 *
 * @example
 * ```ts
 * const session: NormalizedSession = {
 *   provider: "openai",
 *   model: "gpt-4o-mini",
 *   messages: [
 *     { role: "user", content: "Refund invoice inv_123" },
 *     { role: "assistant", content: { status: "approved" } },
 *   ],
 * };
 * ```
 */
export type NormalizedSession = {
  /** Ordered normalized transcript messages. */
  messages: NormalizedMessage[];
  /** Provider that produced the session when known. */
  provider?: string;
  /** Model that produced the session when known. */
  model?: string;
  /** Extra JSON-safe session metadata. */
  metadata?: Record<string, JsonValue>;
};

type OutputField<TOutput extends JsonValue | undefined> =
  undefined extends TOutput ? { output?: TOutput } : { output: TOutput };

/**
 * Normalized result returned by every harness execution.
 *
 * @example
 * ```ts
 * const run: HarnessRun<{ status: "approved" }> = {
 *   output: { status: "approved" },
 *   session: {
 *     messages: [
 *       { role: "user", content: "Refund invoice inv_123" },
 *       { role: "assistant", content: { status: "approved" } },
 *     ],
 *   },
 *   usage: { totalTokens: 260 },
 *   errors: [],
 * };
 * ```
 */
export type HarnessRun<
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = OutputField<TOutput> & {
  /** Normalized transcript and provider/session metadata. */
  session: NormalizedSession;
  /** Stable provider usage units such as tokens, tools, and retries. */
  usage: UsageSummary;
  /** Optional timing summary for the run. */
  timings?: TimingSummary;
  /** JSON-safe run artifacts captured by the harness or test context. */
  artifacts?: Record<string, JsonValue>;
  /** Normalized errors captured during execution. */
  errors: Array<Record<string, JsonValue>>;
};

/** Error value with an attached partial or complete normalized harness run. */
export type HarnessRunError = Error & {
  /** Attached normalized harness run recovered by `getHarnessRunFromError(...)`. */
  vitestEvalsRun: HarnessRun;
};

/** Per-run metadata shape accepted by harnesses and eval tests. */
export type HarnessMetadata = Record<string, unknown>;

/**
 * Runtime context passed from the eval fixture into a harness run.
 *
 * @example
 * ```ts
 * const harness: Harness<string> = {
 *   name: "refund-agent",
 *   async run(input, context) {
 *     context.setArtifact("inputLength", input.length);
 *
 *     return {
 *       output: undefined,
 *       session: { messages: [{ role: "user", content: input }] },
 *       usage: {},
 *       errors: [],
 *     };
 *   },
 * };
 * ```
 */
export type HarnessContext<
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = {
  /** Per-run metadata passed through `run(input, { metadata })`. */
  metadata: Readonly<TMetadata>;
  /** Abort signal from Vitest when available. */
  signal?: AbortSignal;
  /** Mutable JSON-safe artifact bag shared with the harness. */
  artifacts: Record<string, JsonValue>;
  /** Stores one JSON-safe artifact on the current run. */
  setArtifact: (name: string, value: JsonValue) => void;
};

/**
 * Adapter that executes the system under test and returns a normalized run.
 *
 * @example
 * ```ts
 * const harness: Harness<string, { status: "approved" | "denied" }> = {
 *   name: "refund-agent",
 *   async run(input, context) {
 *     return normalizeHarnessRun(input, await runRefundFlow(input), context);
 *   },
 * };
 * ```
 */
export type Harness<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = {
  /** Stable harness name used in reports. */
  name: string;
  /** Executes the system under test and returns a normalized run. */
  run: (
    input: TInput,
    context: HarnessContext<TMetadata>,
  ) => Promise<HarnessRun<TOutput>>;
};

/** Value or promise accepted by lightweight harness callbacks. */
export type MaybePromise<T> = T | Promise<T>;

/** Lightweight tool-call record accepted by `createHarness(...)` results. */
export type SimpleToolCallRecord = Omit<
  ToolCallRecord,
  "arguments" | "result" | "error" | "metadata"
> & {
  /** Raw tool arguments accepted by `createHarness(...)` before normalization. */
  arguments?: unknown;
  /** Raw tool result accepted by `createHarness(...)` before normalization. */
  result?: unknown;
  /** Raw tool error accepted by `createHarness(...)` before normalization. */
  error?: unknown;
  /** Raw tool metadata accepted by `createHarness(...)` before normalization. */
  metadata?: Record<string, unknown>;
};

/**
 * Lightweight result shape normalized by `createHarness(...)`.
 *
 * @example
 * ```ts
 * const result: SimpleHarnessResult<{ status: "approved" }> = {
 *   output: { status: "approved" },
 *   toolCalls: [{ name: "lookupInvoice", arguments: { invoiceId: "inv_123" } }],
 *   usage: { totalTokens: 260 },
 * };
 * ```
 */
export type SimpleHarnessResult<
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = OutputField<TOutput> & {
  /** Pre-normalized transcript messages. When omitted, a default user/assistant transcript is created. */
  messages?: NormalizedMessage[];
  /** Lightweight tool-call records to normalize into the session. */
  toolCalls?: SimpleToolCallRecord[];
  /** Usage summary to attach to the run. */
  usage?: UsageSummary;
  /** Timing summary to attach to the run. */
  timings?: TimingSummary;
  /** Raw artifact values to normalize and merge into the run. */
  artifacts?: Record<string, unknown>;
  /** Raw session metadata to normalize into the session. */
  metadata?: Record<string, unknown>;
  /** Raw errors to normalize into the run. */
  errors?: unknown[];
};

/** Either a complete normalized run or a lightweight result to normalize. */
export type HarnessResultLike<
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = HarnessRun<TOutput> | SimpleHarnessResult<TOutput>;

/** Arguments passed to the `createHarness(...)` convenience callback. */
export type CreateHarnessRunArgs<TInput, TMetadata extends HarnessMetadata> = {
  /** Original input passed to `run(input)`. */
  input: TInput;
  /** Read-only metadata passed to `run(input, { metadata })`. */
  metadata: Readonly<TMetadata>;
  /** Abort signal from Vitest when available. */
  signal?: AbortSignal;
  /** Mutable run artifact bag. */
  artifacts: HarnessContext<TMetadata>["artifacts"];
  /** Stores one JSON-safe artifact on the current run. */
  setArtifact: HarnessContext<TMetadata>["setArtifact"];
};

/**
 * Options for creating a lightweight custom application harness.
 *
 * @example
 * ```ts
 * const options: CreateHarnessOptions<string, { status: "approved" }> = {
 *   name: "refund-agent",
 *   run: async ({ input }) => ({
 *     output: await classifyRefund(input),
 *   }),
 * };
 * ```
 */
export type CreateHarnessOptions<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = {
  /** Stable harness name used in reports. */
  name: string;
  /** Executes application code and returns either a lightweight result or full `HarnessRun`. */
  run: (
    args: CreateHarnessRunArgs<TInput, TMetadata>,
  ) => MaybePromise<HarnessResultLike<TOutput>>;
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

/**
 * Creates a harness from the common "run app code and return output" shape.
 *
 * @param options - Harness name plus the callback that executes app code.
 *
 * @example
 * ```ts
 * import { createHarness } from "vitest-evals";
 *
 * export const refundHarness = createHarness<
 *   string,
 *   { status: "approved" | "denied" },
 *   { expected: { status: "approved" | "denied" } }
 * >({
 *   name: "refund-agent",
 *   run: async ({ input, metadata, setArtifact }) => {
 *     const result = await runRefundFlow(input, metadata);
 *     const output = { status: result.status };
 *
 *     setArtifact("case", { expected: metadata.expected.status });
 *
 *     return {
 *       output,
 *       toolCalls: result.toolCalls,
 *       usage: { provider: "openai", model: "gpt-4o-mini" },
 *     };
 *   },
 * });
 * ```
 */
export function createHarness<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
>(
  options: CreateHarnessOptions<TInput, TOutput, TMetadata>,
): Harness<TInput, TOutput, TMetadata>;
export function createHarness<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
>(
  options: CreateHarnessOptions<TInput, TOutput, TMetadata>,
): Harness<TInput, TOutput, TMetadata> {
  const harness: Harness<TInput, TOutput, TMetadata> = {
    name: options.name,
    run: async (input, context) => {
      const result = await options.run({
        input,
        metadata: context.metadata,
        signal: context.signal,
        artifacts: context.artifacts,
        setArtifact: context.setArtifact,
      });

      return normalizeHarnessRun(input, result, context);
    },
  };

  return harness;
}

/**
 * Normalizes a lightweight harness result into the reporter-facing run shape.
 *
 * @param input - Original input passed to the harness.
 * @param result - Lightweight result or pre-normalized harness run.
 * @param context - Optional per-run context used to merge artifacts.
 *
 * @example
 * ```ts
 * const run = normalizeHarnessRun("Refund invoice inv_123", {
 *   output: { status: "approved" },
 *   toolCalls: [{ name: "lookupInvoice", arguments: { invoiceId: "inv_123" } }],
 *   usage: { provider: "openai", model: "gpt-4o-mini" },
 * });
 *
 * expect(toolCalls(run.session)).toHaveLength(1);
 * ```
 */
export function normalizeHarnessRun<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
>(
  input: TInput,
  result: HarnessResultLike<TOutput>,
  context?: HarnessContext<TMetadata>,
): HarnessRun<TOutput> {
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

  const output = result.output;
  const toolCalls = normalizeSimpleToolCalls(result.toolCalls);
  const usage = result.usage ?? {};
  const messages =
    result.messages ??
    createDefaultSessionMessages({
      input,
      output,
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
      ...(usage.provider ? { provider: usage.provider } : {}),
      ...(usage.model ? { model: usage.model } : {}),
      ...(metadata ? { metadata } : {}),
    },
    ...(output !== undefined ? { output } : {}),
    usage,
    ...(result.timings ? { timings: result.timings } : {}),
    ...(artifacts ? { artifacts } : {}),
    errors: normalizeSimpleErrors(result.errors),
  } as HarnessRun<TOutput>;
}

function createDefaultSessionMessages<TInput>({
  input,
  output,
  toolCalls: normalizedToolCalls,
}: {
  input: TInput;
  output: JsonValue | undefined;
  toolCalls: ToolCallRecord[];
}): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [
    {
      role: "user",
      content: normalizeContent(input),
    },
  ];

  if (output !== undefined || normalizedToolCalls.length > 0) {
    messages.push({
      role: "assistant",
      ...(output !== undefined ? { content: normalizeContent(output) } : {}),
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

/**
 * Flattens every recorded tool call from a normalized session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const names = toolCalls(result.session).map((call) => call.name);
 *
 * expect(names).toEqual(["lookupInvoice", "createRefund"]);
 * ```
 */
export function toolCalls(session: NormalizedSession): ToolCallRecord[] {
  return session.messages.flatMap((message) => message.toolCalls ?? []);
}

/**
 * Filters normalized session messages by role.
 *
 * @param session - Normalized session produced by a harness run.
 * @param role - Message role to keep.
 *
 * @example
 * ```ts
 * const assistantText = messagesByRole(result.session, "assistant")
 *   .map((message) => message.content)
 *   .join("\n");
 * ```
 */
export function messagesByRole(
  session: NormalizedSession,
  role: NormalizedMessage["role"],
): NormalizedMessage[] {
  return session.messages.filter((message) => message.role === role);
}

/**
 * Returns every normalized system message from a session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const systemPrompts = systemMessages(result.session);
 * ```
 */
export function systemMessages(session: NormalizedSession) {
  return messagesByRole(session, "system");
}

/**
 * Returns every normalized user message from a session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const firstPrompt = userMessages(result.session)[0]?.content;
 * ```
 */
export function userMessages(session: NormalizedSession) {
  return messagesByRole(session, "user");
}

/**
 * Returns every normalized assistant message from a session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const finalAnswer = assistantMessages(result.session).at(-1)?.content;
 * ```
 */
export function assistantMessages(session: NormalizedSession) {
  return messagesByRole(session, "assistant");
}

/**
 * Returns every normalized tool message from a session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const toolOutputs = toolMessages(result.session).map((message) => message.content);
 * ```
 */
export function toolMessages(session: NormalizedSession) {
  return messagesByRole(session, "tool");
}

/**
 * Attaches a partial or complete harness run to an arbitrary thrown error.
 *
 * @param error - Thrown value to wrap.
 * @param run - Partial or complete normalized harness run to preserve.
 *
 * @example
 * ```ts
 * try {
 *   return await runAgent(input);
 * } catch (error) {
 *   throw attachHarnessRunToError(error, partialRun);
 * }
 * ```
 */
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

/**
 * Reads an attached harness run back off a previously wrapped error value.
 *
 * @param error - Unknown thrown value that may contain a harness run.
 *
 * @example
 * ```ts
 * const partialRun = getHarnessRunFromError(error);
 *
 * if (partialRun) {
 *   console.log(toolCalls(partialRun.session));
 * }
 * ```
 */
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
