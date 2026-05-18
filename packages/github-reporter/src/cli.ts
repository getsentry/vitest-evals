#!/usr/bin/env node
import { parseCliArgs } from "./cli-options";
import { publishEvalReport } from "./report";
import { escapeCommandData } from "./utils";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await publishEvalReport({
    resultPatterns: options.resultPatterns,
    cwd: options.workspace ?? process.env.GITHUB_WORKSPACE ?? process.cwd(),
    workspace:
      options.workspace ?? process.env.GITHUB_WORKSPACE ?? process.cwd(),
    summaryEnabled: options.summaryEnabled,
    summaryPath: options.summaryPath,
    annotations: options.annotations,
    checkRun: options.checkRun,
    checkRunId: options.checkRunId,
    checkName: options.checkName,
    failOnCheckError: options.failOnCheckError,
    maxAnnotations: options.maxAnnotations,
    maxFailures: options.maxFailures,
    repository: options.repository,
    sha: options.sha,
    token: options.token,
    warn,
  });

  if (options.failOnFailures && result.report.status === "failed") {
    process.exitCode = 1;
  }
}

function warn(message: string) {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(`::warning::${escapeCommandData(message)}`);
    return;
  }
  console.error(`Warning: ${message}`);
}

function usage() {
  return [
    "Usage: vitest-evals-github-report [vitest-results.json ...] [--json <path>]",
    "",
    "Options:",
    "  --json <path>             Read a Vitest JSON report from this path or glob",
    "  --summary <path>          Write job summary markdown to this path",
    "  --no-summary             Disable summary output",
    "  --annotations            Emit GitHub workflow-command annotations",
    "  --no-annotations         Disable workflow-command annotations",
    "  --check-run              Publish a GitHub Check Run when configured",
    "  --fail-on-failures       Exit non-zero when the combined report failed",
    "  --fail-on-check-error    Fail when Check Run publishing fails",
    "  --check-run-id <id>      Update an existing Check Run",
    "  --check-name <name>      Check Run name (default: vitest-evals)",
    "  --token <token>          GitHub token (default: GITHUB_TOKEN)",
    "  --repo <owner/repo>      GitHub repository (default: GITHUB_REPOSITORY)",
    "  --sha <sha>              Git commit SHA (default: GITHUB_SHA)",
    "  --workspace <path>       Workspace path for relative annotation files",
    "  --max-annotations <n>    Maximum annotations to emit",
    "  --max-failures <n>       Maximum failures to include in details",
  ].join("\n");
}
