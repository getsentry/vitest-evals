import { describe, expect, test } from "vitest";
import { relativeDisplayPath, resolveOpenPath } from "./display-path";

describe("relativeDisplayPath", () => {
  test("strips the CLI workspace prefix", () => {
    expect(
      relativeDisplayPath(
        "/Users/me/app/eval-results/vitest-evals.json",
        "/Users/me/app",
      ),
    ).toBe("eval-results/vitest-evals.json");
  });

  test("keeps paths that are already relative", () => {
    expect(relativeDisplayPath("src/ai/prompt.eval.ts", "/Users/me/app")).toBe(
      "src/ai/prompt.eval.ts",
    );
  });
});

describe("resolveOpenPath", () => {
  test("joins a relative path onto the workspace root", () => {
    expect(resolveOpenPath("src/ai/prompt.eval.ts", "/Users/me/app")).toBe(
      "/Users/me/app/src/ai/prompt.eval.ts",
    );
  });

  test("keeps an absolute path", () => {
    expect(resolveOpenPath("/repo/file.ts", "/Users/me/app")).toBe(
      "/repo/file.ts",
    );
  });
});
