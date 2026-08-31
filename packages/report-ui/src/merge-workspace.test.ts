import type { ReportCase, ReportWorkspace } from "@vitest-evals/core";
import { describe, expect, test } from "vitest";
import { mergeRerunWorkspace } from "./merge-workspace";

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
      id: "datafast-rerun",
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

  test("keeps the previous workspace when the incoming dump is empty", () => {
    const previous = workspaceWith([
      caseOf({ id: "atlas", fullName: "atlas", title: "Atlas" }),
    ]);
    expect(mergeRerunWorkspace(previous, workspaceWith([])).cases[0]?.id).toBe(
      "atlas",
    );
  });
});

function workspaceWith(cases: ReportCase[]): ReportWorkspace {
  return {
    schemaVersion: 1,
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
