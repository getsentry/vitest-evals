import { parseCliArgs } from "./cli-options";
import { serveReportUi, type ReportUiServer } from "./server";

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

  const server = await serveReportUi({
    inputs: optionsFromArgs.inputs,
    workspace: optionsFromArgs.workspace ?? cwd,
    cwd,
    host: optionsFromArgs.host,
    port: optionsFromArgs.port,
  });

  writeLine(options.stdout, `vitest-evals report UI: ${server.url}`);
  writeLine(
    options.stdout,
    `Loaded ${server.workspace.cases.length} eval case(s) from ${server.resultFiles.length} result file(s).`,
  );
  writeLine(options.stdout, "Press Ctrl-C to stop.");

  installShutdownHandlers(server);
}

function installShutdownHandlers(server: ReportUiServer) {
  const shutdown = async () => {
    await server.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
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
  ].join("\n");
}

function writeLine(
  stdout: Pick<NodeJS.WriteStream, "write"> | undefined,
  message: string,
) {
  (stdout ?? process.stdout).write(`${message}\n`);
}

declare const require: NodeJS.Require | undefined;
declare const module: NodeJS.Module | undefined;

if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module
) {
  runReportUiCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
