import type { EvalReport, UsageSummary } from "./types";

/** Merges multiple collected eval reports into one combined report. */
export function mergeEvalReports(reports: EvalReport[]): EvalReport {
  const cases = reports.flatMap((report) => report.cases);
  const failures = reports.flatMap((report) => report.failures);
  const scoredCases = cases
    .map((testCase) => testCase.eval?.avgScore)
    .filter(
      (score): score is number =>
        typeof score === "number" && Number.isFinite(score),
    );
  const startedAtValues = reports
    .map((report) => report.startedAt)
    .filter(
      (startedAt): startedAt is number =>
        typeof startedAt === "number" && Number.isFinite(startedAt),
    );
  const startedAt =
    startedAtValues.length > 0 ? Math.min(...startedAtValues) : undefined;

  return {
    status: reports.some((report) => report.status === "failed")
      ? "failed"
      : "passed",
    startedAt,
    durationMs: mergeDuration(reports),
    totals: {
      total: sum(reports, (report) => report.totals.total),
      passed: sum(reports, (report) => report.totals.passed),
      failed: sum(reports, (report) => report.totals.failed),
      skipped: sum(reports, (report) => report.totals.skipped),
      evalTotal: sum(reports, (report) => report.totals.evalTotal),
      evalPassed: sum(reports, (report) => report.totals.evalPassed),
      evalFailed: sum(reports, (report) => report.totals.evalFailed),
    },
    score:
      scoredCases.length > 0
        ? {
            average:
              scoredCases.reduce((total, score) => total + score, 0) /
              scoredCases.length,
            minimum: Math.min(...scoredCases),
          }
        : undefined,
    usage: mergeUsage(reports.map((report) => report.usage)),
    cases,
    failures,
  };
}

function mergeUsage(usages: Array<Required<UsageSummary>>) {
  return {
    inputTokens: sum(usages, (usage) => usage.inputTokens),
    outputTokens: sum(usages, (usage) => usage.outputTokens),
    reasoningTokens: sum(usages, (usage) => usage.reasoningTokens),
    totalTokens: sum(usages, (usage) => usage.totalTokens),
    toolCalls: sum(usages, (usage) => usage.toolCalls),
  };
}

function mergeDuration(reports: EvalReport[]) {
  const durations = reports
    .map((report) => report.durationMs)
    .filter(
      (durationMs): durationMs is number =>
        typeof durationMs === "number" && Number.isFinite(durationMs),
    );
  const intervals = reports
    .map((report) => {
      if (
        typeof report.startedAt !== "number" ||
        !Number.isFinite(report.startedAt) ||
        typeof report.durationMs !== "number" ||
        !Number.isFinite(report.durationMs)
      ) {
        return undefined;
      }

      return {
        start: report.startedAt,
        end: report.startedAt + report.durationMs,
      };
    })
    .filter((interval): interval is { start: number; end: number } =>
      Boolean(interval),
    );

  if (intervals.length > 0 && intervals.length === durations.length) {
    return (
      Math.max(...intervals.map((interval) => interval.end)) -
      Math.min(...intervals.map((interval) => interval.start))
    );
  }

  return durations.length > 0
    ? durations.reduce((total, durationMs) => total + durationMs, 0)
    : undefined;
}

function sum<T>(items: T[], select: (item: T) => number) {
  return items.reduce((total, item) => total + select(item), 0);
}
