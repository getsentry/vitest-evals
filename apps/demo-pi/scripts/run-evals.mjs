import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const forwardedArgs = [];
let failMode = false;
let toolDetailLevel = 0;

for (const arg of args) {
  if (arg === "--") {
    continue;
  }

  if (arg === "--fail") {
    failMode = true;
    continue;
  }

  if (arg === "--verbose" || /^-v+$/.test(arg)) {
    toolDetailLevel += arg === "--verbose" ? 1 : arg.length - 1;
    continue;
  }

  forwardedArgs.push(arg);
}

const env = {
  ...process.env,
  ...(toolDetailLevel > 0
    ? {
        VITEST_EVALS_TOOL_DETAILS: "1",
        VITEST_EVALS_TOOL_DETAILS_LEVEL: String(
          normalizeToolDetailLevel(toolDetailLevel),
        ),
      }
    : {}),
};

const command = [
  "exec",
  "dotenv",
  "-e",
  "../../.env",
  "-e",
  "../../.env.local",
  "--",
  "vitest",
  "run",
  failMode ? "apps/demo-pi/evals/refund.fail.eval.ts" : "apps/demo-pi/evals",
  "--root",
  "../..",
  "--config",
  "vitest.config.ts",
  "--reporter",
  "packages/vitest-evals/src/reporter.ts",
  ...forwardedArgs,
];

const result = spawnSync("pnpm", command, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);

function normalizeToolDetailLevel(level) {
  if (level <= 0) {
    return 0;
  }
  if (level <= 2) {
    return 2;
  }
  if (level === 3) {
    return 3;
  }
  return 4;
}
