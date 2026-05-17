#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { parseCliArgs } from "./cli-options";
import { collectEvalReport } from "./collect";
import { publishCheckRun } from "./github";
import { renderWorkflowCommands } from "./annotations";
import { renderJobSummary } from "./summary";
import type { VitestJsonReport } from "./types";
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
  if (!options.jsonPath) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const json = JSON.parse(
    await readFile(options.jsonPath, "utf8"),
  ) as VitestJsonReport;
  const report = collectEvalReport(json, {
    workspace:
      options.workspace ?? process.env.GITHUB_WORKSPACE ?? process.cwd(),
  });
  const summary = renderJobSummary(report, {
    maxFailures: options.maxFailures,
  });

  if (options.summaryEnabled) {
    if (options.summaryPath) {
      await appendFile(options.summaryPath, `${summary}\n`);
    } else {
      console.log(summary);
    }
  }

  if (options.annotations) {
    for (const command of renderWorkflowCommands(report, {
      maxAnnotations: options.maxAnnotations,
    })) {
      console.log(command);
    }
  }

  if (options.checkRun) {
    try {
      const result = await publishCheckRun(report, {
        checkRunId: options.checkRunId,
        maxAnnotations: options.maxAnnotations,
        maxFailures: options.maxFailures,
        name: options.checkName,
        repository: options.repository,
        sha: options.sha,
        token: options.token,
      });

      if (result.status === "skipped") {
        warn(`GitHub Check Run skipped: ${result.reason}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.failOnCheckError) {
        throw error;
      }
      warn(message);
    }
  }
}

function warn(message: string) {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.error(`::warning::${escapeCommandData(message)}`);
    return;
  }
  console.error(`Warning: ${message}`);
}

function usage() {
  return [
    "Usage: vitest-evals-github-report [vitest-results.json] [--json <path>]",
    "",
    "Options:",
    "  --summary <path>          Write job summary markdown to this path",
    "  --no-summary             Disable summary output",
    "  --annotations            Emit GitHub workflow-command annotations",
    "  --no-annotations         Disable workflow-command annotations",
    "  --check-run              Publish a GitHub Check Run when configured",
    "  --check-run-id <id>      Update an existing Check Run",
    "  --check-name <name>      Check Run name (default: vitest-evals)",
    "  --max-annotations <n>    Maximum annotations to emit",
    "  --max-failures <n>       Maximum failures to include in details",
  ].join("\n");
}
