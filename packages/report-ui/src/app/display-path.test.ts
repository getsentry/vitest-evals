import { describe, expect, test } from "vitest";
import {
  distinctPathLabels,
  relativeDisplayPath,
  resolveOpenPath,
  sharedDirectory,
} from "./display-path";

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

describe("distinctPathLabels", () => {
  test("drops the directory sibling result files share", () => {
    expect(
      distinctPathLabels([
        "eval-results/shard-1/vitest.json",
        "eval-results/shard-2/vitest.json",
      ]),
    ).toEqual(["shard-1/vitest.json", "shard-2/vitest.json"]);
    expect(
      sharedDirectory(["eval-results/a.json", "eval-results/b.json"]),
    ).toBe("eval-results");
  });

  test("keeps a single path whole", () => {
    expect(distinctPathLabels(["eval-results/a.json"])).toEqual([
      "eval-results/a.json",
    ]);
  });
});
