#!/usr/bin/env node

/** Output streams used by the `vitest-evals` CLI runner. */
export type VitestEvalsCliIo = {
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

/** Options for running the `vitest-evals` CLI. */
export type RunVitestEvalsCliOptions = VitestEvalsCliIo & {
  cwd?: string;
};

/** Runs the product-facing `vitest-evals` CLI. */
export async function runVitestEvalsCli(
  args = process.argv.slice(2),
  options: RunVitestEvalsCliOptions = {},
) {
  const [command, ...commandArgs] = args;

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    writeLine(options.stdout, usage());
    return;
  }

  switch (command) {
    case "serve": {
      const { runReportUiCli } = await import("@vitest-evals/report-ui");
      await runReportUiCli(commandArgs, {
        commandName: "vitest-evals serve",
        cwd: options.cwd,
        stdout: options.stdout,
      });
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

function usage() {
  return [
    "Usage: vitest-evals <command>",
    "",
    "Commands:",
    "  serve [json | dir | glob]   Serve the local report UI",
    "",
    "Run `vitest-evals serve --help` for report UI options.",
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
  runVitestEvalsCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
