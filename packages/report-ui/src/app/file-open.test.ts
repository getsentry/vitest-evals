import { describe, expect, test } from "vitest";
import { editorTargets } from "./file-open";

describe("editorTargets", () => {
  test("includes line and column when the file has a location", () => {
    expect(
      editorTargets({
        column: 4,
        file: "/repo/refund.eval.ts",
        line: 12,
      }).map((target) => target.href),
    ).toEqual([
      "vscode://file/repo/refund.eval.ts:12:4",
      "vscode-insiders://file/repo/refund.eval.ts:12:4",
      "cursor://file/repo/refund.eval.ts:12:4",
      "zed://file/repo/refund.eval.ts:12:4",
    ]);
  });
});
