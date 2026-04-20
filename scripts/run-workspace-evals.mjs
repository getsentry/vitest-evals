import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const WORKSPACE_ROOTS = ["packages", "apps"];

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

const scriptName = failMode ? "evals:fail" : "evals";
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

const packageDirs = findWorkspacePackageDirs()
  .filter((dir) => hasScript(dir, scriptName))
  .sort((a, b) => a.localeCompare(b));

if (packageDirs.length === 0) {
  console.error(`No workspace package exposes a "${scriptName}" script.`);
  process.exit(1);
}

let exitCode = 0;

for (const packageDir of packageDirs) {
  const command = [
    "exec",
    "dotenv",
    "-e",
    ".env",
    "-e",
    ".env.local",
    "--",
    "pnpm",
    "--dir",
    packageDir,
    "run",
    scriptName,
  ];

  if (forwardedArgs.length > 0) {
    command.push("--", ...forwardedArgs);
  }

  const result = spawnSync("pnpm", command, {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });

  if ((result.status ?? 1) !== 0) {
    exitCode = result.status ?? 1;
  }
}

process.exit(exitCode);

function findWorkspacePackageDirs() {
  const dirs = [];

  for (const workspaceRoot of WORKSPACE_ROOTS) {
    const absoluteRoot = join(ROOT, workspaceRoot);

    let entries = [];
    try {
      entries = readdirSync(absoluteRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const dir = join(absoluteRoot, entry.name);
      if (statSync(dir).isDirectory()) {
        dirs.push(dir);
      }
    }
  }

  return dirs;
}

function hasScript(packageDir, scriptName) {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(packageDir, "package.json"), "utf8"),
    );
    return Boolean(packageJson.scripts?.[scriptName]);
  } catch {
    return false;
  }
}

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
