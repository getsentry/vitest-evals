/** Primitive scalar values allowed in normalized JSON-safe eval data. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-safe value shape used by normalized sessions, artifacts, and errors. */
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Well-known OpenTelemetry GenAI operation names. */
export type GenAiOperationName =
  | "chat"
  | "create_agent"
  | "embeddings"
  | "execute_tool"
  | "generate_content"
  | "invoke_agent"
  | "invoke_workflow"
  | "retrieval"
  | "text_completion"
  | (string & {});

/** Well-known OpenTelemetry GenAI output content types. */
export type GenAiOutputType =
  | "image"
  | "json"
  | "speech"
  | "text"
  | (string & {});

/** Well-known OpenTelemetry GenAI provider names. */
export type GenAiProviderName =
  | "anthropic"
  | "aws.bedrock"
  | "azure.ai.inference"
  | "azure.ai.openai"
  | "cohere"
  | "deepseek"
  | "gcp.gemini"
  | "gcp.gen_ai"
  | "gcp.vertex_ai"
  | "groq"
  | "ibm.watsonx.ai"
  | "mistral_ai"
  | "openai"
  | "perplexity"
  | "x_ai"
  | (string & {});

/** Well-known OpenTelemetry GenAI token types. */
export type GenAiTokenType = "input" | "output" | (string & {});

/** Well-known OpenTelemetry GenAI tool execution types. */
export type GenAiToolType =
  | "datastore"
  | "extension"
  | "function"
  | (string & {});

/** Typed subset of OpenTelemetry GenAI semantic attributes. */
export type GenAiSemanticAttributes = {
  "gen_ai.agent.description"?: string;
  "gen_ai.agent.id"?: string;
  "gen_ai.agent.name"?: string;
  "gen_ai.agent.version"?: string;
  "gen_ai.conversation.id"?: string;
  "gen_ai.data_source.id"?: string;
  "gen_ai.embeddings.dimension.count"?: number;
  "gen_ai.evaluation.explanation"?: string;
  "gen_ai.evaluation.name"?: string;
  "gen_ai.evaluation.score.label"?: string;
  "gen_ai.evaluation.score.value"?: number;
  "gen_ai.input.messages"?: JsonValue;
  "gen_ai.operation.name"?: GenAiOperationName;
  "gen_ai.output.messages"?: JsonValue;
  "gen_ai.output.type"?: GenAiOutputType;
  "gen_ai.prompt.name"?: string;
  "gen_ai.provider.name"?: GenAiProviderName;
  "gen_ai.request.choice.count"?: number;
  "gen_ai.request.encoding_formats"?: string[];
  "gen_ai.request.frequency_penalty"?: number;
  "gen_ai.request.max_tokens"?: number;
  "gen_ai.request.model"?: string;
  "gen_ai.request.presence_penalty"?: number;
  "gen_ai.request.seed"?: number;
  "gen_ai.request.stop_sequences"?: string[];
  "gen_ai.request.stream"?: boolean;
  "gen_ai.request.temperature"?: number;
  "gen_ai.request.top_k"?: number;
  "gen_ai.request.top_p"?: number;
  "gen_ai.response.finish_reasons"?: string[];
  "gen_ai.response.id"?: string;
  "gen_ai.response.model"?: string;
  "gen_ai.response.time_to_first_chunk"?: number;
  "gen_ai.retrieval.documents"?: JsonValue;
  "gen_ai.retrieval.query.text"?: string;
  "gen_ai.system_instructions"?: JsonValue;
  "gen_ai.token.type"?: GenAiTokenType;
  "gen_ai.tool.call.arguments"?: JsonValue;
  "gen_ai.tool.call.id"?: string;
  "gen_ai.tool.call.result"?: JsonValue;
  "gen_ai.tool.definitions"?: JsonValue;
  "gen_ai.tool.description"?: string;
  "gen_ai.tool.name"?: string;
  "gen_ai.tool.type"?: GenAiToolType;
  "gen_ai.usage.cache_creation.input_tokens"?: number;
  "gen_ai.usage.cache_read.input_tokens"?: number;
  "gen_ai.usage.input_tokens"?: number;
  "gen_ai.usage.output_tokens"?: number;
  "gen_ai.usage.reasoning.output_tokens"?: number;
  "gen_ai.workflow.name"?: string;
};

/** Attribute keys defined by the OpenTelemetry GenAI semantic conventions. */
export type GenAiSemanticAttributeKey = keyof GenAiSemanticAttributes;

/** Typed OpenTelemetry semantic attributes accepted on normalized spans. */
export type OpenTelemetrySemanticAttributes = GenAiSemanticAttributes & {
  "error.type"?: string;
  "server.address"?: string;
  "server.port"?: number;
};

/** Known OpenTelemetry semantic attribute keys accepted on normalized spans. */
export type OpenTelemetrySemanticAttributeKey =
  keyof OpenTelemetrySemanticAttributes;

/** Attribute keys accepted on normalized spans. */
export type NormalizedSpanAttributeKey =
  | OpenTelemetrySemanticAttributeKey
  | (string & {});

/**
 * JSON-safe span attributes. Known OpenTelemetry GenAI keys are typed while
 * custom provider and application keys remain allowed.
 */
export type NormalizedSpanAttributes = OpenTelemetrySemanticAttributes & {
  [key: string]: JsonValue | undefined;
};

/** Event attached to one normalized span. */
export type NormalizedSpanEvent = {
  /** Event name emitted by the runtime or harness. */
  name: string;
  /** ISO timestamp for the event when available. */
  timestamp?: string;
  /** JSON-safe event attributes. */
  attributes?: NormalizedSpanAttributes;
};

/** Normalized operation span captured during a harness run. */
export type NormalizedSpan = {
  /** Runtime or provider span id when one is available. */
  id?: string;
  /** Trace id this span belongs to. */
  traceId?: string;
  /** Parent span id when the runtime exposes hierarchy. */
  parentId?: string;
  /** Human-readable operation name. */
  name: string;
  /** Coarse operation kind used by reporters and judges. */
  kind?:
    | "run"
    | "agent"
    | "model"
    | "tool"
    | "guardrail"
    | "handoff"
    | "custom";
  /** ISO timestamp for the start of the span. */
  startedAt?: string;
  /** ISO timestamp for the end of the span. */
  finishedAt?: string;
  /** Span duration in milliseconds. */
  durationMs?: number;
  /** Success or failure status for the span. */
  status?: "ok" | "error";
  /** Normalized error when the span failed. */
  error?: {
    message: string;
    type?: string;
    [key: string]: JsonValue | undefined;
  };
  /** JSON-safe operation attributes. */
  attributes?: NormalizedSpanAttributes;
  /** Events observed inside this span. */
  events?: NormalizedSpanEvent[];
};

/** Normalized trace captured during a harness run. */
export type NormalizedTrace = {
  /** Runtime or provider trace id when one is available. */
  id?: string;
  /** Human-readable trace or workflow name. */
  name?: string;
  /** ISO timestamp for the start of the trace. */
  startedAt?: string;
  /** ISO timestamp for the end of the trace. */
  finishedAt?: string;
  /** Trace duration in milliseconds. */
  durationMs?: number;
  /** Extra JSON-safe trace metadata. */
  metadata?: Record<string, JsonValue>;
  /** Spans that make up this trace. */
  spans: NormalizedSpan[];
};

/** Options for converting normalized tool calls into trace spans. */
export type CreateToolCallSpansOptions = {
  /** Trace id to attach to each generated tool span. */
  traceId?: string;
  /** Parent span id to attach to each generated tool span. */
  parentId?: string;
  /** Prefix used to create internal span ids instead of reusing tool-call ids. */
  spanIdPrefix?: string;
};

/** Options for attaching a fallback run trace to a harness result. */
export type EnsureRunTraceOptions = {
  /** Human-readable run or harness name. */
  name: string;
  /** Wall-clock start time for the harness run. */
  startedAt: Date;
  /** Wall-clock finish time for the harness run. */
  finishedAt: Date;
  /** Optional trace id. A generated id is used when omitted. */
  id?: string;
  /** GenAI operation name to place on the root run span. */
  operationName?: GenAiOperationName;
  /** Optional JSON-safe source marker for the trace metadata. */
  source?: string;
};

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
  /** Normalized traces and spans captured during execution. */
  traces?: NormalizedTrace[];
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

/** Lightweight span event accepted by `createHarness(...)` results. */
export type SimpleSpanEvent = Omit<NormalizedSpanEvent, "attributes"> & {
  /** Raw event attributes accepted by `createHarness(...)` before normalization. */
  attributes?: Record<string, unknown>;
};

/** Lightweight span record accepted by `createHarness(...)` results. */
export type SimpleSpanRecord = Omit<
  NormalizedSpan,
  "attributes" | "error" | "events"
> & {
  /** Raw span attributes accepted by `createHarness(...)` before normalization. */
  attributes?: Record<string, unknown>;
  /** Raw span error accepted by `createHarness(...)` before normalization. */
  error?: unknown;
  /** Raw span events accepted by `createHarness(...)` before normalization. */
  events?: SimpleSpanEvent[];
};

/** Lightweight trace record accepted by `createHarness(...)` results. */
export type SimpleTraceRecord = Omit<NormalizedTrace, "metadata" | "spans"> & {
  /** Raw trace metadata accepted by `createHarness(...)` before normalization. */
  metadata?: Record<string, unknown>;
  /** Lightweight spans to normalize into the trace. */
  spans: SimpleSpanRecord[];
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
  /** Lightweight traces and spans to normalize into the run. */
  traces?: SimpleTraceRecord[];
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
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJsonArray(value: unknown[], seen: WeakSet<object>) {
  if (seen.has(value)) {
    return undefined;
  }

  seen.add(value);
  const normalized = value.map((item) => {
    const normalized = toJsonValueInternal(item, seen);
    return normalized === undefined ? null : normalized;
  });
  seen.delete(value);

  return normalized;
}

function normalizeJsonObject(
  value: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, JsonValue> {
  const normalized: Record<string, JsonValue> = {};

  if (seen.has(value)) {
    return normalized;
  }

  seen.add(value);
  try {
    for (const [key, entryValue] of Object.entries(value)) {
      const entry = toJsonValueInternal(entryValue, seen);
      if (entry !== undefined) {
        normalized[key] = entry;
      }
    }
  } finally {
    seen.delete(value);
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
  return toJsonValueInternal(value, new WeakSet());
}

function toJsonValueInternal(
  value: unknown,
  seen: WeakSet<object>,
): JsonValue | undefined {
  if (isJsonPrimitive(value)) {
    return value;
  }

  if (
    value !== null &&
    typeof value === "object" &&
    seen.has(value as object)
  ) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return normalizeJsonArray(value, seen);
  }

  if (isJsonRecord(value)) {
    return normalizeJsonObject(value, seen);
  }

  return undefined;
}

/** Drops non-JSON properties from a record while preserving valid values. */
export function normalizeRecord(
  value: Record<string, unknown>,
): Record<string, JsonValue> {
  return normalizeJsonObject(value, new WeakSet());
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
      const startedAt = new Date();

      try {
        const result = await options.run({
          input,
          metadata: context.metadata,
          signal: context.signal,
          artifacts: context.artifacts,
          setArtifact: context.setArtifact,
        });
        const run = normalizeHarnessRun(input, result, context);
        ensureRunTrace(run, {
          name: options.name,
          startedAt,
          finishedAt: new Date(),
        });

        return run;
      } catch (error) {
        const partialRun = getHarnessRunFromError(error);
        if (partialRun) {
          if (
            Object.keys(context.artifacts).length > 0 &&
            !partialRun.artifacts
          ) {
            partialRun.artifacts = context.artifacts;
          }
          ensureRunTrace(partialRun, {
            name: options.name,
            startedAt,
            finishedAt: new Date(),
          });
          throw attachHarnessRunToError(error, partialRun);
        }

        const failedRun = createFailedHarnessRun(input, error, {
          artifacts: context.artifacts,
        });
        ensureRunTrace(failedRun, {
          name: options.name,
          startedAt,
          finishedAt: new Date(),
        });

        throw attachHarnessRunToError(error, failedRun);
      }
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
  const traces = normalizeSimpleTraces(result.traces);

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
    ...(traces ? { traces } : {}),
    errors: normalizeSimpleErrors(result.errors),
  } as HarnessRun<TOutput>;
}

/**
 * Builds a JSON-safe failed run for errors that happen before a harness can return.
 *
 * @param input - Original input passed to the harness.
 * @param error - Error thrown by setup or execution.
 * @param options - Optional artifacts to preserve on the failed run.
 */
export function createFailedHarnessRun(
  input: unknown,
  error: unknown,
  options: { artifacts?: Record<string, JsonValue> } = {},
): HarnessRun {
  const artifacts = options.artifacts;

  return {
    session: {
      messages: [
        {
          role: "user",
          content: normalizeContent(input),
        },
      ],
    },
    usage: {},
    ...(artifacts && Object.keys(artifacts).length > 0 ? { artifacts } : {}),
    errors: [serializeError(error)],
  };
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

function normalizeSimpleTraces(
  traces: SimpleTraceRecord[] | undefined,
): NormalizedTrace[] | undefined {
  if (!Array.isArray(traces)) {
    return undefined;
  }

  const normalized = traces
    .map(normalizeSimpleTrace)
    .filter((trace): trace is NormalizedTrace => Boolean(trace));

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSimpleTrace(trace: unknown): NormalizedTrace | undefined {
  if (!isJsonRecord(trace)) {
    return undefined;
  }

  const {
    metadata: rawMetadata,
    spans: rawSpans,
    ...traceFields
  } = trace as Partial<SimpleTraceRecord>;
  const spans = (Array.isArray(rawSpans) ? rawSpans : [])
    .map((span) => normalizeSimpleSpan(span))
    .filter((span): span is NormalizedSpan => Boolean(span));
  const metadata = isJsonRecord(rawMetadata)
    ? normalizeMetadata(rawMetadata)
    : undefined;

  if (spans.length === 0 && !traceFields.id && !traceFields.name) {
    return undefined;
  }

  return {
    ...traceFields,
    ...(metadata ? { metadata } : {}),
    spans,
  };
}

function normalizeSimpleSpan(span: unknown): NormalizedSpan | undefined {
  if (!isJsonRecord(span) || typeof span.name !== "string" || !span.name) {
    return undefined;
  }

  const {
    attributes: rawAttributes,
    error: rawError,
    events: rawEvents,
    ...spanFields
  } = span as Partial<SimpleSpanRecord> & { name: string };
  const attributes = rawAttributes
    ? isJsonRecord(rawAttributes)
      ? normalizeMetadata(rawAttributes)
      : undefined
    : undefined;
  const error = normalizeSpanError(rawError);
  const events = normalizeSimpleSpanEvents(rawEvents);

  return {
    ...spanFields,
    ...(attributes
      ? { attributes: attributes as NormalizedSpanAttributes }
      : {}),
    ...(error ? { error } : {}),
    ...(events ? { events } : {}),
  };
}

function normalizeSimpleSpanEvents(
  events: unknown,
): NormalizedSpanEvent[] | undefined {
  if (!Array.isArray(events)) {
    return undefined;
  }

  const normalized = events
    .map(normalizeSimpleSpanEvent)
    .filter((event): event is NormalizedSpanEvent => Boolean(event));

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSimpleSpanEvent(
  event: unknown,
): NormalizedSpanEvent | undefined {
  if (!isJsonRecord(event) || typeof event.name !== "string" || !event.name) {
    return undefined;
  }

  const { attributes: rawAttributes, ...eventFields } =
    event as Partial<SimpleSpanEvent> & { name: string };
  const attributes = rawAttributes
    ? isJsonRecord(rawAttributes)
      ? normalizeMetadata(rawAttributes)
      : undefined
    : undefined;

  return {
    ...eventFields,
    ...(attributes
      ? { attributes: attributes as NormalizedSpanAttributes }
      : {}),
  };
}

/** Normalizes arbitrary span errors while preserving object-shaped messages. */
export function normalizeSpanError(
  error: unknown,
): NormalizedSpan["error"] | undefined {
  if (error === undefined) {
    return undefined;
  }

  if (error instanceof Error) {
    const details = normalizeMetadata(
      error as unknown as Record<string, unknown>,
    );

    return {
      ...(details ?? {}),
      type: error.name,
      message: error.message,
    };
  }

  if (
    error &&
    typeof error === "object" &&
    !Array.isArray(error) &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const normalized = normalizeMetadata(error as Record<string, unknown>);
    const { message, type, ...details } = normalized ?? {};

    return {
      ...details,
      message: message as string,
      ...(typeof type === "string" ? { type } : {}),
    };
  }

  const serialized = serializeError(error);
  const { message, type, ...details } = serialized;

  return {
    ...details,
    message: typeof message === "string" ? message : String(message),
    ...(typeof type === "string" ? { type } : {}),
  };
}

/** Normalizes raw span attributes into the JSON-safe span attribute shape. */
export function normalizeSpanAttributes(
  attributes: Record<string, unknown>,
): NormalizedSpanAttributes | undefined {
  return normalizeMetadata(attributes) as NormalizedSpanAttributes | undefined;
}

/** Builds common OpenTelemetry GenAI usage attributes from a usage summary. */
export function createGenAiUsageAttributes(
  usage: UsageSummary | undefined,
  options: { provider?: string } = {},
) {
  return {
    "gen_ai.provider.name": usage?.provider ?? options.provider,
    "gen_ai.request.model": usage?.model,
    "gen_ai.response.model": usage?.model,
    "gen_ai.usage.input_tokens": usage?.inputTokens,
    "gen_ai.usage.output_tokens": usage?.outputTokens,
    "gen_ai.usage.reasoning.output_tokens": usage?.reasoningTokens,
  } satisfies Record<string, unknown>;
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
 * Converts normalized tool-call records into trace spans.
 *
 * Tool-call ids are preserved as GenAI attributes. Pass `spanIdPrefix` when the
 * spans belong to a known trace so span ids stay internally unique.
 */
export function createToolCallSpans(
  calls: ToolCallRecord[],
  options: CreateToolCallSpansOptions = {},
): NormalizedSpan[] {
  return calls.map((call, index) => {
    const spanError = call.error ? normalizeSpanError(call.error) : undefined;
    const spanId = options.spanIdPrefix
      ? `${options.spanIdPrefix}:${index + 1}`
      : call.id;

    return {
      ...(spanId ? { id: spanId } : {}),
      ...(options.traceId ? { traceId: options.traceId } : {}),
      ...(options.parentId ? { parentId: options.parentId } : {}),
      name: call.name,
      kind: "tool",
      ...(call.startedAt ? { startedAt: call.startedAt } : {}),
      ...(call.finishedAt ? { finishedAt: call.finishedAt } : {}),
      ...(call.durationMs !== undefined ? { durationMs: call.durationMs } : {}),
      status: spanError ? "error" : "ok",
      ...(spanError ? { error: spanError } : {}),
      attributes: normalizeSpanAttributes({
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": call.name,
        "gen_ai.tool.type": "function",
        ...(call.id ? { "gen_ai.tool.call.id": call.id } : {}),
        ...(call.arguments !== undefined
          ? { "gen_ai.tool.call.arguments": call.arguments }
          : {}),
        ...(call.result !== undefined
          ? { "gen_ai.tool.call.result": call.result }
          : {}),
      }),
    } satisfies NormalizedSpan;
  });
}

/**
 * Attaches a fallback run trace when a harness result does not already contain spans.
 *
 * This keeps custom harnesses inspectable while first-party harness packages
 * remain free to attach richer native traces.
 */
export function ensureRunTrace(
  run: HarnessRun,
  options: EnsureRunTraceOptions,
): NormalizedTrace | undefined {
  if (spans(run).length > 0) {
    return undefined;
  }

  const traceId = options.id ?? createGeneratedTraceId();
  const rootSpanId = `${traceId}:run`;
  const durationMs = options.finishedAt.getTime() - options.startedAt.getTime();
  const rootError =
    run.errors.length > 0 ? normalizeSpanError(run.errors[0]) : undefined;
  const runSpan: NormalizedSpan = {
    id: rootSpanId,
    traceId,
    name: options.name,
    kind: "run",
    startedAt: options.startedAt.toISOString(),
    finishedAt: options.finishedAt.toISOString(),
    durationMs,
    status: rootError ? "error" : "ok",
    ...(rootError ? { error: rootError } : {}),
    attributes: normalizeSpanAttributes({
      "gen_ai.operation.name": options.operationName ?? "invoke_workflow",
      "gen_ai.workflow.name": options.name,
      ...createGenAiUsageAttributes(run.usage),
    }),
  };
  const toolSpans = createToolCallSpans(toolCalls(run.session), {
    traceId,
    parentId: rootSpanId,
    spanIdPrefix: `${traceId}:tool`,
  });
  const trace: NormalizedTrace = {
    id: traceId,
    name: options.name,
    startedAt: options.startedAt.toISOString(),
    finishedAt: options.finishedAt.toISOString(),
    durationMs,
    ...(options.source ? { metadata: { source: options.source } } : {}),
    spans: [runSpan, ...toolSpans],
  };

  run.traces = [trace];
  return trace;
}

let nextGeneratedTraceId = 0;

function createGeneratedTraceId() {
  nextGeneratedTraceId += 1;
  return `trace_${nextGeneratedTraceId}`;
}

/**
 * Flattens every recorded span from a normalized harness run.
 *
 * @param run - Normalized harness run produced by a harness.
 *
 * @example
 * ```ts
 * const modelSpans = spans(result).filter((span) => span.kind === "model");
 * ```
 */
export function spans(run: HarnessRun): NormalizedSpan[] {
  return (run.traces ?? []).flatMap((trace) => trace.spans);
}

/**
 * Returns spans of one coarse operation kind from a normalized run.
 *
 * @param run - Normalized harness run produced by a harness.
 * @param kind - Span kind to keep.
 */
export function spansByKind(
  run: HarnessRun,
  kind: NonNullable<NormalizedSpan["kind"]>,
): NormalizedSpan[] {
  return spans(run).filter((span) => span.kind === kind);
}

/**
 * Returns every span that explicitly failed or carries a normalized error.
 *
 * @param run - Normalized harness run produced by a harness.
 */
export function failedSpans(run: HarnessRun): NormalizedSpan[] {
  return spans(run).filter((span) => span.status === "error" || span.error);
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

function hasNonEmptyMessageContent(message: NormalizedMessage) {
  return (
    message.content !== undefined &&
    (typeof message.content !== "string" || message.content.trim().length > 0)
  );
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
 * Returns the latest assistant message content, ignoring empty text messages.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const finalAnswer = latestAssistantMessageContent(result.session);
 * ```
 */
export function latestAssistantMessageContent(session: NormalizedSession) {
  return [...assistantMessages(session)]
    .reverse()
    .find(hasNonEmptyMessageContent)?.content;
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
