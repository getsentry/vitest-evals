import type {
  ReportCase,
  ReportRun,
  ReportWorkspace,
} from "@vitest-evals/core";
import { caseModel } from "./model";
import { type PricingTable, estimateUsageCost } from "./pricing";

/** Stable identity for the same eval assertion across runs. */
export function caseKey(testCase: ReportCase): string {
  return `${testCase.file}::${testCase.fullName}`;
}

/** Same leaf title in a file — used to find model variants. */
export function caseFamilyKey(testCase: ReportCase): string {
  return `${testCase.file}::${testCase.title}`;
}

/** Picks the older run as the default baseline when two or more exist. */
export function defaultBaselineRun(runs: ReportRun[]): ReportRun | undefined {
  if (runs.length < 2) {
    return undefined;
  }
  return [...runs].sort(compareRuns)[0];
}

/** Resolves the URL baseline, falling back to the oldest run. */
export function resolveBaselineRun(
  runs: ReportRun[],
  baselineRunId: string | undefined,
): ReportRun | undefined {
  if (baselineRunId && baselineRunId !== "auto") {
    return runs.find((run) => run.id === baselineRunId);
  }
  return defaultBaselineRun(runs);
}

export type CaseDelta = {
  baseline: ReportCase;
  score?: number;
  costUsd?: number;
  statusChanged: boolean;
};

/** Finds the baseline sibling and score/cost deltas for one case. */
export function caseDelta(
  testCase: ReportCase,
  baselineCases: ReportCase[],
  pricing?: PricingTable,
): CaseDelta | undefined {
  const baseline = baselineCases.find(
    (candidate) =>
      candidate.runId !== testCase.runId &&
      caseKey(candidate) === caseKey(testCase),
  );
  if (!baseline) {
    return undefined;
  }
  return {
    baseline,
    score: subtractNullable(testCase.eval?.avgScore, baseline.eval?.avgScore),
    costUsd: subtractNullable(
      pricing
        ? estimateUsageCost(testCase.harness?.run?.usage ?? {}, pricing)
            ?.totalUsd
        : undefined,
      pricing
        ? estimateUsageCost(baseline.harness?.run?.usage ?? {}, pricing)
            ?.totalUsd
        : undefined,
    ),
    statusChanged: baseline.status !== testCase.status,
  };
}

/** Other recordings of the same assertion (other runs or retries). */
export function caseSiblings(
  testCase: ReportCase,
  cases: ReportCase[],
): ReportCase[] {
  const key = caseKey(testCase);
  return cases.filter(
    (candidate) => candidate.id !== testCase.id && caseKey(candidate) === key,
  );
}

/** True when another run, retry, or model can be compared to this case. */
export function caseHasCompare(
  testCase: ReportCase,
  cases: ReportCase[],
  baselineCases: ReportCase[],
) {
  return (
    caseSiblings(testCase, cases).length > 0 ||
    caseModelVariants(testCase, cases).length > 0 ||
    caseDelta(testCase, baselineCases) !== undefined
  );
}

/** Same title in the same file, different recorded model. */
export function caseModelVariants(
  testCase: ReportCase,
  cases: ReportCase[],
): ReportCase[] {
  const key = caseFamilyKey(testCase);
  const model = caseModel(testCase);
  return cases.filter(
    (candidate) =>
      candidate.id !== testCase.id &&
      caseFamilyKey(candidate) === key &&
      caseModel(candidate) !== model,
  );
}

export type TrialStats = {
  count: number;
  meanScore?: number;
  stdevScore?: number;
};

/** Groups same-key cases in one run (retries / trialCount). */
export function trialStats(
  testCase: ReportCase,
  cases: ReportCase[],
): TrialStats {
  const key = caseKey(testCase);
  const trials = cases.filter(
    (candidate) =>
      candidate.runId === testCase.runId && caseKey(candidate) === key,
  );
  const scores = trials
    .map((trial) => trial.eval?.avgScore)
    .filter((score): score is number => typeof score === "number");
  return {
    count: trials.length,
    meanScore: mean(scores),
    stdevScore: stdev(scores),
  };
}

/** Spread of judge scores on one case. */
export function judgeSpread(testCase: ReportCase): TrialStats {
  const scores = (testCase.eval?.scores ?? [])
    .map((score) => score.score)
    .filter((score): score is number => typeof score === "number");
  return {
    count: scores.length,
    meanScore: mean(scores),
    stdevScore: stdev(scores),
  };
}

export type WorkspaceDelta = {
  baseline: ReportRun;
  current: ReportRun;
  passRate?: number;
  averageScore?: number;
  costUsd?: number;
  matchedCases: number;
};

/** Workspace-level change from the baseline run to the newest run. */
export function workspaceDelta(
  workspace: ReportWorkspace,
  pricing?: PricingTable,
): WorkspaceDelta | undefined {
  if (workspace.runs.length < 2) {
    return undefined;
  }
  const ordered = [...workspace.runs].sort(compareRuns);
  const baseline = ordered[0];
  const current = ordered[ordered.length - 1];
  if (!baseline || !current || baseline.id === current.id) {
    return undefined;
  }
  const baselineCases = workspace.cases.filter(
    (testCase) => testCase.runId === baseline.id,
  );
  const currentCases = workspace.cases.filter(
    (testCase) => testCase.runId === current.id,
  );
  const pairs = currentCases
    .map((testCase) => caseDelta(testCase, baselineCases, pricing))
    .filter((delta): delta is CaseDelta => Boolean(delta));
  return {
    baseline,
    current,
    passRate: subtractNullable(
      executedPassRate(currentCases),
      executedPassRate(baselineCases),
    ),
    averageScore: mean(
      pairs
        .map((pair) => pair.score)
        .filter((score): score is number => typeof score === "number"),
    ),
    costUsd: subtractNullable(
      runCostUsd(currentCases, pricing),
      runCostUsd(baselineCases, pricing),
    ),
    matchedCases: pairs.length,
  };
}

export function formatSignedScore(delta: number | undefined) {
  if (delta === undefined) {
    return "n/a";
  }
  const points = Math.round(delta * 100);
  if (points === 0) {
    return "0pp";
  }
  return `${points > 0 ? "+" : ""}${points}pp`;
}

export function formatSignedUsd(delta: number | undefined) {
  if (delta === undefined) {
    return "n/a";
  }
  if (Math.abs(delta) < 0.00005) {
    return "$0.00";
  }
  const digits = Math.abs(delta) < 0.01 ? 4 : 3;
  const body = Math.abs(delta).toFixed(digits);
  if (delta > 0) {
    return `+$${body}`;
  }
  return `-$${body}`;
}

function compareRuns(left: ReportRun, right: ReportRun) {
  return (
    (left.startedAt ?? 0) - (right.startedAt ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

function executedPassRate(cases: ReportCase[]) {
  const executed = cases.filter(
    (testCase) => testCase.status === "passed" || testCase.status === "failed",
  );
  if (executed.length === 0) {
    return undefined;
  }
  return (
    executed.filter((testCase) => testCase.status === "passed").length /
    executed.length
  );
}

function runCostUsd(cases: ReportCase[], pricing?: PricingTable) {
  if (!pricing) {
    return undefined;
  }
  let total = 0;
  let matched = false;
  for (const testCase of cases) {
    const cost = estimateUsageCost(testCase.harness?.run?.usage ?? {}, pricing);
    if (!cost) {
      continue;
    }
    matched = true;
    total += cost.totalUsd;
  }
  return matched ? total : undefined;
}

function subtractNullable(
  left: number | null | undefined,
  right: number | null | undefined,
) {
  if (left == null || right == null) {
    return undefined;
  }
  return left - right;
}

function mean(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function stdev(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }
  const average = mean(values);
  if (average === undefined) {
    return undefined;
  }
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}
