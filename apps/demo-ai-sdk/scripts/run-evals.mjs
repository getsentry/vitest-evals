import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEvalEnv, parseEvalCliArgs } from "../../../scripts/eval-cli.mjs";

const WORKSPACE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const { failMode, forwardedArgs, toolDetailLevel } = parseEvalCliArgs(
  process.argv.slice(2),
);
const env = createEvalEnv(process.env, toolDetailLevel);

const explicitTargetIndex = forwardedArgs.findIndex(
  (arg) => !arg.startsWith("-"),
);
const target =
  explicitTargetIndex >= 0
    ? forwardedArgs.splice(explicitTargetIndex, 1)[0]
    : failMode
      ? "apps/demo-ai-sdk/evals/refund.fail.eval.ts"
      : "apps/demo-ai-sdk/evals/refund.eval.ts";

const command = [
  "exec",
  "dotenv",
  "-e",
  ".env",
  "-e",
  ".env.local",
  "--",
  "vitest",
  "run",
  target,
  "--config",
  "vitest.config.ts",
  "--reporter",
  "packages/vitest-evals/src/reporter.ts",
  ...forwardedArgs,
];

const result = spawnSync("pnpm", command, {
  cwd: WORKSPACE_ROOT,
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
