import { describe, expect, test } from "vitest";
import { editorTargets } from "./file-open";

describe("editorTargets", () => {
  test("includes line and column when the case has a location", () => {
    const targets = editorTargets({
      ancestorTitles: [],
      displayFile: "refund.eval.ts",
      displayName: "refund",
      failureMessages: [],
      file: "/repo/refund.eval.ts",
      fullName: "refund",
      id: "case-1",
      location: { column: 4, line: 12 },
      runId: "run-1",
      status: "failed",
      title: "refund",
    });

    expect(targets.map((target) => target.href)).toEqual([
      "vscode://file/repo/refund.eval.ts:12:4",
      "vscode-insiders://file/repo/refund.eval.ts:12:4",
      "cursor://file/repo/refund.eval.ts:12:4",
      "zed://file/repo/refund.eval.ts:12:4",
    ]);
  });
});
