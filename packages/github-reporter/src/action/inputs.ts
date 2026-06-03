import { splitResultsInput } from "@vitest-evals/core/node";

export type ActionInputs = {
  results: string[];
  publishSummary: boolean;
  publishAnnotations: boolean;
  publishCheck: boolean;
  checkName: string;
  githubToken?: string;
  failOnFailures: boolean;
  maxAnnotations?: number;
  maxFailures?: number;
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
    maxAnnotations: parseOptionalInteger(getInput(env, "max-annotations")),
    maxFailures: parseOptionalInteger(getInput(env, "max-failures")),
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

function parseOptionalInteger(value: string) {
  if (!value) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid integer input: ${value}`);
  }
  return Number(value);
}
