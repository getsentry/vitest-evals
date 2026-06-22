import { z } from "zod";
import { JsonObjectSchema, JsonValueSchema, type JsonValue } from "../json";
import { FiniteNumberSchema } from "../schema-utils";
import { NormalizedErrorSchema, type NormalizedError } from "./errors";

// Harness sessions store only ordered transcript events. Provider-style
// messages are an input-boundary convenience that normalize into this model.

/** Tool-call event captured in a harness transcript. */
export const TranscriptToolCallEventSchema = z
  .object({
    type: z.literal("tool_call"),
    id: z.string(),
    name: z.string(),
    arguments: JsonObjectSchema.optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Message event captured in a harness transcript. */
export const TranscriptMessageEventSchema = z
  .object({
    type: z.literal("message"),
    role: z.enum(["system", "user", "assistant"]),
    content: JsonValueSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Tool-result event captured in a harness transcript. */
export const TranscriptToolResultEventSchema = z
  .object({
    type: z.literal("tool_result"),
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

/** Transcript event captured in a harness session. */
export const TranscriptEventSchema = z.discriminatedUnion("type", [
  TranscriptMessageEventSchema,
  TranscriptToolCallEventSchema,
  TranscriptToolResultEventSchema,
]);

/** Message event captured in a harness transcript. */
export type TranscriptMessageEvent = {
  /** Transcript event discriminator. */
  type: "message";
  /** Message role. Tool activity is represented by separate tool events. */
  role: "system" | "user" | "assistant";
  /** JSON-safe message content. */
  content?: JsonValue;
  /** Extra JSON-safe message metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Tool-call event captured in a harness transcript. */
export type TranscriptToolCallEvent = {
  /** Transcript event discriminator. */
  type: "tool_call";
  /** Provider, runtime, or harness-generated id used to link a result event. */
  id: string;
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

/** Tool-result event captured in a harness transcript. */
export type TranscriptToolResultEvent = {
  /** Transcript event discriminator. */
  type: "tool_result";
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
  /** Extra JSON-safe tool-result metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Transcript event captured in a harness session. */
export type TranscriptEvent =
  | TranscriptMessageEvent
  | TranscriptToolCallEvent
  | TranscriptToolResultEvent;

/** Provider-style tool call accepted at harness input boundaries. */
export type TranscriptMessageToolCall = Omit<
  TranscriptToolCallEvent,
  "type" | "id"
> & {
  /** Provider or runtime tool-call id used to link result events. */
  id: string;
};

/** Provider-style message accepted at harness input boundaries. */
export type TranscriptMessageInput =
  | {
      role: "system" | "user";
      content?: JsonValue;
      metadata?: Record<string, JsonValue>;
    }
  | {
      role: "assistant";
      content?: JsonValue;
      toolCalls?: TranscriptMessageToolCall[];
      metadata?: Record<string, JsonValue>;
    }
  | (Omit<TranscriptToolResultEvent, "type"> & {
      role: "tool";
    });

/** Converts provider-style messages into normalized transcript events. */
export function messagesToTranscriptEvents(
  messages: readonly TranscriptMessageInput[],
): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];

  for (const message of messages) {
    if (message.role === "tool") {
      events.push({
        type: "tool_result",
        toolCallId: message.toolCallId,
        ...(message.name ? { name: message.name } : {}),
        ...(message.content !== undefined ? { content: message.content } : {}),
        ...(message.error ? { error: message.error } : {}),
        ...(message.startedAt ? { startedAt: message.startedAt } : {}),
        ...(message.finishedAt ? { finishedAt: message.finishedAt } : {}),
        ...(message.durationMs !== undefined
          ? { durationMs: message.durationMs }
          : {}),
        ...(message.metadata ? { metadata: message.metadata } : {}),
      });
      continue;
    }

    if (message.content !== undefined) {
      events.push({
        type: "message",
        role: message.role,
        content: message.content,
        ...(message.metadata ? { metadata: message.metadata } : {}),
      });
    }

    if (message.role !== "assistant") {
      continue;
    }

    for (const toolCall of message.toolCalls ?? []) {
      events.push({
        type: "tool_call",
        id: toolCall.id,
        name: toolCall.name,
        ...(toolCall.arguments !== undefined
          ? { arguments: toolCall.arguments }
          : {}),
        ...(toolCall.startedAt ? { startedAt: toolCall.startedAt } : {}),
        ...(toolCall.finishedAt ? { finishedAt: toolCall.finishedAt } : {}),
        ...(toolCall.durationMs !== undefined
          ? { durationMs: toolCall.durationMs }
          : {}),
        ...(toolCall.metadata ? { metadata: toolCall.metadata } : {}),
      });
    }
  }

  return events;
}

/** Returns true for normalized message transcript events. */
export function isMessageEvent(
  event: TranscriptEvent,
): event is TranscriptMessageEvent {
  return event.type === "message";
}

/** Returns true for normalized tool-call transcript events. */
export function isToolCallEvent(
  event: TranscriptEvent,
): event is TranscriptToolCallEvent {
  return event.type === "tool_call";
}

/** Returns true for normalized tool-result transcript events. */
export function isToolResultEvent(
  event: TranscriptEvent,
): event is TranscriptToolResultEvent {
  return event.type === "tool_result";
}
