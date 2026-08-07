import {
  type HarnessRun,
  type ReportCase,
  type ToolCall,
  type TranscriptToolCallEvent,
  type TranscriptToolResultEvent,
  collectReportWorkspace,
} from "@vitest-evals/core";
import type {
  CollectOptions,
  EvalCase,
  EvalFailure,
  EvalReport,
  EvalScore,
  ToolCallSummary,
  UsageSummary,
  VitestJsonReport,
} from "./types";
import { compactLine, stringifyValue } from "./utils";

/** Converts a Vitest JSON report into the compact eval report model. */
export function collectEvalReport(
  input: VitestJsonReport,
  options: CollectOptions = {},
): EvalReport {
  const workspace = collectReportWorkspace(
    {
      report: input,
    },
    {
      workspace: options.workspace,
    },
  );
  const cases = workspace.cases.map(collectEvalCase);
  const failures = cases.filter((testCase) => testCase.status === "failed");
  const evalScores = cases
    .map((testCase) => testCase.eval?.avgScore)
    .filter((score): score is number => isFiniteNumber(score));
  const usage = sumUsage(cases);
  const durationMs = workspace.runs[0]?.durationMs;

  return {
    status: input.success && failures.length === 0 ? "passed" : "failed",
    startedAt: input.startTime,
    durationMs,
    totals: {
      total: input.numTotalTests,
      passed: input.numPassedTests,
      failed: input.numFailedTests,
      skipped: input.numPendingTests + input.numTodoTests,
      evalTotal: cases.length,
      evalPassed: cases.filter((testCase) => testCase.status === "passed")
        .length,
      evalFailed: failures.length,
    },
    score:
      evalScores.length > 0
        ? {
            average:
              evalScores.reduce((total, score) => total + score, 0) /
              evalScores.length,
            minimum: Math.min(...evalScores),
          }
        : undefined,
    usage,
    cases,
    failures,
  };
}

function collectEvalCase(reportCase: ReportCase): EvalCase {
  const scores = (reportCase.eval?.scores ?? []).map(normalizeScore);
  const harnessRun = reportCase.harness?.run;
  const toolCalls = collectToolCalls(reportCase);
  const evalCase: EvalCase = {
    id: reportCase.id,
    file: reportCase.file,
    displayFile: reportCase.displayFile,
    title: reportCase.title,
    displayName: reportCase.displayName,
    status: reportCase.status,
    durationMs: numberField(reportCase.durationMs),
    location: reportCase.location,
    failureMessages: reportCase.failureMessages,
    toolCalls,
    eval: reportCase.eval
      ? {
          avgScore: numberField(reportCase.eval.avgScore),
          thresholdFailed: reportCase.eval.thresholdFailed,
          output: reportCase.eval.output,
          scores,
        }
      : undefined,
    harness: reportCase.harness
      ? {
          name: reportCase.harness.name,
          output: harnessRun?.output,
          usage: harnessRun?.usage,
          timingMs: harnessRun?.timings?.totalMs,
          toolCalls,
          errors: harnessRun?.errors ?? [],
        }
      : undefined,
  };

  evalCase.primaryFailure = getPrimaryFailure(evalCase);
  return evalCase;
}

function normalizeScore(score: EvalScore): EvalScore {
  return {
    ...score,
    score: numberField(score.score) ?? null,
  };
}

function numberField(value: unknown) {
  return isFiniteNumber(value) ? value : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function collectToolCalls(reportCase: ReportCase) {
  const harnessCalls = collectSessionToolCalls(
    reportCase.harness?.run?.session,
  );
  return harnessCalls.length > 0
    ? harnessCalls
    : (reportCase.eval?.toolCalls ?? []).map(toToolCallSummary);
}

function collectSessionToolCalls(session: HarnessRun["session"] | undefined) {
  if (!session) {
    return [];
  }

  const resultsById = new Map<string, TranscriptToolResultEvent>();
  for (const event of session.events) {
    if (event.type === "tool_result" && !resultsById.has(event.toolCallId)) {
      resultsById.set(event.toolCallId, event);
    }
  }

  return session.events.flatMap((event) =>
    event.type === "tool_call"
      ? [toSessionToolCallSummary(event, resultsById.get(event.id))]
      : [],
  );
}

function toToolCallSummary(call: ToolCall): ToolCallSummary {
  return {
    name: call.name,
    status: call.status,
    error: call.status === "error" ? getToolCallError(call.error) : undefined,
  };
}

function toSessionToolCallSummary(
  call: TranscriptToolCallEvent,
  result: TranscriptToolResultEvent | undefined,
): ToolCallSummary {
  if (!result) {
    return {
      name: call.name,
      status: "pending",
      ...(call.durationMs !== undefined ? { durationMs: call.durationMs } : {}),
    };
  }

  const durationMs = result.durationMs ?? call.durationMs;
  return {
    name: call.name,
    status: result.error ? "error" : "ok",
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(result.error ? { error: getToolCallError(result.error) } : {}),
  };
}

function getToolCallError(value: unknown) {
  const error = value as { message?: unknown };
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  if (value !== undefined) {
    return stringifyValue(value, 240);
  }
  return undefined;
}

function getPrimaryFailure(testCase: EvalCase): EvalFailure | undefined {
  const failingScores = [...(testCase.eval?.scores ?? [])]
    .filter(
      (score) =>
        (score.score ?? 0) < 1 ||
        score.metadata?.rationale !== undefined ||
        score.metadata?.output !== undefined,
    )
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  const primary = failingScores[0];
  const score =
    typeof primary?.score === "number"
      ? primary.score
      : testCase.eval?.avgScore;
  const reason =
    stringifyReason(primary?.metadata?.rationale) ??
    compactLine(testCase.failureMessages.join("\n"), 500);

  if (!primary && !reason && score === undefined) {
    return undefined;
  }

  return {
    judgeName: primary?.name,
    score,
    reason: reason || undefined,
  };
}

function stringifyReason(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : stringifyValue(value, 4000);
}

function sumUsage(cases: EvalCase[]) {
  const usage: Required<UsageSummary> = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
  };

  for (const testCase of cases) {
    const caseUsage = testCase.harness?.usage;
    usage.inputTokens += caseUsage?.inputTokens ?? 0;
    usage.outputTokens += caseUsage?.outputTokens ?? 0;
    usage.reasoningTokens += caseUsage?.reasoningTokens ?? 0;
    usage.totalTokens +=
      caseUsage?.totalTokens ??
      (caseUsage?.inputTokens ?? 0) +
        (caseUsage?.outputTokens ?? 0) +
        (caseUsage?.reasoningTokens ?? 0);
    usage.toolCalls += toolCallCount(testCase);
  }

  return usage;
}

function toolCallCount(testCase: EvalCase) {
  const usageToolCalls = testCase.harness?.usage?.toolCalls;
  if (usageToolCalls !== undefined) {
    return Math.max(usageToolCalls, testCase.toolCalls.length);
  }

  return testCase.toolCalls.length;
}
