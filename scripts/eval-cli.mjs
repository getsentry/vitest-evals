export function parseEvalCliArgs(args) {
  const forwardedArgs = [];
  let failMode = false;
  let toolDetailLevel = 0;

  for (const arg of args) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--fail") {
      failMode = true;
      continue;
    }

    if (arg === "--verbose" || /^-v+$/.test(arg)) {
      toolDetailLevel += arg === "--verbose" ? 1 : arg.length - 1;
      continue;
    }

    forwardedArgs.push(arg);
  }

  return {
    failMode,
    forwardedArgs,
    toolDetailLevel: normalizeToolDetailLevel(toolDetailLevel),
  };
}

export function createEvalEnv(baseEnv, toolDetailLevel) {
  return {
    ...baseEnv,
    ...(toolDetailLevel > 0
      ? {
          VITEST_EVALS_TOOL_DETAILS: "1",
          VITEST_EVALS_TOOL_DETAILS_LEVEL: String(toolDetailLevel),
        }
      : {}),
  };
}

function normalizeToolDetailLevel(level) {
  if (level <= 0) {
    return 0;
  }
  if (level <= 2) {
    return 2;
  }
  if (level === 3) {
    return 3;
  }
  return 4;
}
