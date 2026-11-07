import type { ReportCase, ReportWorkspace } from "@vitest-evals/core";
import { describe, expect, test } from "vitest";
import { mergeRerunWorkspace, replaceRerunCase } from "./merge-workspace";

describe("mergeRerunWorkspace", () => {
  test("replaces only the rerun case and keeps the others", () => {
    const previous = workspaceWith([
      caseOf({
        id: "atlas",
        fullName: "atlas",
        title: "Atlas",
        status: "passed",
        durationMs: 10_000,
      }),
      caseOf({
        id: "datafast",
        fullName: "datafast",
        title: "Datafast",
        status: "failed",
        durationMs: 28_000,
      }),
    ]);
    const incoming = workspaceWith([
      caseOf({
        id: "datafast-rerun",
        fullName: "datafast",
        title: "Datafast",
        status: "passed",
        durationMs: 16_000,
        eval: { avgScore: 0.94, scores: [], thresholdFailed: false },
      }),
    ]);

    const merged = mergeRerunWorkspace(previous, incoming);
    expect(merged.cases).toHaveLength(2);
    expect(merged.cases[0]?.id).toBe("atlas");
    expect(merged.cases[1]).toMatchObject({
      id: "datafast",
      status: "passed",
      durationMs: 16_000,
    });
    expect(merged.runs[0]?.totals).toMatchObject({
      evalTotal: 2,
      evalPassed: 2,
      evalFailed: 0,
    });
    expect(merged.runs[0]?.status).toBe("passed");
  });

  test("keeps each run's own result when several runs share a case", () => {
    const previous: ReportWorkspace = {
      schemaVersion: 2,
      runs: [runOf("run-1", 1_000), runOf("run-2", 2_000)],
      cases: [
        caseOf({ id: "a1", runId: "run-1", fullName: "atlas", title: "A" }),
        caseOf({ id: "a2", runId: "run-2", fullName: "atlas", title: "A" }),
      ],
    };
    const incoming: ReportWorkspace = {
      schemaVersion: 2,
      runs: [
        runOf("run-1", 1_000),
        { ...runOf("run-2", 9_000), durationMs: 16 },
      ],
      cases: [
        caseOf({ id: "x1", runId: "run-1", fullName: "atlas", title: "A" }),
        caseOf({
          id: "x2",
          runId: "run-2",
          fullName: "atlas",
          title: "A",
          status: "failed",
        }),
      ],
    };

    const merged = mergeRerunWorkspace(previous, incoming);
    expect(
      merged.cases.map((testCase) => [testCase.id, testCase.status]),
    ).toEqual([
      ["a1", "passed"],
      ["a2", "failed"],
    ]);
    expect(merged.runs.map((run) => run.startedAt)).toEqual([1_000, 2_000]);
    expect(merged.runs.map((run) => run.durationMs)).toEqual([0, 0]);
  });

  test("keeps the previous workspace when the incoming dump is empty", () => {
    const previous = workspaceWith([
      caseOf({ id: "atlas", fullName: "atlas", title: "Atlas" }),
    ]);
    expect(mergeRerunWorkspace(previous, workspaceWith([])).cases[0]?.id).toBe(
      "atlas",
    );
  });
});

describe("replaceRerunCase", () => {
  test("swaps one case's result and keeps its identity and run", () => {
    const previous: ReportWorkspace = {
      schemaVersion: 2,
      runs: [runOf("run-1", 1_000), runOf("run-2", 2_000)],
      cases: [
        caseOf({ id: "a1", runId: "run-1", fullName: "atlas", title: "A" }),
        caseOf({
          id: "a2",
          runId: "run-2",
          fullName: "atlas",
          title: "A",
          status: "failed",
        }),
      ],
    };
    const merged = replaceRerunCase(
      previous,
      "a2",
      caseOf({
        id: "tmp-id",
        runId: "tmp-run",
        file: "/tmp/elsewhere/a.eval.ts",
        fullName: "atlas",
        title: "A",
        status: "passed",
        durationMs: 5,
      }),
    );
    expect(merged.cases[0]).toBe(previous.cases[0]);
    expect(merged.cases[1]).toMatchObject({
      id: "a2",
      runId: "run-2",
      file: previous.cases[1]?.file,
      status: "passed",
      durationMs: 5,
    });
    expect(merged.runs.map((run) => [run.id, run.startedAt])).toEqual([
      ["run-1", 1_000],
      ["run-2", 2_000],
    ]);
    expect(merged.runs[1]?.status).toBe("passed");
  });
});

function runOf(id: string, startedAt: number): ReportWorkspace["runs"][number] {
  return {
    id,
    status: "passed",
    startedAt,
    durationMs: 0,
    totals: {
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      evalTotal: 1,
      evalPassed: 1,
      evalFailed: 0,
    },
  };
}

function workspaceWith(cases: ReportCase[]): ReportWorkspace {
  return {
    schemaVersion: 2,
    runs: [
      {
        id: "run-1",
        status: "failed",
        durationMs: 38_000,
        totals: {
          total: cases.length,
          passed: 0,
          failed: 1,
          skipped: 0,
          evalTotal: cases.length,
          evalPassed: 0,
          evalFailed: 1,
        },
      },
    ],
    cases,
  };
}

function caseOf(
  values: Partial<ReportCase> & Pick<ReportCase, "id" | "fullName" | "title">,
): ReportCase {
  return {
    ancestorTitles: ["Product metadata suggestion"],
    displayFile: "product.evals.ts",
    displayName: `Product metadata suggestion > ${values.title}`,
    failureMessages: [],
    file: "/repo/product.evals.ts",
    runId: "run-1",
    status: "passed",
    ...values,
  };
}
