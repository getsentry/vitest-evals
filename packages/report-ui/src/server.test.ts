import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ReportWorkspace } from "@vitest-evals/core";
import { parseCliArgs } from "./cli-options";
import { serveReportWorkspace } from "./server";

const workspace: ReportWorkspace = {
  schemaVersion: 1,
  runs: [
    {
      id: "vitest-results.json",
      source: "vitest-results.json",
      status: "passed",
      startedAt: 1000,
      durationMs: 200,
      totals: {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        evalTotal: 1,
        evalPassed: 1,
        evalFailed: 0,
      },
    },
  ],
  cases: [
    {
      id: "case-1",
      runId: "vitest-results.json",
      source: "vitest-results.json",
      file: "/repo/apps/demo/evals/refund.eval.ts",
      displayFile: "apps/demo/evals/refund.eval.ts",
      title: "approves eligible refund",
      fullName: "refund agent approves eligible refund",
      ancestorTitles: ["refund agent"],
      displayName: "refund agent > approves eligible refund",
      status: "passed",
      durationMs: 20,
      failureMessages: [],
      eval: {
        avgScore: 1,
        scores: [{ name: "StructuredOutputJudge", score: 1 }],
      },
    },
  ],
};

describe("parseCliArgs", () => {
  test("parses report UI inputs and server options", () => {
    expect(
      parseCliArgs([
        "--json",
        "results/*.json",
        "--workspace",
        "/repo",
        "--host",
        "0.0.0.0",
        "--port",
        "4444",
        "extra.json",
      ]),
    ).toEqual({
      inputs: ["results/*.json", "extra.json"],
      workspace: "/repo",
      host: "0.0.0.0",
      port: 4444,
      help: false,
    });
  });

  test("falls back to vitest-results.json", () => {
    expect(parseCliArgs([], {})).toMatchObject({
      inputs: ["vitest-results.json"],
    });
  });
});

describe("serveReportWorkspace", () => {
  test("serves the workspace JSON and built app assets", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "vitest-evals-ui-"));
    await writeFile(join(assetsDir, "index.html"), "<main>report ui</main>");
    await writeFile(join(assetsDir, "app.js"), "console.log('ok');");

    const server = await serveReportWorkspace(workspace, {
      assetsDir,
      host: "127.0.0.1",
      port: 0,
    });

    try {
      const dataResponse = await fetch(`${server.url}/data/workspace.json`);
      await expect(dataResponse.json()).resolves.toMatchObject({
        schemaVersion: 1,
        cases: [{ id: "case-1" }],
      });

      const htmlResponse = await fetch(server.url);
      await expect(htmlResponse.text()).resolves.toContain("report ui");

      const assetResponse = await fetch(`${server.url}/app.js`);
      expect(assetResponse.headers.get("content-type")).toContain(
        "text/javascript",
      );
      await expect(assetResponse.text()).resolves.toContain("console.log");
    } finally {
      await server.close();
    }
  });

  test("falls back to index.html for client routes", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "vitest-evals-ui-"));
    await mkdir(join(assetsDir, "assets"));
    await writeFile(join(assetsDir, "index.html"), "<main>spa</main>");

    const server = await serveReportWorkspace(workspace, {
      assetsDir,
      host: "127.0.0.1",
      port: 0,
    });

    try {
      const response = await fetch(`${server.url}/cases/case-1`);
      await expect(response.text()).resolves.toContain("spa");
    } finally {
      await server.close();
    }
  });
});
