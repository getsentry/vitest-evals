import type { ReportCase } from "@vitest-evals/core";

export type JudgeTally = {
  passed: number;
  total: number;
};

/** Counts judges that fully passed (score >= 1) against all recorded judges. */
export function judgeTally(testCase: ReportCase): JudgeTally {
  const scores = testCase.eval?.scores ?? [];
  return {
    passed: scores.filter(
      (score) => typeof score.score === "number" && score.score >= 1,
    ).length,
    total: scores.length,
  };
}

/** Builds the ledger tooltip for a case average score. */
export function judgeTallyLabel(tally: JudgeTally): string {
  if (tally.total === 0) {
    return "No judges";
  }
  return `${tally.passed}/${tally.total} judges passed`;
}
