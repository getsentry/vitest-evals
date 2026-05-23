export function parseEvalCliArgs(args) {
  const forwardedArgs = [];
  let failMode = false;
  let reportLevel = "normal";

  for (const arg of args) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--fail") {
      failMode = true;
      continue;
    }

    if (arg === "--info" || arg === "--verbose" || /^-v+$/.test(arg)) {
      reportLevel = "info";
      continue;
    }

    forwardedArgs.push(arg);
  }

  return {
    failMode,
    forwardedArgs,
    reportLevel,
  };
}

export function createEvalEnv(baseEnv, reportLevel = "normal", options = {}) {
  return {
    ...baseEnv,
    VITEST_EVALS_REPLAY_MODE: baseEnv.VITEST_EVALS_REPLAY_MODE ?? "auto",
    VITEST_EVALS_REPLAY_DIR:
      baseEnv.VITEST_EVALS_REPLAY_DIR ?? ".vitest-evals/recordings",
    ...(options.failMode || baseEnv.VITEST_EVALS_FAIL_MODE
      ? { VITEST_EVALS_FAIL_MODE: "1" }
      : {}),
    ...(reportLevel === "info"
      ? {
          VITEST_EVALS_REPORT_LEVEL: "info",
        }
      : {}),
  };
}
