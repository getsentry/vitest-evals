import type {
  HarnessRun,
  NormalizedMessage,
  NormalizedSession,
  NormalizedSpan,
  NormalizedToolResultMessage,
  NormalizedTrace,
  ToolCall,
} from "./index";
import type { JsonValue } from "../json";

/**
 * Returns every tool call observed in a normalized run or session.
 *
 * Tool results are joined from matching `role: "tool"` transcript messages
 * when the transcript contains a result for the call.
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
  const resultsById = new Map<string, NormalizedToolResultMessage>();
  for (const message of toolResultsFromSource(source)) {
    if (!resultsById.has(message.toolCallId)) {
      resultsById.set(message.toolCallId, message);
    }
  }

  return toolCallsFromSource(source).map((call) => {
    const result = call.id ? resultsById.get(call.id) : undefined;
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
 * Filters normalized session messages by role.
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
  role: NormalizedMessage["role"],
): NormalizedMessage[];
export function messagesByRole(
  session: NormalizedSession,
  role: NormalizedMessage["role"],
): NormalizedMessage[];
export function messagesByRole(
  source: HarnessRun | NormalizedSession,
  role: NormalizedMessage["role"],
): NormalizedMessage[] {
  return sessionFrom(source).messages.filter(
    (message) => message.role === role,
  );
}

/**
 * Returns every normalized system message from a session.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const systemPrompts = systemMessages(result);
 * ```
 */
export function systemMessages(run: HarnessRun): NormalizedMessage[];
export function systemMessages(session: NormalizedSession): NormalizedMessage[];
export function systemMessages(
  source: HarnessRun | NormalizedSession,
): NormalizedMessage[] {
  return messagesByRoleFromSource(source, "system");
}

/**
 * Returns every normalized user message from a session.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const firstPrompt = userMessages(result)[0]?.content;
 * ```
 */
export function userMessages(run: HarnessRun): NormalizedMessage[];
export function userMessages(session: NormalizedSession): NormalizedMessage[];
export function userMessages(
  source: HarnessRun | NormalizedSession,
): NormalizedMessage[] {
  return messagesByRoleFromSource(source, "user");
}

/**
 * Returns every normalized assistant message from a session.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const finalAnswer = assistantMessages(result).at(-1)?.content;
 * ```
 */
export function assistantMessages(run: HarnessRun): NormalizedMessage[];
export function assistantMessages(
  session: NormalizedSession,
): NormalizedMessage[];
export function assistantMessages(
  source: HarnessRun | NormalizedSession,
): NormalizedMessage[] {
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
 * Returns every normalized tool message from a session.
 *
 * @param source - Normalized run or session produced by a harness.
 *
 * @example
 * ```ts
 * const toolOutputs = toolMessages(result).map((message) => message.content);
 * ```
 */
export function toolMessages(run: HarnessRun): NormalizedToolResultMessage[];
export function toolMessages(
  session: NormalizedSession,
): NormalizedToolResultMessage[];
export function toolMessages(
  source: HarnessRun | NormalizedSession,
): NormalizedToolResultMessage[] {
  return toolResultsFromSource(source);
}

function sessionFrom(source: HarnessRun | NormalizedSession) {
  return "session" in source ? source.session : source;
}

function toolResultsFromSource(source: HarnessRun | NormalizedSession) {
  return sessionFrom(source).messages.filter(isToolResultMessage);
}

function toolCallsFromSource(source: HarnessRun | NormalizedSession) {
  return sessionFrom(source).messages.flatMap((message) =>
    message.role === "assistant" ? (message.toolCalls ?? []) : [],
  );
}

function isToolResultMessage(
  message: NormalizedMessage,
): message is NormalizedToolResultMessage {
  return message.role === "tool";
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
  role: NormalizedMessage["role"],
) {
  return sessionFrom(source).messages.filter(
    (message) => message.role === role,
  );
}

function hasNonEmptyMessageContent(message: NormalizedMessage) {
  return (
    message.content !== undefined &&
    (typeof message.content !== "string" || message.content.trim().length > 0)
  );
}
