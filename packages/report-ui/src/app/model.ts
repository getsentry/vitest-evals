import {
  toolCalls,
  type HarnessRun,
  type JsonValue,
  type NormalizedError,
  type NormalizedMessage,
  type NormalizedSpan,
  type ReportCase,
  type ReportWorkspace,
  type ToolCallRecord,
} from "@vitest-evals/core";

export type CaseStatusFilter = "all" | ReportCase["status"];

export type CaseFilters = {
  query: string;
  status: CaseStatusFilter;
  runId: string;
};

export type WorkspaceSummary = {
  runCount: number;
  caseCount: number;
  passed: number;
  failed: number;
  skipped: number;
  averageScore?: number;
  totalTokens: number;
  toolCallCount: number;
  durationMs?: number;
};

export type SpanNode = NormalizedSpan & {
  nodeId: string;
  children: SpanNode[];
};

export type TranscriptMessage = {
  kind: "message";
  id: string;
  role: NormalizedMessage["role"];
  content?: JsonValue;
  spanId?: string;
};

export type TranscriptToolEvent = {
  kind: "tool";
  id: string;
  name: string;
  arguments?: JsonValue;
  result?: JsonValue;
  error?: NormalizedError;
  durationMs?: number;
  status?: NormalizedSpan["status"];
  spanId?: string;
  callId?: string;
};

export type TranscriptSpanEvent = {
  kind: "span";
  id: string;
  operation: TranscriptOperation;
};

export type TranscriptEvent =
  | TranscriptMessage
  | TranscriptToolEvent
  | TranscriptSpanEvent;

export type TranscriptOperation = {
  id: string;
  kind: NonNullable<NormalizedSpan["kind"]> | "retrieval";
  name: string;
  label: string;
  status?: NormalizedSpan["status"];
  durationMs?: number;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  query?: string;
  arguments?: JsonValue;
  result?: JsonValue;
  documents?: JsonValue;
  error?: NormalizedError;
  attributes?: NormalizedSpan["attributes"];
};

type TraceMessage = {
  content?: JsonValue;
  role: NormalizedMessage["role"];
};

export type Transcript = {
  events: TranscriptEvent[];
};

/** Builds dashboard-level summary values from a collected report workspace. */
export function summarizeWorkspace(
  workspace: ReportWorkspace,
): WorkspaceSummary {
  const scores = workspace.cases
    .map((testCase) => testCase.eval?.avgScore)
    .filter((score): score is number => typeof score === "number");

  return {
    runCount: workspace.runs.length,
    caseCount: workspace.cases.length,
    passed: workspace.cases.filter((testCase) => testCase.status === "passed")
      .length,
    failed: workspace.cases.filter((testCase) => testCase.status === "failed")
      .length,
    skipped: workspace.cases.filter((testCase) =>
      ["skipped", "pending", "todo", "disabled"].includes(testCase.status),
    ).length,
    averageScore:
      scores.length > 0
        ? scores.reduce((total, score) => total + score, 0) / scores.length
        : undefined,
    totalTokens: workspace.cases.reduce(
      (total, testCase) => total + totalTokensFor(testCase.harness?.run),
      0,
    ),
    toolCallCount: workspace.cases.reduce(
      (total, testCase) => total + (toolCallCountForCase(testCase) ?? 0),
      0,
    ),
    durationMs: workspaceDurationMs(workspace.runs),
  };
}

/** Filters cases for the report explorer. */
export function filterReportCases(cases: ReportCase[], filters: CaseFilters) {
  const query = filters.query.trim().toLowerCase();
  return cases.filter((testCase) => {
    if (filters.status !== "all" && testCase.status !== filters.status) {
      return false;
    }
    if (filters.runId !== "all" && testCase.runId !== filters.runId) {
      return false;
    }
    if (!query) {
      return true;
    }

    return searchableCaseText(testCase).includes(query);
  });
}

/** Returns every tool call captured for a report case. */
export function caseToolCalls(testCase: ReportCase) {
  return toolCallsForCase(testCase);
}

/** Returns the best available token total for a report case. */
export function caseTotalTokens(testCase: ReportCase) {
  const run = testCase.harness?.run;
  if (!run) {
    return undefined;
  }
  return totalTokensFor(run);
}

/** Returns the best available tool call count for a report case. */
export function caseToolCallCount(testCase: ReportCase) {
  return toolCallCountForCase(testCase);
}

/** Returns every trace span captured for a report case. */
export function caseSpans(testCase: ReportCase) {
  return (
    testCase.harness?.run?.traces?.flatMap((trace) => trace.spans) ?? []
  ).sort(compareSpans);
}

/** Builds a stable parent/child span tree for one normalized trace. */
export function buildSpanTree(spans: NormalizedSpan[]) {
  const nodes = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  spans.forEach((span, index) => {
    const nodeId = span.id ?? `${span.traceId ?? "trace"}:${index}`;
    nodes.set(nodeId, {
      ...span,
      nodeId,
      children: [],
    });
  });

  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of nodes.values()) {
    node.children.sort(compareSpans);
  }

  return roots.sort(compareSpans);
}

/** Builds a readable transcript projection from GenAI trace spans. */
export function buildTranscript(run: HarnessRun): Transcript {
  return {
    events: transcriptEvents(run),
  };
}

export function scoreTone(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return "empty";
  }
  if (score >= 0.9) {
    return "good";
  }
  if (score >= 0.6) {
    return "warn";
  }
  return "bad";
}

export function formatScore(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return "n/a";
  }
  return `${Math.round(score * 100)}%`;
}

export function formatDuration(value: number | undefined) {
  if (value === undefined) {
    return "n/a";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
}

export function formatNumber(value: number | undefined) {
  return value === undefined ? "n/a" : new Intl.NumberFormat().format(value);
}

export function formatJson(value: unknown) {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function totalTokensFor(run: HarnessRun | undefined) {
  if (!run) {
    return 0;
  }
  return (
    run.usage.totalTokens ??
    (run.usage.inputTokens ?? 0) +
      (run.usage.outputTokens ?? 0) +
      (run.usage.reasoningTokens ?? 0)
  );
}

function toolCallsForCase(testCase: ReportCase) {
  const run = testCase.harness?.run;
  const runToolCalls = run ? toolCalls(run.session) : [];
  return runToolCalls.length > 0
    ? runToolCalls
    : (testCase.eval?.toolCalls ?? []);
}

function toolCallCountForCase(testCase: ReportCase) {
  const run = testCase.harness?.run;
  const sessionToolCallCount = run ? toolCalls(run.session).length : 0;
  const evalToolCallCount = testCase.eval?.toolCalls?.length ?? 0;
  if (run?.usage.toolCalls !== undefined) {
    return Math.max(
      run.usage.toolCalls,
      sessionToolCallCount,
      evalToolCallCount,
    );
  }

  if (!run && !testCase.eval?.toolCalls) {
    return undefined;
  }

  return Math.max(sessionToolCallCount, evalToolCallCount);
}

function workspaceDurationMs(runs: ReportWorkspace["runs"]) {
  const durations = runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => isFiniteNumber(duration));
  const intervals = runs.flatMap((run) => {
    if (!isFiniteNumber(run.startedAt) || !isFiniteNumber(run.durationMs)) {
      return [];
    }

    return [
      {
        end: run.startedAt + run.durationMs,
        start: run.startedAt,
      },
    ];
  });

  if (intervals.length > 0 && intervals.length === durations.length) {
    const start = Math.min(...intervals.map((interval) => interval.start));
    const end = Math.max(...intervals.map((interval) => interval.end));
    return Math.max(0, end - start);
  }

  if (durations.length === 0) {
    return undefined;
  }

  return durations.reduce((total, duration) => total + duration, 0);
}

function transcriptEvents(run: HarnessRun) {
  const traceEvents = traceTranscriptEvents(run);
  if (traceEvents.length === 0) {
    return sessionTranscriptEvents(run);
  }

  return traceEvents.some((event) => event.kind === "message")
    ? traceEvents
    : [...sessionMessageEvents(run), ...traceEvents];
}

function sessionMessageEvents(run: HarnessRun) {
  return run.session.messages.flatMap((message, messageIndex) =>
    message.content === undefined
      ? []
      : [
          {
            content: message.content,
            id: `message-${messageIndex}`,
            kind: "message" as const,
            role: message.role,
          },
        ],
  );
}

function sessionTranscriptEvents(run: HarnessRun) {
  const events: TranscriptEvent[] = [];
  run.session.messages.forEach((message, messageIndex) => {
    events.push({
      content: message.content,
      id: `message-${messageIndex}`,
      kind: "message",
      role: message.role,
    });
    events.push(
      ...(message.toolCalls ?? []).map(
        (call, toolIndex): TranscriptToolEvent => ({
          arguments: call.arguments,
          callId: call.id,
          durationMs: call.durationMs,
          error: call.error,
          id: call.id ?? `message-${messageIndex}:tool-${toolIndex}`,
          kind: "tool",
          name: call.name,
          result: call.result,
        }),
      ),
    );
  });
  return events;
}

function traceTranscriptEvents(run: HarnessRun) {
  const events: TranscriptEvent[] = [];
  const messages: TraceMessage[] = [];
  for (const [index, span] of sortedRunSpans(run).entries()) {
    const attributes = span.attributes;
    events.push(
      ...appendTraceMessages(
        messages,
        attributes?.["gen_ai.input.messages"],
        span,
        "input",
      ),
    );
    events.push(
      ...appendTraceMessages(
        messages,
        attributes?.["gen_ai.output.messages"],
        span,
        "output",
      ),
    );

    if (operationKind(span) === "tool") {
      events.push(traceToolEvent(span, index));
      continue;
    }

    if (operationKind(span) === "retrieval" || shouldRenderSpanEvent(span)) {
      events.push({
        id: span.id ?? `span-${index}`,
        kind: "span",
        operation: transcriptOperation(span, index),
      });
    }
  }

  return events;
}

function appendTraceMessages(
  existingMessages: TraceMessage[],
  value: JsonValue | undefined,
  span: NormalizedSpan,
  direction: "input" | "output",
) {
  const snapshot = jsonMessages(value);
  if (snapshot.length === 0) {
    return [];
  }

  const startIndex = commonPrefixLength(existingMessages, snapshot);
  const nextMessages = snapshot.slice(startIndex);
  existingMessages.push(...nextMessages);

  return nextMessages.map((message, index): TranscriptMessage => {
    const messageIndex = startIndex + index;
    return {
      content: message.content,
      id: `${span.id ?? "span"}:${direction}:message-${messageIndex}`,
      kind: "message",
      role: message.role,
      spanId: span.id,
    };
  });
}

function jsonMessages(value: JsonValue | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): TraceMessage[] => {
    if (!isJsonObject(entry)) {
      return [];
    }
    const role = messageRole(entry.role);
    if (!role) {
      return [];
    }

    const content = entry.content;
    return [
      {
        content,
        role,
      },
    ];
  });
}

function commonPrefixLength(
  existingMessages: TraceMessage[],
  snapshot: TraceMessage[],
) {
  let index = 0;
  while (
    index < existingMessages.length &&
    index < snapshot.length &&
    sameTraceMessage(existingMessages[index], snapshot[index])
  ) {
    index += 1;
  }
  return index;
}

function sameTraceMessage(
  left: TraceMessage | undefined,
  right: TraceMessage | undefined,
) {
  return (
    left?.role === right?.role &&
    formatJson(left?.content) === formatJson(right?.content)
  );
}

function transcriptOperation(
  span: NormalizedSpan,
  index: number,
): TranscriptOperation {
  const attributes = span.attributes;
  const inferredKind = operationKind(span);
  return {
    id: span.id ?? `operation-${index}`,
    kind: inferredKind,
    name:
      stringAttribute(attributes, "gen_ai.tool.name") ??
      stringAttribute(attributes, "gen_ai.request.model") ??
      stringAttribute(attributes, "gen_ai.workflow.name") ??
      span.name,
    label:
      stringAttribute(attributes, "gen_ai.operation.name") ??
      operationLabel(inferredKind),
    status: span.status,
    durationMs: span.durationMs,
    provider: stringAttribute(attributes, "gen_ai.provider.name"),
    model:
      stringAttribute(attributes, "gen_ai.response.model") ??
      stringAttribute(attributes, "gen_ai.request.model"),
    inputTokens: numberAttribute(attributes, "gen_ai.usage.input_tokens"),
    outputTokens: numberAttribute(attributes, "gen_ai.usage.output_tokens"),
    reasoningTokens: numberAttribute(
      attributes,
      "gen_ai.usage.reasoning.output_tokens",
    ),
    query: stringAttribute(attributes, "gen_ai.retrieval.query.text"),
    arguments: attributes?.["gen_ai.tool.call.arguments"],
    result: attributes?.["gen_ai.tool.call.result"],
    documents: attributes?.["gen_ai.retrieval.documents"],
    error: span.error,
    attributes,
  };
}

function sortedRunSpans(run: HarnessRun) {
  return (run.traces ?? []).flatMap((trace) => trace.spans).sort(compareSpans);
}

function operationKind(span: NormalizedSpan): TranscriptOperation["kind"] {
  if (span.attributes?.["gen_ai.retrieval.query.text"]) {
    return "retrieval";
  }
  return span.kind ?? "custom";
}

function operationLabel(kind: TranscriptOperation["kind"]) {
  switch (kind) {
    case "agent":
      return "Agent";
    case "model":
      return "Model";
    case "tool":
      return "Tool";
    case "retrieval":
      return "Retrieval";
    case "guardrail":
      return "Guardrail";
    case "handoff":
      return "Handoff";
    case "run":
      return "Run";
    default:
      return "Event";
  }
}

function traceToolEvent(
  span: NormalizedSpan,
  index: number,
): TranscriptToolEvent {
  const attributes = span.attributes;
  return {
    arguments: attributes?.["gen_ai.tool.call.arguments"],
    callId: stringAttribute(attributes, "gen_ai.tool.call.id"),
    durationMs: span.durationMs,
    error: span.error,
    id: span.id ?? `tool-${index}`,
    kind: "tool",
    name: stringAttribute(attributes, "gen_ai.tool.name") ?? span.name,
    result: attributes?.["gen_ai.tool.call.result"],
    spanId: span.id,
    status: span.status,
  };
}

function shouldRenderSpanEvent(span: NormalizedSpan) {
  return (
    span.status === "error" ||
    Boolean(span.error) ||
    span.kind === "guardrail" ||
    span.kind === "handoff"
  );
}

function stringAttribute(
  attributes: NormalizedSpan["attributes"] | undefined,
  key: string,
) {
  const value = attributes?.[key];
  return typeof value === "string" ? value : undefined;
}

function numberAttribute(
  attributes: NormalizedSpan["attributes"] | undefined,
  key: string,
) {
  const value = attributes?.[key];
  return typeof value === "number" ? value : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function messageRole(value: JsonValue | undefined) {
  return value === "system" ||
    value === "user" ||
    value === "assistant" ||
    value === "tool"
    ? value
    : undefined;
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function searchableCaseText(testCase: ReportCase) {
  return [
    testCase.displayName,
    testCase.fullName,
    testCase.displayFile,
    testCase.source,
    ...(testCase.eval?.scores ?? []).map((score) => score.name ?? ""),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function compareSpans(left: NormalizedSpan, right: NormalizedSpan) {
  return (
    timestampMs(left.startedAt) - timestampMs(right.startedAt) ||
    (left.durationMs ?? 0) - (right.durationMs ?? 0) ||
    left.name.localeCompare(right.name)
  );
}

function timestampMs(value: string | undefined) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
