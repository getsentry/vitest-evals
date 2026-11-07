import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReportCase, ReportWorkspace } from "@vitest-evals/core";
import { describe, expect, test } from "vitest";
import { prepareRerun, spawnVitest } from "./rerun-exec";

describe("spawnVitest", () => {
  test("kill stops the child and its own children", async () => {
    const started = Date.now();
    const spawned = spawnVitest(
      [
        "-e",
        "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], { stdio: 'inherit' }); setTimeout(() => {}, 60_000)",
      ],
      process.cwd(),
      () => undefined,
    );
    setTimeout(() => spawned.kill(), 200);
    const result = await spawned.done;
    expect(result.exitCode).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(8_000);
  });
});

describe("prepareRerun", () => {
  test("builds the run from the report case, not the request", async () => {
    const root = await workspaceRoot();
    const file = join(root, "src", "__eval__", "refund.evals.ts");
    const workspace = workspaceWith(
      caseOf({
        id: "refund-1",
        file,
        displayFile: "src/__eval__/refund.evals.ts",
        ancestorTitles: ["refund"],
        title: "eligible (full)",
      }),
    );

    const prepared = await prepareRerun(
      { caseId: "refund-1", file: "/etc/passwd", title: "x" },
      workspace,
      root,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.args[0]).toBe(
      join(root, "node_modules", "vitest", "vitest.mjs"),
    );
    expect(prepared.args.slice(1, 4)).toEqual([
      "run",
      "src/__eval__/refund.evals.ts",
      "--testNamePattern=^refund > eligible \\(full\\)$",
    ]);
    expect(prepared.args).toContain("--reporter=json");
    expect(prepared.args).toContain(`--outputFile.json=${prepared.outputFile}`);
    expect(prepared.args).toContain("--config=vitest.evals.config.ts");
  });

  test("falls back to displayFile when the report came from another checkout", async () => {
    const root = await workspaceRoot();
    const workspace = workspaceWith(
      caseOf({
        id: "ci",
        file: "/home/runner/work/app/src/__eval__/refund.evals.ts",
        displayFile: "src/__eval__/refund.evals.ts",
      }),
    );
    const prepared = await prepareRerun({ caseId: "ci" }, workspace, root);
    expect(prepared.ok && prepared.args[2]).toBe(
      "src/__eval__/refund.evals.ts",
    );
  });

  test("rejects unknown cases, bad bodies, and files outside the root", async () => {
    const root = await workspaceRoot();
    const workspace = workspaceWith(
      caseOf({ id: "outside", file: "/etc/hosts", displayFile: "../hosts" }),
    );
    await expect(
      prepareRerun({ caseId: "missing" }, workspace, root),
    ).resolves.toMatchObject({ ok: false, status: 404 });
    await expect(
      prepareRerun({ file: ".", title: "a" }, workspace, root),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      prepareRerun({ caseId: "outside" }, workspace, root),
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });
});

async function workspaceRoot() {
  const root = await mkdtemp(join(tmpdir(), "vitest-evals-rerun-"));
  await mkdir(join(root, "src", "__eval__"), { recursive: true });
  await writeFile(join(root, "src", "__eval__", "refund.evals.ts"), "");
  await writeFile(join(root, "vitest.evals.config.ts"), "export default {}");
  await writeFile(join(root, "package.json"), "{}");
  await mkdir(join(root, "node_modules", "vitest"), { recursive: true });
  await writeFile(
    join(root, "node_modules", "vitest", "package.json"),
    JSON.stringify({ name: "vitest", version: "0.0.0" }),
  );
  await writeFile(join(root, "node_modules", "vitest", "vitest.mjs"), "");
  return root;
}

function workspaceWith(testCase: ReportCase): ReportWorkspace {
  return {
    schemaVersion: 2,
    runs: [],
    cases: [testCase],
  } as unknown as ReportWorkspace;
}

function caseOf(overrides: Partial<ReportCase>): ReportCase {
  return {
    id: "case",
    runId: "run",
    file: "/repo/case.eval.ts",
    displayFile: "case.eval.ts",
    title: "case",
    fullName: "case",
    ancestorTitles: [],
    displayName: "case",
    status: "passed",
    failureMessages: [],
    ...overrides,
  };
}
