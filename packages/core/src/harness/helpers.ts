import type {
  HarnessRun,
  NormalizedMessage,
  NormalizedSession,
  NormalizedSpan,
  ToolCallRecord,
} from "./index";

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
 * Alias for `spans(...)` for consumers that prefer trace-oriented naming.
 *
 * @param run - Normalized harness run produced by a harness.
 */
export function traceSpans(run: HarnessRun): NormalizedSpan[] {
  return spans(run);
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
  return spans(run).filter(
    (span) => span.status === "error" || span.error !== undefined,
  );
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
 * const finalAnswer = assistantMessages(session).at(-1)?.content;
 * ```
 */
export function assistantMessages(
  session: NormalizedSession,
): NormalizedMessage[] {
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
 * const toolOutputs = toolMessages(session).map((message) => message.content);
 * ```
 */
export function toolMessages(session: NormalizedSession) {
  return messagesByRole(session, "tool");
}

function hasNonEmptyMessageContent(message: NormalizedMessage) {
  return (
    message.content !== undefined &&
    (typeof message.content !== "string" || message.content.trim().length > 0)
  );
}
