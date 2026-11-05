import type {
  ReportCase,
  ReportRun,
  ReportWorkspace,
} from "@vitest-evals/core";

/** Overlays incoming rerun cases onto the previous workspace by file + fullName. */
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
    cases.push(incomingByKey.get(key) ?? testCase);
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
  return `${testCase.file}\0${testCase.fullName}`;
}

function mergeRuns(
  previous: ReportRun[],
  incoming: ReportRun[],
  cases: ReportCase[],
): ReportRun[] {
  const runs = new Map(previous.map((run) => [run.id, run]));
  for (const run of incoming) {
    const current = runs.get(run.id);
    runs.set(run.id, current ? { ...current, startedAt: run.startedAt } : run);
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
