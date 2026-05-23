#!/usr/bin/env node
import { runInitCommand } from "./cli/init";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--help" || args[0] === "-h" || args.length === 0) {
    console.log(usage());
    return;
  }

  const command = args[0];

  if (command === "init") {
    await dispatchInit(args.slice(1));
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error(usage());
  process.exitCode = 1;
}

async function dispatchInit(args: string[]) {
  const options = parseInitArgs(args);

  if (options.help) {
    console.log(initUsage());
    return;
  }

  await runInitCommand({ cwd: options.cwd, force: options.force });
}

function parseInitArgs(args: string[]) {
  let force = false;
  let cwd: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--force":
        force = true;
        break;
      case "--cwd": {
        const value = args[++i];
        if (!value) throw new Error("Missing value for --cwd");
        cwd = value;
        break;
      }
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { force, cwd, help };
}

function usage() {
  return [
    "Usage: vitest-evals <command>",
    "",
    "Commands:",
    "  init    Generate a baseline eval config and add scripts to package.json",
    "",
    "Options:",
    "  -h, --help    Print help",
  ].join("\n");
}

function initUsage() {
  return [
    "Usage: vitest-evals init [options]",
    "",
    "Generate vitest.evals.config.ts and add eval scripts to package.json.",
    "",
    "Options:",
    "  --force          Overwrite existing config and conflicting scripts",
    "  --cwd <dir>      Target project directory (default: current directory)",
    "  -h, --help       Print help",
  ].join("\n");
}
