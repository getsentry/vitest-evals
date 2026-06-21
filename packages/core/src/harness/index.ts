import { z } from "zod";
import type { NormalizedSpanAttributes } from "../genai";
import { JsonObjectSchema, JsonValueSchema, type JsonValue } from "../json";
import { FiniteNumberSchema } from "../schema-utils";

/** Normalized error attached to tool calls and spans. */
export type NormalizedError = {
  /** Human-readable failure message. */
  message: string;
  /** Optional provider or runtime error type. */
  type?: string;
  /** Extra JSON-safe error metadata. */
  [key: string]: JsonValue | undefined;
};

/** Usage values normalized by vitest-evals harnesses. */
export const UsageSummarySchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    inputTokens: FiniteNumberSchema.optional(),
    outputTokens: FiniteNumberSchema.optional(),
    reasoningTokens: FiniteNumberSchema.optional(),
    totalTokens: FiniteNumberSchema.optional(),
    toolCalls: FiniteNumberSchema.optional(),
    retries: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Usage values normalized by vitest-evals harnesses. */
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

/** Timing values normalized by vitest-evals harnesses. */
export const TimingSummarySchema = z
  .object({
    totalMs: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Timing values normalized by vitest-evals harnesses. */
export type TimingSummary = {
  /** End-to-end run duration in milliseconds. */
  totalMs?: number;
  /** Extra JSON-safe timing metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Normalized error object captured in a tool result or trace span. */
export const NormalizedErrorSchema = z
  .object({
    message: z.string(),
    type: z.string().optional(),
  })
  .catchall(JsonValueSchema);

/** Normalized tool call requested by an assistant message. */
export const ToolCallRecordSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    arguments: JsonObjectSchema.optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Normalized tool call requested by an assistant message. */
export type ToolCallRecord = {
  /** Provider or runtime tool-call id when one is available. */
  id?: string;
  /** Tool name as exposed to the agent or application runtime. */
  name: string;
  /** JSON-safe tool arguments after provider/runtime normalization. */
  arguments?: Record<string, JsonValue>;
  /** ISO timestamp for the start of tool execution. */
  startedAt?: string;
  /** ISO timestamp for the end of tool execution. */
  finishedAt?: string;
  /** Tool execution duration in milliseconds. */
  durationMs?: number;
  /** Extra JSON-safe tool metadata for reporters and custom judges. */
  metadata?: Record<string, JsonValue>;
};

/** Normalized system message captured in a harness session. */
export const NormalizedSystemMessageSchema = z
  .object({
    role: z.literal("system"),
    content: JsonValueSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Normalized user message captured in a harness session. */
export const NormalizedUserMessageSchema = z
  .object({
    role: z.literal("user"),
    content: JsonValueSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Normalized assistant message captured in a harness session. */
export const NormalizedAssistantMessageSchema = z
  .object({
    role: z.literal("assistant"),
    content: JsonValueSchema.optional(),
    toolCalls: z.array(ToolCallRecordSchema).optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Normalized tool-result message captured in a harness session. */
export const NormalizedToolResultMessageSchema = z
  .object({
    role: z.literal("tool"),
    toolCallId: z.string(),
    name: z.string().optional(),
    content: JsonValueSchema.optional(),
    error: NormalizedErrorSchema.optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

const ToolCallBaseSchema = z
  .object({
    name: z.string(),
    arguments: JsonObjectSchema.optional(),
  })
  .strict();

/** Tool call observed in a normalized session, with result status when known. */
export const ToolCallSchema = z.discriminatedUnion("status", [
  ToolCallBaseSchema.extend({
    status: z.literal("pending"),
  }).strict(),
  ToolCallBaseSchema.extend({
    status: z.literal("ok"),
    result: JsonValueSchema.optional(),
  }).strict(),
  ToolCallBaseSchema.extend({
    status: z.literal("error"),
    error: NormalizedErrorSchema,
  }).strict(),
]);

/** Normalized system message captured in a harness session. */
export type NormalizedSystemMessage = {
  /** Transcript role for the normalized message. */
  role: "system";
  /** JSON-safe message content. */
  content?: JsonValue;
  /** Extra JSON-safe message metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Normalized user message captured in a harness session. */
export type NormalizedUserMessage = {
  /** Transcript role for the normalized message. */
  role: "user";
  /** JSON-safe message content. */
  content?: JsonValue;
  /** Extra JSON-safe message metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Normalized assistant message captured in a harness session. */
export type NormalizedAssistantMessage = {
  /** Transcript role for the normalized message. */
  role: "assistant";
  /** JSON-safe assistant message content. */
  content?: JsonValue;
  /** Tool calls requested by this assistant message. */
  toolCalls?: ToolCallRecord[];
  /** Extra JSON-safe message metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Normalized tool-result message captured in a harness session. */
export type NormalizedToolResultMessage = {
  /** Transcript role for the normalized message. */
  role: "tool";
  /** Tool-call id this result responds to. */
  toolCallId: string;
  /** Tool name when available from the provider or runtime. */
  name?: string;
  /** JSON-safe tool result content. */
  content?: JsonValue;
  /** Normalized tool error when execution failed. */
  error?: NormalizedError;
  /** ISO timestamp for the start of tool execution. */
  startedAt?: string;
  /** ISO timestamp for the end of tool execution. */
  finishedAt?: string;
  /** Tool execution duration in milliseconds. */
  durationMs?: number;
  /** Extra JSON-safe message metadata. */
  metadata?: Record<string, JsonValue>;
};

type ToolCallBase = {
  /** Tool name as exposed to the agent or application runtime. */
  name: string;
  /** JSON-safe tool arguments after provider/runtime normalization. */
  arguments?: Record<string, JsonValue>;
};

/** Tool call observed in a normalized session, with result status when known. */
export type ToolCall =
  | (ToolCallBase & {
      /** Lifecycle status for a tool call without a matching result message. */
      status: "pending";
    })
  | (ToolCallBase & {
      /** Lifecycle status for a tool call with a successful result message. */
      status: "ok";
      /** JSON-safe tool result content when execution produced content. */
      result?: JsonValue;
    })
  | (ToolCallBase & {
      /** Lifecycle status for a tool call with an error result message. */
      status: "error";
      /** Normalized tool error captured by the result message. */
      error: NormalizedError;
    });

/** Normalized transcript message captured in a harness session. */
export const NormalizedMessageSchema = z.union([
  NormalizedSystemMessageSchema,
  NormalizedUserMessageSchema,
  NormalizedAssistantMessageSchema,
  NormalizedToolResultMessageSchema,
]);

/** Normalized transcript message captured in a harness session. */
export type NormalizedMessage =
  | NormalizedSystemMessage
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | NormalizedToolResultMessage;

/** Normalized transcript produced by an application harness. */
export const NormalizedSessionSchema = z
  .object({
    messages: z.array(NormalizedMessageSchema).default([]),
    provider: z.string().optional(),
    model: z.string().optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Normalized transcript produced by an application harness. */
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

/** Attribute schema attached to normalized traces, spans, and events. */
export const NormalizedSpanAttributesSchema = JsonObjectSchema;

/** Event attached to a normalized span. */
export const NormalizedSpanEventSchema = z
  .object({
    name: z.string(),
    timestamp: z.string().optional(),
    attributes: NormalizedSpanAttributesSchema.optional(),
  })
  .strict();

/** Event attached to a normalized span. */
export type NormalizedSpanEvent = {
  /** Event name emitted by the runtime or harness. */
  name: string;
  /** ISO timestamp for the event when available. */
  timestamp?: string;
  /** JSON-safe event attributes. */
  attributes?: NormalizedSpanAttributes;
};

/** Normalized operation span captured during a harness run. */
export const NormalizedSpanSchema = z
  .object({
    id: z.string().optional(),
    traceId: z.string().optional(),
    parentId: z.string().optional(),
    name: z.string(),
    kind: z
      .enum(["run", "agent", "model", "tool", "guardrail", "handoff", "custom"])
      .optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: FiniteNumberSchema.optional(),
    status: z.enum(["ok", "error"]).optional(),
    error: NormalizedErrorSchema.optional(),
    attributes: NormalizedSpanAttributesSchema.optional(),
    events: z.array(NormalizedSpanEventSchema).optional(),
  })
  .strict();

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
  error?: NormalizedError;
  /** JSON-safe operation attributes. */
  attributes?: NormalizedSpanAttributes;
  /** Events observed inside this span. */
  events?: NormalizedSpanEvent[];
};

/** Normalized trace captured during a harness run. */
export const NormalizedTraceSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
    spans: z.array(NormalizedSpanSchema).default([]),
  })
  .strict();

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

/** Full normalized harness run as stored in Vitest assertion metadata. */
export const HarnessRunSchema = z
  .object({
    output: JsonValueSchema.optional(),
    session: NormalizedSessionSchema,
    usage: UsageSummarySchema,
    timings: TimingSummarySchema.optional(),
    artifacts: JsonObjectSchema.optional(),
    traces: z.array(NormalizedTraceSchema).optional(),
    errors: z.array(JsonObjectSchema).default([]),
  })
  .strict();

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
  /** Attached normalized harness run recovered from a thrown error. */
  vitestEvalsRun: HarnessRun;
};
