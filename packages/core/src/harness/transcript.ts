import { z } from "zod";
import { JsonObjectSchema, JsonValueSchema, type JsonValue } from "../json";
import { FiniteNumberSchema } from "../schema-utils";
import { NormalizedErrorSchema, type NormalizedError } from "./errors";

// Harness sessions store only ordered transcript events. Message-style inputs
// are a strict transport convenience that normalize into this model; provider
// wire formats should be mapped by their harness adapters first.

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

/** System/user message content accepted at harness input boundaries. */
export type TranscriptMessageContentInput = JsonValue;

type TranscriptMessageToolCallBase = Omit<
  TranscriptToolCallEvent,
  "type" | "id" | "name" | "arguments"
> & {
  /** Tool-call id when the message transport exposes one. */
  id?: string;
  /** JSON-safe tool arguments in the harness message contract. */
  arguments?: Record<string, JsonValue>;
};

/** Message-transport tool call accepted at harness input boundaries. */
export type TranscriptMessageToolCall = TranscriptMessageToolCallBase & {
  /** Tool name in the harness message contract. */
  name: string;
};

type TranscriptTopLevelToolMessage = Omit<
  TranscriptToolResultEvent,
  "type" | "toolCallId" | "content"
> & {
  role: "tool";
  toolCallId: string;
  content?: JsonValue | TranscriptMessageToolResultPart[];
};

/** Message-style transport accepted at harness input boundaries. */
export type TranscriptMessageInput =
  | {
      role: "system" | "user";
      content?: TranscriptMessageContentInput;
      metadata?: Record<string, JsonValue>;
    }
  | {
      role: "assistant";
      content?:
        | JsonValue
        | (TranscriptMessageTextPart | TranscriptMessageToolCallPart)[];
      toolCalls?: TranscriptMessageToolCall[];
      metadata?: Record<string, JsonValue>;
    }
  | TranscriptTopLevelToolMessage
  // AI SDK-style message arrays can carry one or more tool-result parts, each
  // with its own id, so the message itself does not need a top-level id.
  | {
      role: "tool";
      content: TranscriptMessageToolResultPart[];
      metadata?: Record<string, JsonValue>;
    };

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

      if (!hasTopLevelToolCallId(message)) {
        throw new TypeError("Tool result messages must include toolCallId.");
      }

      events.push(toolResultMessageEvent(message, message.toolCallId));
      continue;
    }

    const partEvents =
      message.role === "assistant" ? contentPartEvents(message) : undefined;
    const partEventsHaveToolCalls = partEvents?.some(
      (event) => event.type === "tool_call",
    );
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
    if (partEventsHaveToolCalls) {
      if ((message.toolCalls ?? []).length > 0) {
        throw new TypeError(
          "Assistant messages must not mix tool-call content parts with toolCalls.",
        );
      }
      continue;
    }

    const messageToolCalls = message.toolCalls ?? [];
    for (const [toolIndex, toolCall] of messageToolCalls.entries()) {
      const rawToolCall = toolCall as Record<string, unknown>;
      if (
        Object.prototype.hasOwnProperty.call(rawToolCall, "result") ||
        Object.prototype.hasOwnProperty.call(rawToolCall, "error")
      ) {
        throw new TypeError(
          "Assistant tool calls must use separate tool result messages.",
        );
      }
      if (typeof toolCall.name !== "string" || toolCall.name.length === 0) {
        throw new TypeError("Assistant tool calls must include name.");
      }
      const id =
        toolCall.id ?? `message-${messageIndex}:tool-call-${toolIndex}`;
      events.push({
        type: "tool_call",
        id,
        name: toolCall.name,
        ...normalizeToolCallArguments(toolCall.arguments),
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

/** Normalizes strict AI SDK-style content parts and rejects malformed tool parts. */
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
      if (message.role === "tool") {
        throw new TypeError("Text content parts require message role.");
      }
      events.push({
        type: "message",
        role: message.role,
        content: part.text,
        ...recordMetadata(message.metadata),
      });
      continue;
    }

    if (part.type === "tool-call") {
      if (
        message.role !== "assistant" ||
        typeof part.toolCallId !== "string" ||
        typeof part.toolName !== "string"
      ) {
        throw new TypeError(
          "Tool-call content parts require assistant role, toolCallId, and toolName.",
        );
      }

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

    if (part.type === "tool-result") {
      if (message.role !== "tool" || typeof part.toolCallId !== "string") {
        throw new TypeError(
          "Tool-result content parts require tool role and toolCallId.",
        );
      }
      if (hasTopLevelToolCallId(message)) {
        throw new TypeError(
          "Tool-result content parts must not include top-level toolCallId.",
        );
      }

      events.push({
        type: "tool_result",
        toolCallId: part.toolCallId,
        ...(typeof part.toolName === "string" ? { name: part.toolName } : {}),
        ...(part.output !== undefined ? { content: part.output } : {}),
        ...(part.error ? { error: part.error as NormalizedError } : {}),
        ...jsonTimeFields(part),
        ...jsonMetadata(part.metadata),
      });
      continue;
    }

    throw new TypeError(
      "Message content parts must use the harness message contract.",
    );
  }

  return events.length > 0 ? events : undefined;
}

function toolResultMessageEvent(
  message: TranscriptTopLevelToolMessage,
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

function hasTopLevelToolCallId(
  message: Extract<TranscriptMessageInput, { role: "tool" }>,
): message is TranscriptTopLevelToolMessage {
  return typeof (message as { toolCallId?: unknown }).toolCallId === "string";
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? { arguments: value as Record<string, JsonValue> }
    : {};
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
