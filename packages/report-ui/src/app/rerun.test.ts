import { describe, expect, test } from "vitest";
import {
  escapeRegExp,
  formatRerunCommand,
  looksLikeEvalFile,
  rerunRequest,
} from "./rerun";

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
      "pnpm exec vitest run evals/refund.eval.ts -t 'refund \\(eligible\\)' --config vitest.evals.config.ts",
    );
  });

  test("keeps unit-test files on the default vitest config", () => {
    expect(
      formatRerunCommand({
        file: "src/refund.spec.ts",
        title: "approves",
      }),
    ).toBe("pnpm exec vitest run src/refund.spec.ts -t approves");
  });
});

describe("looksLikeEvalFile", () => {
  test("matches evals suites and leaves unit tests alone", () => {
    expect(looksLikeEvalFile("src/__eval__/refund.evals.ts")).toBe(true);
    expect(looksLikeEvalFile("evals/refund.eval.ts")).toBe(true);
    expect(looksLikeEvalFile("src/refund.spec.ts")).toBe(false);
  });
});

describe("escapeRegExp", () => {
  test("escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b+c")).toBe("a\\.b\\+c");
  });
});
