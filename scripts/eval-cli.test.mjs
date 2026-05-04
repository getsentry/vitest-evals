import { describe, expect, test } from "vitest";
import { createEvalEnv, parseEvalCliArgs } from "./eval-cli.mjs";

describe("eval CLI helpers", () => {
  test("defaults demo evals to replay auto mode", () => {
    expect(createEvalEnv({}, 0)).toMatchObject({
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
        0,
      ),
    ).toMatchObject({
      VITEST_EVALS_REPLAY_MODE: "strict",
      VITEST_EVALS_REPLAY_DIR: "/tmp/replay",
    });
  });

  test("keeps verbose flags separate from forwarded Vitest args", () => {
    expect(parseEvalCliArgs(["--", "-vv", "--pool=forks"])).toEqual({
      failMode: false,
      forwardedArgs: ["--pool=forks"],
      toolDetailLevel: 2,
    });
  });
});
