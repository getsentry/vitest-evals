import { z } from "zod";
import { JsonObjectSchema, JsonValueSchema, type JsonValue } from "../json";
import { FiniteNumberSchema } from "../schema-utils";
import { NormalizedErrorSchema, type NormalizedError } from "./errors";

// Harness sessions store only ordered transcript events. OpenAI/AI SDK-inspired
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
  /** Transcript-local id used to link a result event. */
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

/** Text part accepted in AI SDK-style message content arrays. */
export type TranscriptMessageTextPart = {
  /** Content part discriminator. */
  type: "text";
  /** Message text for this ordered content part. */
  text: string;
  /** Extra JSON-safe metadata for this content part. */
  metadata?: Record<string, JsonValue>;
};

/** Tool-call part accepted in AI SDK-style assistant message content arrays. */
export type TranscriptMessageToolCallPart = Omit<
  TranscriptToolCallEvent,
  "type" | "id" | "name" | "arguments"
> & {
  /** Content part discriminator. */
  type: "tool-call";
  /** Tool-call id from the message transport. */
  toolCallId: string;
  /** Tool name from the message transport. */
  toolName: string;
  /** JSON-safe tool input from the message transport. */
  input?: JsonValue;
};

/** Tool-result part accepted in AI SDK-style tool message content arrays. */
export type TranscriptMessageToolResultPart = Omit<
  TranscriptToolResultEvent,
  "type" | "toolCallId" | "name" | "content"
> & {
  /** Content part discriminator. */
  type: "tool-result";
  /** Tool-call id this result responds to. */
  toolCallId: string;
  /** Tool name from the message transport. */
  toolName?: string;
  /** JSON-safe tool output from the message transport. */
  output?: JsonValue;
};

/** Ordered content part accepted in AI SDK-style message content arrays. */
export type TranscriptMessageContentPart =
  | TranscriptMessageTextPart
  | TranscriptMessageToolCallPart
  | TranscriptMessageToolResultPart;

/** Message content accepted at harness input boundaries. */
export type TranscriptMessageContentInput =
  | JsonValue
  | TranscriptMessageContentPart[];

/** Message-transport tool call accepted at harness input boundaries. */
export type TranscriptMessageToolCall = Omit<
  TranscriptToolCallEvent,
  "type" | "id" | "name" | "arguments"
> & {
  /** Tool-call id when the message transport exposes one. */
  id?: string;
  /** Provider tool-call type when callers pass provider messages directly. */
  type?: string;
  /** Tool name when callers use the normalized message transport. */
  name?: string;
  /** JSON-safe tool arguments when callers use the normalized message transport. */
  arguments?: Record<string, JsonValue>;
  /** OpenAI-style function payload when callers pass chat tool calls directly. */
  function?: {
    /** Tool name from the provider function payload. */
    name: string;
    /** JSON object or JSON-encoded object arguments. */
    arguments?: JsonValue;
  };
  /** JSON-safe inline result for message transports that nest outcomes. */
  result?: JsonValue;
  /** Inline error for message transports that nest outcomes. */
  error?: NormalizedError;
};

/** OpenAI/AI SDK-inspired message accepted at harness input boundaries. */
export type TranscriptMessageInput =
  | {
      role: "system" | "user";
      content?: TranscriptMessageContentInput;
      metadata?: Record<string, JsonValue>;
    }
  | {
      role: "assistant";
      content?: TranscriptMessageContentInput;
      toolCalls?: TranscriptMessageToolCall[];
      tool_calls?: TranscriptMessageToolCall[];
      metadata?: Record<string, JsonValue>;
    }
  | (Omit<TranscriptToolResultEvent, "type" | "toolCallId" | "content"> & {
      role: "tool";
      toolCallId?: string;
      tool_call_id?: string;
      content?: TranscriptMessageContentInput;
    });

/** Converts message-transport inputs into normalized transcript events. */
export function messagesToTranscriptEvents(
  messages: readonly TranscriptMessageInput[],
): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];

  for (const [messageIndex, message] of messages.entries()) {
    if (message.role === "tool") {
      const partEvents = contentPartEvents(message);
      if (partEvents) {
        events.push(...partEvents);
        continue;
      }

      const toolCallId = message.toolCallId ?? message.tool_call_id;
      if (!toolCallId) {
        throw new TypeError("Tool result messages must include toolCallId.");
      }

      events.push(toolResultMessageEvent(message, toolCallId));
      continue;
    }

    const partEvents = contentPartEvents(message);
    if (partEvents) {
      events.push(...partEvents);
    } else if (message.content !== undefined) {
      events.push({
        type: "message",
        role: message.role,
        content: message.content as JsonValue,
        ...(message.metadata ? { metadata: message.metadata } : {}),
      });
    }

    if (message.role !== "assistant") {
      continue;
    }

    const messageToolCalls = message.toolCalls ?? message.tool_calls ?? [];
    for (const [toolIndex, toolCall] of messageToolCalls.entries()) {
      const id =
        toolCall.id ?? `message-${messageIndex}:tool-call-${toolIndex}`;
      const name = toolCall.name ?? toolCall.function?.name;
      if (!name) {
        continue;
      }
      events.push({
        type: "tool_call",
        id,
        name,
        ...normalizeToolCallArguments(
          toolCall.arguments ?? toolCall.function?.arguments,
        ),
        ...(toolCall.startedAt ? { startedAt: toolCall.startedAt } : {}),
        ...(toolCall.finishedAt ? { finishedAt: toolCall.finishedAt } : {}),
        ...(toolCall.durationMs !== undefined
          ? { durationMs: toolCall.durationMs }
          : {}),
        ...(toolCall.metadata ? { metadata: toolCall.metadata } : {}),
      });
      if (toolCall.result !== undefined || toolCall.error) {
        events.push({
          type: "tool_result",
          toolCallId: id,
          name,
          ...(toolCall.result !== undefined
            ? { content: toolCall.result }
            : {}),
          ...(toolCall.error ? { error: toolCall.error } : {}),
          ...(toolCall.startedAt ? { startedAt: toolCall.startedAt } : {}),
          ...(toolCall.finishedAt ? { finishedAt: toolCall.finishedAt } : {}),
          ...(toolCall.durationMs !== undefined
            ? { durationMs: toolCall.durationMs }
            : {}),
          ...(toolCall.metadata ? { metadata: toolCall.metadata } : {}),
        });
      }
    }
  }

  return events;
}

function contentPartEvents(
  message: TranscriptMessageInput,
): TranscriptEvent[] | undefined {
  if (!Array.isArray(message.content)) {
    return undefined;
  }

  const events: TranscriptEvent[] = [];
  for (const part of message.content) {
    if (!isJsonObject(part) || typeof part.type !== "string") {
      continue;
    }

    if (part.type === "text" && typeof part.text === "string") {
      if (message.role !== "tool") {
        events.push({
          type: "message",
          role: message.role,
          content: part.text,
          ...recordMetadata(message.metadata),
        });
      }
      continue;
    }

    if (
      part.type === "tool-call" &&
      message.role === "assistant" &&
      typeof part.toolCallId === "string" &&
      typeof part.toolName === "string"
    ) {
      events.push({
        type: "tool_call",
        id: part.toolCallId,
        name: part.toolName,
        ...normalizeToolCallArguments(part.input),
        ...jsonTimeFields(part),
        ...jsonMetadata(part.metadata),
      });
      continue;
    }

    if (
      part.type === "tool-result" &&
      message.role === "tool" &&
      typeof part.toolCallId === "string"
    ) {
      events.push({
        type: "tool_result",
        toolCallId: part.toolCallId,
        ...(typeof part.toolName === "string" ? { name: part.toolName } : {}),
        ...(part.output !== undefined ? { content: part.output } : {}),
        ...(part.error ? { error: part.error as NormalizedError } : {}),
        ...jsonTimeFields(part),
        ...jsonMetadata(part.metadata),
      });
    }
  }

  return events.length > 0 ? events : undefined;
}

function toolResultMessageEvent(
  message: Extract<TranscriptMessageInput, { role: "tool" }>,
  toolCallId: string,
): TranscriptToolResultEvent {
  return {
    type: "tool_result",
    toolCallId,
    ...(message.name ? { name: message.name } : {}),
    ...(message.content !== undefined
      ? { content: message.content as JsonValue }
      : {}),
    ...(message.error ? { error: message.error } : {}),
    ...timeFields(message),
    ...recordMetadata(message.metadata),
  };
}

function timeFields(
  input: Pick<
    TranscriptToolCallEvent | TranscriptToolResultEvent,
    "startedAt" | "finishedAt" | "durationMs"
  >,
) {
  return {
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
  };
}

function recordMetadata(metadata: Record<string, JsonValue> | undefined) {
  return metadata ? { metadata } : {};
}

function jsonTimeFields(input: Record<string, JsonValue>) {
  return {
    ...(typeof input.startedAt === "string"
      ? { startedAt: input.startedAt }
      : {}),
    ...(typeof input.finishedAt === "string"
      ? { finishedAt: input.finishedAt }
      : {}),
    ...(typeof input.durationMs === "number"
      ? { durationMs: input.durationMs }
      : {}),
  };
}

function jsonMetadata(value: JsonValue | undefined) {
  return isJsonObject(value) ? { metadata: value } : {};
}

function normalizeToolCallArguments(value: JsonValue | undefined) {
  const parsed = typeof value === "string" ? parseJsonObject(value) : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? { arguments: parsed as Record<string, JsonValue> }
    : {};
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as JsonValue;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
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
