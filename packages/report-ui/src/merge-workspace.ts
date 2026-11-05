import type {
  ReportCase,
  ReportRun,
  ReportWorkspace,
} from "@vitest-evals/core";

/**
 * Overlays incoming rerun cases onto the previous workspace by run + file +
 * fullName. Replaced cases keep their previous id so URL selection survives
 * even when the assertion moved lines.
 */
export function mergeRerunWorkspace(
  previous: ReportWorkspace,
  incoming: ReportWorkspace,
): ReportWorkspace {
  if (previous.cases.length === 0) {
    return incoming;
  }
  if (incoming.cases.length === 0) {
    return previous;
  }

  const incomingByKey = new Map(
    incoming.cases.map((testCase) => [caseKey(testCase), testCase]),
  );
  const seen = new Set<string>();
  const cases: ReportCase[] = [];
  for (const testCase of previous.cases) {
    const key = caseKey(testCase);
    seen.add(key);
    const replacement = incomingByKey.get(key);
    cases.push(replacement ? { ...replacement, id: testCase.id } : testCase);
  }
  for (const testCase of incoming.cases) {
    const key = caseKey(testCase);
    if (!seen.has(key)) {
      cases.push(testCase);
    }
  }

  return {
    schemaVersion: previous.schemaVersion,
    runs: mergeRuns(previous.runs, incoming.runs, cases),
    cases,
  };
}

function caseKey(testCase: ReportCase) {
  return `${testCase.runId}\0${testCase.file}\0${testCase.fullName}`;
}

function mergeRuns(
  previous: ReportRun[],
  incoming: ReportRun[],
  cases: ReportCase[],
): ReportRun[] {
  const runs = new Map(previous.map((run) => [run.id, run]));
  // Keep each known run's original startedAt so a rerun does not reorder
  // which run counts as the baseline.
  for (const run of incoming) {
    if (!runs.has(run.id)) {
      runs.set(run.id, run);
    }
  }
  return [...runs.values()].map((run) => {
    const runCases = cases.filter((testCase) => testCase.runId === run.id);
    const evalPassed = runCases.filter(
      (testCase) => testCase.status === "passed",
    ).length;
    const evalFailed = runCases.filter(
      (testCase) => testCase.status === "failed",
    ).length;
    return {
      ...run,
      status: evalFailed > 0 ? "failed" : "passed",
      durationMs: runCases.reduce(
        (total, testCase) => total + (testCase.durationMs ?? 0),
        0,
      ),
      totals: {
        ...run.totals,
        total: Math.max(run.totals.total, runCases.length),
        passed: evalPassed,
        failed: evalFailed,
        evalTotal: runCases.length,
        evalPassed,
        evalFailed,
      },
    };
  });
}
