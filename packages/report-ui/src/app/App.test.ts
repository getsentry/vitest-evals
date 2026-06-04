import { afterEach, describe, expect, test, vi } from "vitest";
import type { ReportWorkspace } from "@vitest-evals/core";
import {
  loadWorkspace,
  resolveSelectedCase,
  resolveSelectedCaseId,
  summarizeVisibleWorkspace,
  visibleWorkspaceRuns,
} from "./App";
import { passRate } from "./components/ReportPrimitives";

const cases: ReportWorkspace["cases"] = [
  {
    ancestorTitles: ["refund"],
    displayFile: "refund.eval.ts",
    displayName: "refund > fails",
    failureMessages: [],
    file: "/repo/refund.eval.ts",
    fullName: "refund fails",
    id: "failed-case",
    runId: "run-1",
    status: "failed",
    title: "fails",
  },
  {
    ancestorTitles: ["refund"],
    displayFile: "refund.eval.ts",
    displayName: "refund > passes",
    failureMessages: [],
    file: "/repo/refund.eval.ts",
    fullName: "refund passes",
    id: "passed-case",
    runId: "run-1",
    status: "passed",
    title: "passes",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("case selection", () => {
  test("keeps selection scoped to visible filtered cases", () => {
    const visibleCases = [cases[1]!];

    expect(resolveSelectedCase("failed-case", visibleCases)).toBeUndefined();
    expect(resolveSelectedCaseId("failed-case", visibleCases)).toBe(
      "passed-case",
    );
    expect(resolveSelectedCaseId("failed-case", [])).toBeUndefined();
  });

  test("preserves a selected case that remains visible", () => {
    expect(resolveSelectedCase("failed-case", cases)).toEqual(cases[0]);
    expect(resolveSelectedCaseId("failed-case", cases)).toBe("failed-case");
  });

  test("preserves an empty selection when filters change", () => {
    expect(resolveSelectedCaseId(undefined, cases)).toBeUndefined();
  });
});

describe("visible summary", () => {
  const runs: ReportWorkspace["runs"] = [
    {
      id: "run-1",
      status: "failed",
      durationMs: 1000,
      totals: {
        evalFailed: 1,
        evalPassed: 0,
        evalTotal: 1,
        failed: 1,
        passed: 0,
        skipped: 0,
        total: 1,
      },
    },
    {
      id: "run-2",
      status: "passed",
      durationMs: 2000,
      totals: {
        evalFailed: 0,
        evalPassed: 1,
        evalTotal: 1,
        failed: 0,
        passed: 1,
        skipped: 0,
        total: 1,
      },
    },
  ];

  test("summarizes only visible cases when filters are active", () => {
    expect(
      summarizeVisibleWorkspace(
        {
          schemaVersion: 1,
          runs,
          cases: [
            cases[0]!,
            {
              ...cases[1]!,
              runId: "run-2",
            },
          ],
        },
        {
          query: "",
          runId: "run-2",
          status: "passed",
        },
        [
          {
            ...cases[1]!,
            runId: "run-2",
          },
        ],
      ),
    ).toMatchObject({
      caseCount: 1,
      durationMs: 2000,
      failed: 0,
      passed: 1,
      runCount: 1,
    });
  });

  test("returns the same visible runs used by filtered summaries", () => {
    expect(
      visibleWorkspaceRuns(
        runs,
        {
          query: "",
          runId: "run-2",
          status: "passed",
        },
        [
          {
            ...cases[1]!,
            runId: "run-2",
          },
        ],
      ),
    ).toEqual([runs[1]]);

    expect(
      visibleWorkspaceRuns(
        runs,
        {
          query: "",
          runId: "all",
          status: "all",
        },
        [],
      ),
    ).toEqual(runs);
  });

  test("keeps run counts for unfiltered empty reports", () => {
    expect(
      summarizeVisibleWorkspace(
        {
          schemaVersion: 1,
          runs: [
            {
              id: "run-1",
              status: "passed",
              totals: {
                evalFailed: 0,
                evalPassed: 0,
                evalTotal: 0,
                failed: 0,
                passed: 1,
                skipped: 0,
                total: 1,
              },
            },
          ],
          cases: [],
        },
        {
          query: "",
          runId: "all",
          status: "all",
        },
        [],
      ).runCount,
    ).toBe(1);
  });

  test("calculates pass rate from executed cases", () => {
    expect(
      passRate({
        averageScore: undefined,
        caseCount: 2,
        durationMs: undefined,
        failed: 0,
        passed: 1,
        runCount: 1,
        skipped: 1,
        totalTokens: 0,
        toolCallCount: 0,
      }),
    ).toBe("100%");

    expect(
      passRate({
        averageScore: undefined,
        caseCount: 1,
        durationMs: undefined,
        failed: 0,
        passed: 0,
        runCount: 1,
        skipped: 1,
        totalTokens: 0,
        toolCallCount: 0,
      }),
    ).toBe("n/a");
  });
});

describe("loadWorkspace", () => {
  test("does not produce a load state for aborted requests", async () => {
    const abortController = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        abortController.abort();
        throw new DOMException("Aborted", "AbortError");
      }),
    );

    await expect(
      loadWorkspace(abortController.signal),
    ).resolves.toBeUndefined();
  });
});
