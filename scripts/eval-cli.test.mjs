import { describe, expect, test } from "vitest";
import { createEvalEnv, parseEvalCliArgs } from "./eval-cli.mjs";

describe("eval CLI helpers", () => {
  test("defaults demo evals to replay auto mode", () => {
    expect(createEvalEnv({})).toMatchObject({
      VITEST_EVALS_REPLAY_MODE: "auto",
      VITEST_EVALS_REPLAY_DIR: ".vitest-evals/recordings",
    });
  });

  test("preserves explicit replay overrides", () => {
    expect(
      createEvalEnv(
        {
          VITEST_EVALS_REPLAY_MODE: "strict",
          VITEST_EVALS_REPLAY_DIR: "/tmp/replay",
        },
        "normal",
      ),
    ).toMatchObject({
      VITEST_EVALS_REPLAY_MODE: "strict",
      VITEST_EVALS_REPLAY_DIR: "/tmp/replay",
    });
  });

  test("marks intentional failure runs", () => {
    expect(createEvalEnv({}, "normal", { failMode: true })).toMatchObject({
      VITEST_EVALS_FAIL_MODE: "1",
    });
  });

  test("keeps report-level flags separate from forwarded Vitest args", () => {
    expect(parseEvalCliArgs(["--", "--info", "-vv", "--pool=forks"])).toEqual({
      failMode: false,
      forwardedArgs: ["--pool=forks"],
      reportLevel: "info",
    });
  });

  test("marks info report level in the eval environment", () => {
    expect(createEvalEnv({}, "info")).toMatchObject({
      VITEST_EVALS_REPORT_LEVEL: "info",
    });
  });
});
