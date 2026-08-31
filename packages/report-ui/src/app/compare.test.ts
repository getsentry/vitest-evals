import type { ReportCase, ReportWorkspace } from "@vitest-evals/core";
import { describe, expect, test } from "vitest";
import {
  caseDelta,
  caseHasCompare,
  caseKey,
  formatSignedScore,
  formatSignedUsd,
  judgeSpread,
  trialStats,
  workspaceDelta,
} from "./compare";
import { FALLBACK_PRICING } from "./pricing";

function testCase(
  overrides: Partial<ReportCase> & Pick<ReportCase, "id">,
): ReportCase {
  return {
    ancestorTitles: ["refund"],
    displayFile: "refund.eval.ts",
    displayName: "refund > fraud",
    failureMessages: [],
    file: "/repo/refund.eval.ts",
    fullName: "refund fraud",
    runId: "run-new",
    status: "passed",
    title: "fraud",
    ...overrides,
  };
}

describe("case identity", () => {
  test("keys a case by file and full name", () => {
    expect(
      caseKey(
        testCase({
          id: "a",
          file: "/repo/a.ts",
          fullName: "suite case",
        }),
      ),
    ).toBe("/repo/a.ts::suite case");
  });
});

describe("caseDelta", () => {
  test("subtracts baseline score and cost", () => {
    const current = testCase({
      id: "now",
      eval: { avgScore: 1, scores: [] },
      harness: {
        run: {
          output: {},
          session: { events: [] },
          usage: {
            model: "gpt-4o-mini",
            inputTokens: 1_000_000,
            outputTokens: 0,
          },
          errors: [],
        },
      },
    });
    const baseline = testCase({
      id: "then",
      runId: "run-old",
      status: "failed",
      eval: { avgScore: 0.5, scores: [] },
      harness: {
        run: {
          output: {},
          session: { events: [] },
          usage: {
            model: "gpt-4o-mini",
            inputTokens: 2_000_000,
            outputTokens: 0,
          },
          errors: [],
        },
      },
    });

    expect(caseDelta(current, [baseline], FALLBACK_PRICING)).toMatchObject({
      score: 0.5,
      costUsd: -0.15,
      statusChanged: true,
    });
  });
});

describe("trialStats and judgeSpread", () => {
  test("computes trial count and judge standard deviation", () => {
    const first = testCase({
      id: "t1",
      eval: {
        avgScore: 0.5,
        scores: [
          { name: "a", score: 0 },
          { name: "b", score: 1 },
        ],
      },
    });
    const second = testCase({
      id: "t2",
      eval: { avgScore: 1, scores: [] },
    });

    expect(trialStats(first, [first, second])).toMatchObject({
      count: 2,
      meanScore: 0.75,
    });
    expect(judgeSpread(first).stdevScore).toBeCloseTo(Math.SQRT1_2);
  });
});

describe("workspaceDelta", () => {
  test("compares the oldest run to the newest", () => {
    const workspace: ReportWorkspace = {
      schemaVersion: 1,
      runs: [
        {
          id: "old",
          startedAt: 1,
          status: "failed",
          totals: {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            evalTotal: 1,
            evalPassed: 0,
            evalFailed: 1,
          },
        },
        {
          id: "new",
          startedAt: 2,
          status: "passed",
          totals: {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            evalTotal: 1,
            evalPassed: 1,
            evalFailed: 0,
          },
        },
      ],
      cases: [
        testCase({
          id: "old-case",
          runId: "old",
          status: "failed",
          eval: { avgScore: 0.5, scores: [] },
        }),
        testCase({
          id: "new-case",
          runId: "new",
          status: "passed",
          eval: { avgScore: 1, scores: [] },
        }),
      ],
    };

    expect(workspaceDelta(workspace)).toMatchObject({
      baseline: { id: "old" },
      current: { id: "new" },
      passRate: 1,
      averageScore: 0.5,
      matchedCases: 1,
    });
  });
});

describe("caseHasCompare", () => {
  test("is true when a baseline sibling exists", () => {
    const current = testCase({ id: "now" });
    const baseline = testCase({ id: "then", runId: "run-old" });
    expect(caseHasCompare(current, [current, baseline], [baseline])).toBe(true);
  });

  test("is false for a lone case", () => {
    const current = testCase({ id: "only" });
    expect(caseHasCompare(current, [current], [])).toBe(false);
  });
});

describe("signed formatters", () => {
  test("formats score points and usd deltas", () => {
    expect(formatSignedScore(0.12)).toBe("+12pp");
    expect(formatSignedScore(-0.04)).toBe("-4pp");
    expect(formatSignedUsd(0.02)).toBe("+$0.020");
    expect(formatSignedUsd(-0.15)).toBe("-$0.150");
  });
});
