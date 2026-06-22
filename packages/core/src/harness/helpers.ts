import type {
  HarnessRun,
  TranscriptMessageEvent,
  NormalizedSession,
  NormalizedSpan,
  TranscriptToolResultEvent,
  NormalizedTrace,
  ToolCall,
} from "./index";
import type { JsonValue } from "../json";
import { isToolCallEvent, isToolResultEvent } from "./transcript";

/**
 * Returns every tool call observed in a normalized run or session.
 *
 * Tool results are joined from matching `tool_result` transcript events when
 * the transcript contains a result for the call.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const names = toolCalls(result).map((call) => call.name);
 *
 * expect(names).toEqual(["lookupInvoice", "createRefund"]);
 * ```
 */
export function toolCalls(run: HarnessRun): ToolCall[];
export function toolCalls(session: NormalizedSession): ToolCall[];
export function toolCalls(source: HarnessRun | NormalizedSession): ToolCall[] {
  const resultsById = new Map<string, TranscriptToolResultEvent>();
  for (const message of toolResultsFromSource(source)) {
    if (!resultsById.has(message.toolCallId)) {
      resultsById.set(message.toolCallId, message);
    }
  }

  return toolCallsFromSource(source).map((call) => {
    const result = resultsById.get(call.id);
    const normalizedCall = {
      name: call.name,
      ...(call.arguments ? { arguments: call.arguments } : {}),
    };

    if (!result) {
      return {
        ...normalizedCall,
        status: "pending",
      };
    }

    if (result.error) {
      return {
        ...normalizedCall,
        status: "error",
        error: result.error,
      };
    }

    return {
      ...normalizedCall,
      status: "ok",
      ...(result.content !== undefined ? { result: result.content } : {}),
    };
  });
}

/**
 * Flattens every recorded span from a normalized harness run or trace list.
 *
 * @param source - Normalized run or trace list produced by a harness.
 *
 * @example
 * ```ts
 * const modelSpans = spans(result).filter((span) => span.kind === "model");
 * ```
 */
export function spans(run: HarnessRun): NormalizedSpan[];
export function spans(
  traces: readonly NormalizedTrace[] | undefined,
): NormalizedSpan[];
export function spans(
  source: HarnessRun | readonly NormalizedTrace[] | undefined,
): NormalizedSpan[] {
  return spansFrom(source);
}

/**
 * Alias for `spans(...)` for consumers that prefer trace-oriented naming.
 *
 * @param source - Normalized run or trace list produced by a harness.
 */
export function traceSpans(run: HarnessRun): NormalizedSpan[];
export function traceSpans(
  traces: readonly NormalizedTrace[] | undefined,
): NormalizedSpan[];
export function traceSpans(
  source: HarnessRun | readonly NormalizedTrace[] | undefined,
): NormalizedSpan[] {
  return spansFrom(source);
}

/**
 * Returns spans of one coarse operation kind from a normalized run or trace list.
 *
 * @param source - Normalized run or trace list produced by a harness.
 * @param kind - Span kind to keep.
 */
export function spansByKind(
  run: HarnessRun,
  kind: NonNullable<NormalizedSpan["kind"]>,
): NormalizedSpan[];
export function spansByKind(
  traces: readonly NormalizedTrace[] | undefined,
  kind: NonNullable<NormalizedSpan["kind"]>,
): NormalizedSpan[];
export function spansByKind(
  source: HarnessRun | readonly NormalizedTrace[] | undefined,
  kind: NonNullable<NormalizedSpan["kind"]>,
): NormalizedSpan[] {
  return spansFrom(source).filter((span) => span.kind === kind);
}

/**
 * Returns every span that explicitly failed or carries a normalized error.
 *
 * @param source - Normalized run or trace list produced by a harness.
 */
export function failedSpans(run: HarnessRun): NormalizedSpan[];
export function failedSpans(
  traces: readonly NormalizedTrace[] | undefined,
): NormalizedSpan[];
export function failedSpans(
  source: HarnessRun | readonly NormalizedTrace[] | undefined,
): NormalizedSpan[] {
  return spansFrom(source).filter(
    (span) => span.status === "error" || span.error !== undefined,
  );
}

/**
 * Filters normalized session message events by role.
 *
 * @param source - Normalized run or session produced by a harness.
 * @param role - Message role to keep.
 *
 * @example
 * ```ts
 * const assistantText = messagesByRole(result, "assistant")
 *   .map((message) => message.content)
 *   .join("\n");
 * ```
 */
export function messagesByRole(
  run: HarnessRun,
  role: TranscriptMessageEvent["role"],
): TranscriptMessageEvent[];
export function messagesByRole(
  session: NormalizedSession,
  role: TranscriptMessageEvent["role"],
): TranscriptMessageEvent[];
export function messagesByRole(
  source: HarnessRun | NormalizedSession,
  role: TranscriptMessageEvent["role"],
): TranscriptMessageEvent[] {
  return sessionFrom(source).events.filter(
    (event): event is TranscriptMessageEvent =>
      event.type === "message" && event.role === role,
  );
}

/**
 * Returns every normalized system message event from a session.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const systemPrompts = systemMessages(result);
 * ```
 */
export function systemMessages(run: HarnessRun): TranscriptMessageEvent[];
export function systemMessages(
  session: NormalizedSession,
): TranscriptMessageEvent[];
export function systemMessages(
  source: HarnessRun | NormalizedSession,
): TranscriptMessageEvent[] {
  return messagesByRoleFromSource(source, "system");
}

/**
 * Returns every normalized user message event from a session.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const firstPrompt = userMessages(result)[0]?.content;
 * ```
 */
export function userMessages(run: HarnessRun): TranscriptMessageEvent[];
export function userMessages(
  session: NormalizedSession,
): TranscriptMessageEvent[];
export function userMessages(
  source: HarnessRun | NormalizedSession,
): TranscriptMessageEvent[] {
  return messagesByRoleFromSource(source, "user");
}

/**
 * Returns every normalized assistant message event from a session.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const finalAnswer = assistantMessages(result).at(-1)?.content;
 * ```
 */
export function assistantMessages(run: HarnessRun): TranscriptMessageEvent[];
export function assistantMessages(
  session: NormalizedSession,
): TranscriptMessageEvent[];
export function assistantMessages(
  source: HarnessRun | NormalizedSession,
): TranscriptMessageEvent[] {
  return messagesByRoleFromSource(source, "assistant");
}

/**
 * Returns the latest assistant message content, ignoring empty text messages.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const finalAnswer = latestAssistantMessageContent(result);
 * ```
 */
export function latestAssistantMessageContent(
  run: HarnessRun,
): JsonValue | undefined;
export function latestAssistantMessageContent(
  session: NormalizedSession,
): JsonValue | undefined;
export function latestAssistantMessageContent(
  source: HarnessRun | NormalizedSession,
) {
  return [...messagesByRoleFromSource(source, "assistant")]
    .reverse()
    .find(hasNonEmptyMessageContent)?.content;
}

/**
 * Returns every normalized tool-result event from a session.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const toolOutputs = toolMessages(result).map((message) => message.content);
 * ```
 */
export function toolMessages(run: HarnessRun): TranscriptToolResultEvent[];
export function toolMessages(
  session: NormalizedSession,
): TranscriptToolResultEvent[];
export function toolMessages(
  source: HarnessRun | NormalizedSession,
): TranscriptToolResultEvent[] {
  return toolResultsFromSource(source);
}

function sessionFrom(source: HarnessRun | NormalizedSession) {
  return "session" in source ? source.session : source;
}

function toolResultsFromSource(source: HarnessRun | NormalizedSession) {
  return sessionFrom(source).events.filter(isToolResultEvent);
}

function toolCallsFromSource(source: HarnessRun | NormalizedSession) {
  return sessionFrom(source).events.filter(isToolCallEvent);
}

function tracesFrom(
  source: HarnessRun | readonly NormalizedTrace[] | undefined,
): readonly NormalizedTrace[] {
  if (source === undefined) {
    return [];
  }
  if (isTraceList(source)) {
    return source;
  }
  return source.traces ?? [];
}

function spansFrom(
  source: HarnessRun | readonly NormalizedTrace[] | undefined,
): NormalizedSpan[] {
  return tracesFrom(source).flatMap((trace) => trace.spans);
}

function isTraceList(
  source: HarnessRun | readonly NormalizedTrace[],
): source is readonly NormalizedTrace[] {
  return Array.isArray(source);
}

function messagesByRoleFromSource(
  source: HarnessRun | NormalizedSession,
  role: TranscriptMessageEvent["role"],
) {
  return sessionFrom(source).events.filter(
    (event): event is TranscriptMessageEvent =>
      event.type === "message" && event.role === role,
  );
}

function hasNonEmptyMessageContent(message: TranscriptMessageEvent) {
  return (
    message.content !== undefined &&
    (typeof message.content !== "string" || message.content.trim().length > 0)
  );
}
