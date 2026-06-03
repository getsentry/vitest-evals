import {
  collectReportWorkspace,
  type HarnessRun,
  type ReportCase,
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
  const durationMs = resolveRunDuration(input);

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
  const toolCalls = collectToolCalls(harnessRun?.session);
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

function collectToolCalls(session: HarnessRun["session"] | undefined) {
  const messages = session?.messages ?? [];
  const toolCalls: ToolCallSummary[] = [];

  for (const message of messages) {
    if (!Array.isArray(message.toolCalls)) {
      continue;
    }

    for (const call of message.toolCalls) {
      toolCalls.push({
        name: call.name,
        error: getToolCallError(call.error),
        durationMs: numberField(call.durationMs),
      });
    }
  }

  return toolCalls;
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
    usage.toolCalls +=
      caseUsage?.toolCalls ?? testCase.harness?.toolCalls.length ?? 0;
  }

  return usage;
}

function resolveRunDuration(input: VitestJsonReport) {
  const startTimes = input.testResults
    .map((file) => file.startTime)
    .filter((time) => Number.isFinite(time));
  const endTimes = input.testResults
    .map((file) => file.endTime)
    .filter((time) => Number.isFinite(time));
  if (startTimes.length === 0 || endTimes.length === 0) {
    return undefined;
  }
  return Math.max(...endTimes) - Math.min(...startTimes);
}
