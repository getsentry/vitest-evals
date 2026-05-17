#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { collectEvalReport } from "./collect";
import { publishCheckRun } from "./github";
import { renderWorkflowCommands } from "./annotations";
import { renderJobSummary } from "./summary";
import type { VitestJsonReport } from "./types";
import { escapeCommandData } from "./utils";

type CliOptions = {
  jsonPath?: string;
  summaryPath?: string;
  summaryEnabled: boolean;
  annotations: boolean;
  checkRun: boolean;
  failOnCheckError: boolean;
  maxAnnotations?: number;
  maxFailures?: number;
  checkRunId?: number;
  checkName?: string;
  token?: string;
  repository?: string;
  sha?: string;
  workspace?: string;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
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

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    jsonPath: process.env.VITEST_EVALS_JSON_REPORT ?? "vitest-results.json",
    summaryPath: process.env.GITHUB_STEP_SUMMARY,
    summaryEnabled: true,
    annotations: process.env.GITHUB_ACTIONS === "true",
    checkRun: false,
    failOnCheckError: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--json":
        options.jsonPath = readValue(args, ++index, arg);
        break;
      case "--summary":
        options.summaryPath = readValue(args, ++index, arg);
        options.summaryEnabled = true;
        break;
      case "--no-summary":
        options.summaryEnabled = false;
        break;
      case "--annotations":
        options.annotations = true;
        break;
      case "--no-annotations":
        options.annotations = false;
        break;
      case "--check-run":
        options.checkRun = true;
        break;
      case "--fail-on-check-error":
        options.failOnCheckError = true;
        break;
      case "--max-annotations":
        options.maxAnnotations = readInteger(args, ++index, arg);
        break;
      case "--max-failures":
        options.maxFailures = readInteger(args, ++index, arg);
        break;
      case "--check-run-id":
        options.checkRunId = readInteger(args, ++index, arg);
        options.checkRun = true;
        break;
      case "--check-name":
        options.checkName = readValue(args, ++index, arg);
        break;
      case "--token":
        options.token = readValue(args, ++index, arg);
        break;
      case "--repo":
        options.repository = readValue(args, ++index, arg);
        break;
      case "--sha":
        options.sha = readValue(args, ++index, arg);
        break;
      case "--workspace":
        options.workspace = readValue(args, ++index, arg);
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
        return options;
      default:
        if (!arg.startsWith("-") && !options.jsonPath) {
          options.jsonPath = arg;
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readInteger(args: string[], index: number, flag: string) {
  const value = Number.parseInt(readValue(args, index, flag), 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid integer for ${flag}`);
  }
  return value;
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
    "Usage: vitest-evals-github-report [--json <vitest-results.json>]",
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
