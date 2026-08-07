import { splitResultsInput } from "@vitest-evals/core/node";

export type ActionInputs = {
  results: string[];
  publishSummary: boolean;
  publishAnnotations: boolean;
  publishCheck: boolean;
  checkName: string;
  githubToken?: string;
  failOnFailures: boolean;
  /**
   * When set, overrides the default soft-fail behavior for gated Check Runs.
   * `undefined` means "default": soft-fail only when a Check Run is published.
   */
  softFail?: boolean;
  minPassRate?: number;
  minScoreAverage?: number;
  maxAnnotations?: number;
  maxFailures?: number;
  sha?: string;
};

/** Parses GitHub Action inputs from INPUT_* environment variables. */
export function parseActionInputs(
  env: NodeJS.ProcessEnv = process.env,
): ActionInputs {
  return {
    results: splitResultsInput(
      getInput(env, "results") || "vitest-results.json",
    ),
    publishSummary: parseBooleanInput(getInput(env, "publish-summary"), true),
    publishAnnotations: parseBooleanInput(
      getInput(env, "publish-annotations"),
      true,
    ),
    publishCheck: parseBooleanInput(getInput(env, "publish-check"), false),
    checkName: getInput(env, "check-name") || "vitest-evals",
    githubToken: getInput(env, "github-token"),
    failOnFailures: parseBooleanInput(getInput(env, "fail-on-failures"), false),
    softFail: parseOptionalBooleanInput(getInput(env, "soft-fail")),
    minPassRate: parseOptionalRatio(getInput(env, "min-pass-rate")),
    minScoreAverage: parseOptionalRatio(getInput(env, "min-score-average")),
    maxAnnotations: parseOptionalInteger(getInput(env, "max-annotations")),
    maxFailures: parseOptionalInteger(getInput(env, "max-failures")),
    sha: getInput(env, "sha") || undefined,
  };
}

function getInput(env: NodeJS.ProcessEnv, name: string) {
  const hyphenKey = `INPUT_${name.toUpperCase()}`;
  const underscoreKey = `INPUT_${name.toUpperCase().replace(/-/g, "_")}`;
  return (env[hyphenKey] ?? env[underscoreKey] ?? "").trim();
}

function parseBooleanInput(value: string, defaultValue: boolean) {
  if (!value) {
    return defaultValue;
  }
  const normalizedValue = value.toLowerCase();
  if (normalizedValue === "true") {
    return true;
  }
  if (normalizedValue === "false") {
    return false;
  }
  throw new Error(`Invalid boolean input: ${value}`);
}

function parseOptionalBooleanInput(value: string) {
  if (!value) {
    return undefined;
  }
  return parseBooleanInput(value, false);
}

function parseOptionalInteger(value: string) {
  if (!value) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid integer input: ${value}`);
  }
  return Number(value);
}

function parseOptionalRatio(value: string) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Invalid ratio input: ${value}`);
  }
  return parsed;
}
