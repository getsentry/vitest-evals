import type { ReportWorkspace } from "@vitest-evals/core";
import { describe, expect, test } from "vitest";
import { formatJunitXml, formatPullRequestComment } from "./ci-artifacts";
import { FALLBACK_PRICING } from "./pricing";

const workspace: ReportWorkspace = {
  schemaVersion: 2,
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

  test("marks skipped cases as skipped, not passed", () => {
    const xml = formatJunitXml({
      ...workspace,
      cases: [
        ...workspace.cases,
        {
          ...workspace.cases[0]!,
          id: "todo",
          displayName: "suite > todo",
          status: "skipped",
        },
      ],
    });
    expect(xml).toMatch(/name="suite &gt; todo"[^>]*>\s*<skipped \/>/);
    expect(xml).toContain('skipped="1"');
  });
});

describe("formatPullRequestComment", () => {
  test("summarizes pass rate, cost, and failures", () => {
    const markdown = formatPullRequestComment(workspace, FALLBACK_PRICING);
    expect(markdown).toContain("50%");
    expect(markdown).toContain("1 passed, 1 failed");
    expect(markdown).toContain("suite > fails");
  });

  test("includes recorded judge cost in the total", () => {
    const [passing, failing] = workspace.cases;
    const markdown = formatPullRequestComment({
      ...workspace,
      cases: [
        {
          ...passing!,
          harness: {
            name: "app",
            run: {
              session: { events: [] },
              usage: { costUsd: 0.5 },
              errors: [],
            },
          },
          eval: {
            avgScore: 1,
            scores: [
              {
                name: "judge",
                score: 1,
                judgeRuns: [
                  {
                    session: { events: [] },
                    usage: { costUsd: 0.25 },
                    errors: [],
                  },
                ],
              },
            ],
          },
        },
        failing!,
      ],
    });
    expect(markdown).toContain("| Est. cost | $0.75");
  });
});
