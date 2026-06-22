import {
  toolCalls,
  type HarnessRun,
  type JsonValue,
  type NormalizedError,
  type NormalizedSpan,
  type ReportCase,
  type ReportWorkspace,
  type TranscriptMessageEvent,
  type TranscriptToolCallEvent,
  type TranscriptToolResultEvent,
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
  role: TranscriptMessageEvent["role"];
  content?: JsonValue;
};

export type TranscriptToolEvent = {
  kind: "tool";
  id: string;
  name: string;
  arguments?: JsonValue;
  result?: JsonValue;
  error?: NormalizedError;
  durationMs?: number;
  status?: NormalizedSpan["status"] | "pending";
  callId?: string;
};

export type TranscriptEvent = TranscriptMessage | TranscriptToolEvent;

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

/** Builds a readable transcript projection from normalized session events. */
export function buildTranscript(run: HarnessRun): Transcript {
  return {
    events: sessionTranscriptEvents(run),
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

  if (intervals.length > 0) {
    const start = Math.min(...intervals.map((interval) => interval.start));
    const end = Math.max(...intervals.map((interval) => interval.end));
    return Math.max(0, end - start);
  }

  if (durations.length === 0) {
    return undefined;
  }

  return durations.reduce((total, duration) => total + duration, 0);
}

function sessionTranscriptEvents(run: HarnessRun) {
  const events: TranscriptEvent[] = [];
  const pendingTools: Array<{
    call: TranscriptToolCallEvent;
    event: TranscriptToolEvent;
  }> = [];

  run.session.events.forEach((event, eventIndex) => {
    if (event.type === "tool_result") {
      if (attachTranscriptToolResult(pendingTools, event)) {
        return;
      }

      events.push(transcriptToolResultEvent(event, eventIndex));
      return;
    }

    if (event.type === "tool_call") {
      const toolEvent: TranscriptToolEvent = {
        arguments: event.arguments,
        callId: event.id,
        durationMs: event.durationMs,
        id: event.id,
        kind: "tool",
        name: event.name,
        status: "pending",
      };
      pendingTools.push({ call: event, event: toolEvent });
      events.push(toolEvent);
      return;
    }

    if (event.content !== undefined) {
      events.push({
        content: event.content,
        id: `message-${eventIndex}`,
        kind: "message",
        role: event.role,
      });
    }
  });
  return events;
}

function transcriptToolResultEvent(
  result: TranscriptToolResultEvent,
  eventIndex: number,
): TranscriptToolEvent {
  return {
    callId: result.toolCallId,
    ...(result.durationMs !== undefined
      ? { durationMs: result.durationMs }
      : {}),
    ...(result.error ? { error: result.error } : {}),
    id: `event-${eventIndex}:tool-result`,
    kind: "tool",
    name: result.name ?? result.toolCallId,
    ...(result.content !== undefined ? { result: result.content } : {}),
    status: result.error ? "error" : "ok",
  };
}

function attachTranscriptToolResult(
  tools: Array<{ call: TranscriptToolCallEvent; event: TranscriptToolEvent }>,
  result: TranscriptToolResultEvent,
) {
  const match = findPendingTranscriptTool(
    tools,
    (call) => call.id === result.toolCallId,
  );

  if (!match) {
    return false;
  }

  match.event.error = result.error;
  match.event.result = result.content;
  match.event.durationMs = result.durationMs ?? match.call.durationMs;
  match.event.status = result.error ? "error" : "ok";
  return true;
}

function findPendingTranscriptTool(
  tools: Array<{ call: TranscriptToolCallEvent; event: TranscriptToolEvent }>,
  predicate: (call: TranscriptToolCallEvent) => boolean,
) {
  return tools.find(
    ({ call, event }) => event.status === "pending" && predicate(call),
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function hasTimestamp(value: string | undefined) {
  return value !== undefined && Number.isFinite(Date.parse(value));
}
