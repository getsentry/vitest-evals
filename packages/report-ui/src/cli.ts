#!/usr/bin/env node
import { parseCliArgs } from "./cli-options";
import { serveReportUi, type ReportUiServer } from "./server";

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

  const server = await serveReportUi({
    inputs: options.inputs,
    workspace: options.workspace ?? process.cwd(),
    cwd: process.cwd(),
    host: options.host,
    port: options.port,
  });

  console.log(`vitest-evals report UI: ${server.url}`);
  console.log(
    `Loaded ${server.workspace.cases.length} eval case(s) from ${server.resultFiles.length} result file(s).`,
  );

  installShutdownHandlers(server);
}

function installShutdownHandlers(server: ReportUiServer) {
  const shutdown = async () => {
    await server.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function usage() {
  return [
    'Usage: vitest-evals-view [vitest-results.json | results-dir | "results/*.json" ...]',
    "",
    "Options:",
    "  --json <path>        Read a Vitest JSON report path, glob, or directory",
    "  --input <path>       Alias for --json",
    "  --workspace <path>   Workspace path used for relative source files",
    "  --host <host>        Host to bind (default: 127.0.0.1)",
    "  --port <port>        Port to bind (default: 0, an available port)",
  ].join("\n");
}
