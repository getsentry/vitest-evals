import type { ReportCase } from "@vitest-evals/core";
import { describe, expect, test } from "vitest";
import { caseToMarkdown } from "./case-markdown";

const testCase: ReportCase = {
  ancestorTitles: ["refund"],
  displayFile: "refund.eval.ts",
  displayName: "refund agent > rejects fraud",
  failureMessages: ["Score: 0.20 below threshold: 1.00"],
  file: "/repo/refund.eval.ts",
  fullName: "refund agent rejects fraud",
  id: "failed-case",
  runId: "run-1",
  status: "failed",
  title: "rejects fraud",
  eval: {
    avgScore: 0.2,
    output: { status: "denied" },
    scores: [{ name: "StructuredOutputJudge", score: 0.2 }],
  },
};

describe("caseToMarkdown", () => {
  test("includes agent instructions and the failing case evidence", () => {
    const markdown = caseToMarkdown(testCase, {
      id: "run-1",
      source: "eval-results/refund.json",
      status: "failed",
      totals: {
        evalFailed: 1,
        evalPassed: 0,
        evalTotal: 1,
        failed: 1,
        passed: 0,
        skipped: 0,
        total: 1,
      },
    });

    expect(markdown).toContain("# Eval case: refund agent > rejects fraud");
    expect(markdown).toContain("Help fix or improve this vitest-evals case.");
    expect(markdown).toContain("**Result:** failed");
    expect(markdown).toContain("**File:** `refund.eval.ts`");
    expect(markdown).toContain("Score: 0.20 below threshold: 1.00");
    expect(markdown).toContain("| StructuredOutputJudge | 20% |");
    expect(markdown).toContain('"status": "denied"');
    expect(markdown).toContain("## Raw case JSON");
  });
});
