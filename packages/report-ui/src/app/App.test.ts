import { afterEach, describe, expect, test, vi } from "vitest";
import type { ReportWorkspace } from "@vitest-evals/core";
import {
  loadWorkspace,
  resolveSelectedCase,
  resolveSelectedCaseId,
} from "./App";

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
