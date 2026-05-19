import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "..", "vitest-evals", "package.json"), {
    encoding: "utf8",
  }),
) as { version?: string };

export const PACKAGE_VERSION = pkg.version ?? "0.0.0";
export const MAJOR_VERSION = PACKAGE_VERSION.split(".")[0] ?? "0";
export const VITEST_EVALS_ACTION = `getsentry/vitest-evals@v${MAJOR_VERSION}`;
