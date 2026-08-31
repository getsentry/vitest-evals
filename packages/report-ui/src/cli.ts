import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readReportWorkspace } from "@vitest-evals/core/node";
import {
  formatJunitXml,
  formatPullRequestComment,
} from "./app/ci-artifacts.js";
import { parseCliArgs } from "./cli-options";
import { currentModuleUrl } from "./esm-runtime.js";
import { loadPricingTable } from "./pricing-catalog.js";
import { type ReportUiServer, serveReportWorkspace } from "./server";

type ShutdownSignal = "SIGINT" | "SIGTERM";

type ShutdownLifecycle = {
  exit(code: number): unknown;
  once(signal: ShutdownSignal, listener: () => Promise<void> | void): unknown;
};

/** Output streams used by the report UI CLI runner. */
export type ReportUiCliIo = {
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

/** Options for running the report UI CLI implementation. */
export type RunReportUiCliOptions = ReportUiCliIo & {
  commandName?: string;
  cwd?: string;
};

/** Runs the report UI CLI implementation used by `vitest-evals serve`. */
export async function runReportUiCli(
  args: string[],
  options: RunReportUiCliOptions = {},
) {
  const cwd = options.cwd ?? process.cwd();
  const commandName = options.commandName ?? "vitest-evals serve";
  const optionsFromArgs = parseCliArgs(args);
  if (optionsFromArgs.help) {
    writeLine(options.stdout, usage(commandName));
    return;
  }

  if (
    !optionsFromArgs.serve &&
    !optionsFromArgs.junit &&
    !optionsFromArgs.comment
  ) {
    throw new Error("Pass --junit, --comment, or omit --no-serve.");
  }

  const workspaceRoot = optionsFromArgs.workspace ?? cwd;
  const { workspace, resultFiles } = await readReportWorkspace(
    optionsFromArgs.inputs,
    { cwd, workspace: workspaceRoot },
  );
  const pricing = await loadPricingTable();

  if (optionsFromArgs.junit) {
    const path = resolve(cwd, optionsFromArgs.junit);
    await writeFile(path, formatJunitXml(workspace));
    writeLine(options.stdout, `Wrote JUnit report: ${path}`);
  }
  if (optionsFromArgs.comment) {
    const path = resolve(cwd, optionsFromArgs.comment);
    await writeFile(path, formatPullRequestComment(workspace, pricing));
    writeLine(options.stdout, `Wrote pull-request comment: ${path}`);
  }

  writeLine(
    options.stdout,
    `Loaded ${workspace.cases.length} eval case(s) from ${resultFiles.length} result file(s).`,
  );

  if (!optionsFromArgs.serve) {
    return;
  }

  const server = await serveReportWorkspace(workspace, {
    host: optionsFromArgs.host,
    port: optionsFromArgs.port,
    pricing,
    resultFiles,
    workspaceRoot: resolve(workspaceRoot),
  });

  writeLine(options.stdout, `vitest-evals report UI: ${server.url}`);
  writeLine(options.stdout, "Press Ctrl-C to stop.");

  installShutdownHandlers(server);
}

/** Installs signal handlers that close the report UI server and end the CLI. */
export function installShutdownHandlers(
  server: Pick<ReportUiServer, "close">,
  lifecycle: ShutdownLifecycle = process,
) {
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    try {
      await server.close();
      lifecycle.exit(0);
    } catch {
      lifecycle.exit(1);
    }
  };

  lifecycle.once("SIGINT", shutdown);
  lifecycle.once("SIGTERM", shutdown);
}

function usage(commandName: string) {
  return [
    `Usage: ${commandName} [vitest-results.json | results-dir | "results/*.json" ...]`,
    "",
    "Options:",
    "  --json <path>        Read a Vitest JSON report path, glob, or directory",
    "  --workspace <path>   Workspace path used for relative source files",
    "  --host <host>        Host to bind (default: 127.0.0.1)",
    "  --port <port>        Port to bind (default: 0, an available port)",
    "  --junit <path>       Write a JUnit XML report",
    "  --comment <path>     Write a Markdown pull-request comment",
    "  --no-serve           Write artifacts and exit without opening the UI",
  ].join("\n");
}

function writeLine(
  stdout: Pick<NodeJS.WriteStream, "write"> | undefined,
  message: string,
) {
  (stdout ?? process.stdout).write(`${message}\n`);
}

if (
  process.argv[1] &&
  currentModuleUrl() === pathToFileURL(process.argv[1]).href
) {
  runReportUiCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
