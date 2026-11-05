import type { ReportWorkspace } from "@vitest-evals/core";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  adjacentVisibleCase,
  loadWorkspace,
  nextSortSearch,
  resolveSelectedCase,
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

describe("nextSortSearch", () => {
  test("starts a new column with its default direction and toggles the active one", () => {
    expect(nextSortSearch(undefined, "asc", "score")).toEqual({
      dir: "desc",
      sort: "score",
    });
    expect(nextSortSearch("score", "desc", "score")).toEqual({
      dir: "asc",
      sort: "score",
    });
    expect(nextSortSearch("score", "asc", "case")).toEqual({
      dir: "asc",
      sort: "case",
    });
    expect(nextSortSearch(undefined, "asc", "model")).toEqual({
      dir: "asc",
      sort: "model",
    });
  });
});

describe("adjacentVisibleCase", () => {
  test("opens the first or last case when nothing is selected", () => {
    expect(adjacentVisibleCase(cases, undefined, 1)?.id).toBe("failed-case");
    expect(adjacentVisibleCase(cases, undefined, -1)?.id).toBe("passed-case");
  });

  test("moves to the next visible case and stays at the ends", () => {
    expect(adjacentVisibleCase(cases, "failed-case", 1)?.id).toBe(
      "passed-case",
    );
    expect(adjacentVisibleCase(cases, "passed-case", 1)?.id).toBe(
      "passed-case",
    );
    expect(adjacentVisibleCase(cases, "passed-case", -1)?.id).toBe(
      "failed-case",
    );
  });
});

describe("passRate", () => {
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
        appTokens: 0,
        judgeTokens: 0,
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
        appTokens: 0,
        judgeTokens: 0,
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
