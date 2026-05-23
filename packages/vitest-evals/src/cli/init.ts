import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type InitOptions = {
  cwd?: string;
  force?: boolean;
};

/** Generated vitest.evals.config.ts content — mirrors the Configure Vitest section in the public docs. */
const EVALS_CONFIG_FILENAME = "vitest.evals.config.ts";

export const EVALS_CONFIG_CONTENT = `\
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["evals/**/*.eval.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ["vitest-evals/reporter"],
    env: {
      VITEST_EVALS_REPLAY_MODE:
        process.env.VITEST_EVALS_REPLAY_MODE ?? "auto",
      VITEST_EVALS_REPLAY_DIR: ".vitest-evals/recordings",
    },
  },
});
`;

export const EVALS_SCRIPTS: Record<string, string> = {
  evals: "vitest run --config vitest.evals.config.ts",
  "evals:record":
    "VITEST_EVALS_REPLAY_MODE=record vitest run --config vitest.evals.config.ts",
};

export type InitResult =
  | { status: "ok"; wrote: string[]; skipped: string[] }
  | { status: "conflict"; conflicts: string[] }
  | { status: "no-package-json" };

/**
 * Run the init command and return a structured result.
 * Does not write anything if conflicts are detected (unless force is true).
 */
export function runInit(options: InitOptions = {}): InitResult {
  const cwd = resolve(options.cwd ?? process.cwd());
  const force = options.force ?? false;

  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return { status: "no-package-json" };
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`Could not parse ${pkgPath}: invalid JSON`);
  }

  const configPath = join(cwd, EVALS_CONFIG_FILENAME);

  // Collect conflicts before writing anything.
  const conflicts: string[] = [];

  const existingConfig = existsSync(configPath)
    ? readFileSync(configPath, "utf8")
    : null;

  if (existingConfig !== null && existingConfig !== EVALS_CONFIG_CONTENT) {
    conflicts.push(EVALS_CONFIG_FILENAME);
  }

  const existingScripts =
    typeof pkg.scripts === "object" && pkg.scripts !== null
      ? (pkg.scripts as Record<string, string>)
      : {};

  for (const [key, value] of Object.entries(EVALS_SCRIPTS)) {
    const current = existingScripts[key];
    if (current !== undefined && current !== value) {
      conflicts.push(`package.json scripts.${key}`);
    }
  }

  if (conflicts.length > 0 && !force) {
    return { status: "conflict", conflicts };
  }

  // Write files.
  const wrote: string[] = [];
  const skipped: string[] = [];

  if (existingConfig === EVALS_CONFIG_CONTENT) {
    skipped.push(EVALS_CONFIG_FILENAME);
  } else {
    writeFileSync(configPath, EVALS_CONFIG_CONTENT);
    wrote.push(EVALS_CONFIG_FILENAME);
  }

  let scriptsChanged = false;
  const scripts: Record<string, string> = { ...existingScripts };
  for (const [key, value] of Object.entries(EVALS_SCRIPTS)) {
    if (scripts[key] === value) {
      skipped.push(`package.json scripts.${key}`);
    } else {
      scripts[key] = value;
      wrote.push(`package.json scripts.${key}`);
      scriptsChanged = true;
    }
  }

  if (scriptsChanged) {
    const updatedPkg = { ...pkg, scripts };
    writeFileSync(pkgPath, `${JSON.stringify(updatedPkg, null, 2)}\n`);
  }

  return { status: "ok", wrote, skipped };
}

/**
 * Run init and print results to stdout/stderr.
 * Sets process.exitCode on failure; throws on fatal errors.
 */
export async function runInitCommand(options: InitOptions = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const result = runInit(options);

  switch (result.status) {
    case "no-package-json":
      console.error(
        `No package.json found in ${cwd}. Run from your project root or pass --cwd <dir>.`,
      );
      process.exitCode = 1;
      break;

    case "conflict":
      console.error(
        "Cannot initialize: the following already exist and differ:",
      );
      for (const c of result.conflicts) {
        console.error(`  ${c}`);
      }
      console.error("\nRerun with --force to overwrite.");
      process.exitCode = 1;
      break;

    case "ok":
      if (result.wrote.length === 0) {
        console.log("vitest-evals is already configured.");
      } else {
        for (const f of result.wrote) {
          console.log(`  created  ${f}`);
        }
        console.log("\nDone. Run `pnpm evals` to run your evals.");
      }
      break;
  }
}
