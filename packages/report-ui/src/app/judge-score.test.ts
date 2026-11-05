import type { ReportCase } from "@vitest-evals/core";
import { describe, expect, test } from "vitest";
import { judgeTally, judgeTallyLabel } from "./judge-score";

const testCase: ReportCase = {
  ancestorTitles: [],
  displayFile: "refund.eval.ts",
  displayName: "refund",
  failureMessages: [],
  file: "/repo/refund.eval.ts",
  fullName: "refund",
  id: "case-1",
  runId: "run-1",
  status: "failed",
  title: "refund",
  eval: {
    avgScore: 0.75,
    scores: [
      { name: "range", score: 0 },
      { name: "domain", score: 1 },
      { name: "present", score: 1 },
      { name: "relevance", score: 1 },
    ],
  },
};

describe("judgeTally", () => {
  test("counts full-mark judges against the recorded set", () => {
    expect(judgeTally(testCase)).toEqual({ passed: 3, total: 4 });
    expect(judgeTallyLabel(judgeTally(testCase))).toBe("3/4 judges passed");
  });
});
