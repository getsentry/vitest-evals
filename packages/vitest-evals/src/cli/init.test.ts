import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EVALS_CONFIG_CONTENT, EVALS_SCRIPTS, runInit } from "./init";

function makeTmpDir() {
  const dir = join(
    tmpdir(),
    `vitest-evals-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writePkg(dir: string, pkg: Record<string, unknown>) {
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

function readPkg(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

function readConfig(dir: string): string {
  return readFileSync(join(dir, "vitest.evals.config.ts"), "utf8");
}

describe("runInit", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns no-package-json when package.json is missing", () => {
    const result = runInit({ cwd: dir });
    expect(result).toEqual({ status: "no-package-json" });
  });

  it("creates config and adds scripts on a fresh project", () => {
    writePkg(dir, { name: "my-app" });

    const result = runInit({ cwd: dir });

    expect(result).toEqual({
      status: "ok",
      wrote: [
        "vitest.evals.config.ts",
        "package.json scripts.evals",
        "package.json scripts.evals:record",
      ],
      skipped: [],
    });

    expect(readConfig(dir)).toBe(EVALS_CONFIG_CONTENT);

    const pkg = readPkg(dir);
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts.evals).toBe(EVALS_SCRIPTS.evals);
    expect(scripts["evals:record"]).toBe(EVALS_SCRIPTS["evals:record"]);
  });

  it("preserves existing scripts when adding new ones", () => {
    writePkg(dir, { name: "my-app", scripts: { test: "vitest" } });

    runInit({ cwd: dir });

    const pkg = readPkg(dir);
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts.test).toBe("vitest");
    expect(scripts.evals).toBe(EVALS_SCRIPTS.evals);
  });

  it("is idempotent on a second run", () => {
    writePkg(dir, { name: "my-app" });

    runInit({ cwd: dir });
    const result = runInit({ cwd: dir });

    expect(result).toEqual({
      status: "ok",
      wrote: [],
      skipped: [
        "vitest.evals.config.ts",
        "package.json scripts.evals",
        "package.json scripts.evals:record",
      ],
    });
  });

  it("returns conflict when config exists with different content", () => {
    writePkg(dir, { name: "my-app" });
    writeFileSync(join(dir, "vitest.evals.config.ts"), "// custom config\n");

    const result = runInit({ cwd: dir });

    expect(result).toEqual({
      status: "conflict",
      conflicts: ["vitest.evals.config.ts"],
    });
  });

  it("returns conflict when scripts have different values", () => {
    writePkg(dir, {
      name: "my-app",
      scripts: { evals: "vitest run --config other.config.ts" },
    });

    const result = runInit({ cwd: dir });

    expect(result).toEqual({
      status: "conflict",
      conflicts: ["package.json scripts.evals"],
    });
  });

  it("returns all conflicts when multiple things differ", () => {
    writePkg(dir, {
      name: "my-app",
      scripts: {
        evals: "custom",
        "evals:record": "custom-record",
      },
    });
    writeFileSync(join(dir, "vitest.evals.config.ts"), "// different\n");

    const result = runInit({ cwd: dir });
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.conflicts).toHaveLength(3);
    }
  });

  it("overwrites with --force even when conflicts exist", () => {
    writePkg(dir, {
      name: "my-app",
      scripts: { evals: "custom", "evals:record": "custom-record" },
    });
    writeFileSync(join(dir, "vitest.evals.config.ts"), "// different\n");

    const result = runInit({ cwd: dir, force: true });

    expect(result.status).toBe("ok");
    expect(readConfig(dir)).toBe(EVALS_CONFIG_CONTENT);

    const pkg = readPkg(dir);
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts.evals).toBe(EVALS_SCRIPTS.evals);
    expect(scripts["evals:record"]).toBe(EVALS_SCRIPTS["evals:record"]);
  });

  it("--force preserves unrelated package.json fields and scripts", () => {
    writePkg(dir, {
      name: "my-app",
      version: "1.2.3",
      scripts: { test: "vitest", evals: "old-evals" },
      dependencies: { lodash: "^4.17.21" },
    });

    runInit({ cwd: dir, force: true });

    const pkg = readPkg(dir);
    expect(pkg.name).toBe("my-app");
    expect(pkg.version).toBe("1.2.3");
    expect((pkg.dependencies as Record<string, string>).lodash).toBe(
      "^4.17.21",
    );
    expect((pkg.scripts as Record<string, string>).test).toBe("vitest");
  });

  it("throws on invalid package.json JSON", () => {
    writeFileSync(join(dir, "package.json"), "not valid json");
    expect(() => runInit({ cwd: dir })).toThrow(/invalid JSON/);
  });

  it("targets --cwd directory", () => {
    writePkg(dir, { name: "my-app" });

    const result = runInit({ cwd: dir });

    expect(result.status).toBe("ok");
    expect(readConfig(dir)).toBe(EVALS_CONFIG_CONTENT);
  });
});
