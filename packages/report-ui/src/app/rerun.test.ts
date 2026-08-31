import { describe, expect, test } from "vitest";
import { escapeRegExp, formatRerunCommand, rerunRequest } from "./rerun";

describe("rerunRequest", () => {
  test("takes file and title from the case", () => {
    expect(
      rerunRequest({
        file: "/repo/evals/refund.eval.ts",
        title: "approves eligible refund",
      }),
    ).toEqual({
      file: "/repo/evals/refund.eval.ts",
      title: "approves eligible refund",
    });
  });
});

describe("formatRerunCommand", () => {
  test("quotes titles that need a regex escape", () => {
    expect(
      formatRerunCommand({
        file: "evals/refund.eval.ts",
        title: "refund (eligible)",
      }),
    ).toBe(
      "pnpm exec vitest run evals/refund.eval.ts -t 'refund \\(eligible\\)'",
    );
  });
});

describe("escapeRegExp", () => {
  test("escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b+c")).toBe("a\\.b\\+c");
  });
});
