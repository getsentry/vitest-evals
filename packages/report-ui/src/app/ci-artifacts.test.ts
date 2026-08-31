import type { ReportWorkspace } from "@vitest-evals/core";
import { describe, expect, test } from "vitest";
import { formatJunitXml, formatPullRequestComment } from "./ci-artifacts";
import { FALLBACK_PRICING } from "./pricing";

const workspace: ReportWorkspace = {
  schemaVersion: 1,
  runs: [
    {
      id: "run-1",
      source: "eval-results/a.json",
      status: "failed",
      durationMs: 1500,
      totals: {
        total: 2,
        passed: 1,
        failed: 1,
        skipped: 0,
        evalTotal: 2,
        evalPassed: 1,
        evalFailed: 1,
      },
    },
  ],
  cases: [
    {
      id: "ok",
      ancestorTitles: ["suite"],
      displayFile: "suite.eval.ts",
      displayName: "suite > passes",
      failureMessages: [],
      file: "/repo/suite.eval.ts",
      fullName: "suite passes",
      runId: "run-1",
      status: "passed",
      title: "passes",
      durationMs: 200,
      eval: { avgScore: 1, scores: [] },
    },
    {
      id: "bad",
      ancestorTitles: ["suite"],
      displayFile: "suite.eval.ts",
      displayName: "suite > fails",
      failureMessages: ["Score: 0.20 below threshold: 1.00"],
      file: "/repo/suite.eval.ts",
      fullName: "suite fails",
      runId: "run-1",
      status: "failed",
      title: "fails",
      durationMs: 400,
      eval: { avgScore: 0.2, scores: [] },
    },
  ],
};

describe("formatJunitXml", () => {
  test("emits one failing testcase with the failure message", () => {
    const xml = formatJunitXml(workspace);
    expect(xml).toContain('tests="2"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('name="suite &gt; fails"');
    expect(xml).toContain("Score: 0.20 below threshold: 1.00");
    expect(xml).toContain('name="suite &gt; passes"');
  });
});

describe("formatPullRequestComment", () => {
  test("summarizes pass rate, cost, and failures", () => {
    const markdown = formatPullRequestComment(workspace, FALLBACK_PRICING);
    expect(markdown).toContain("50%");
    expect(markdown).toContain("1 passed, 1 failed");
    expect(markdown).toContain("suite > fails");
  });
});
