import { describe, expect, test } from "vitest";
import { formatVitestLog, stripAnsi } from "./vitest-log";

describe("stripAnsi", () => {
  test("removes CSI color codes", () => {
    expect(stripAnsi("\u001B[1m\u001B[36mRUN\u001B[39m\u001B[22m v4")).toBe(
      "RUN v4",
    );
  });
});

describe("formatVitestLog", () => {
  test("turns carriage returns into newlines and trims", () => {
    expect(formatVitestLog("\u001B[32mok\u001B[39m\rnext\n\n\n")).toBe(
      "ok\nnext",
    );
  });
});
