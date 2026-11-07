import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ReportWorkspace } from "@vitest-evals/core";
import { readReportWorkspace } from "@vitest-evals/core/node";
import { describe, expect, test } from "vitest";
import { parseCliArgs } from "./cli-options";
import { serveReportWorkspace } from "./server";

const workspace: ReportWorkspace = {
  schemaVersion: 2,
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
      serve: true,
      help: false,
    });
  });

  test("falls back to vitest-results.json", () => {
    expect(parseCliArgs([], {})).toMatchObject({
      inputs: ["vitest-results.json"],
    });
  });

  test("keeps the visual fixture compatible with the current report schema", async () => {
    const fixture = resolve(
      process.cwd(),
      "packages/report-ui/fixtures/vitest-results.visual.json",
    );
    const { workspace } = await readReportWorkspace([fixture], {
      workspace: "/repo",
    });

    expect(workspace.cases).toHaveLength(5);
    expect(workspace.cases[0]?.harness?.run?.usage).toMatchObject({
      totalTokens: 1220,
      costUsd: 0.084,
    });
    expect(
      workspace.cases[0]?.eval?.scores?.[0]?.judgeRuns?.[0]?.usage,
    ).toMatchObject({
      totalTokens: 96,
      costUsd: 0.012,
    });
  });

  test("parses artifact flags and --no-serve", () => {
    expect(
      parseCliArgs(["--junit", "out.xml", "--comment", "pr.md", "--no-serve"]),
    ).toMatchObject({
      junit: "out.xml",
      comment: "pr.md",
      serve: false,
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
      workspaceRoot: "/repo",
    });

    try {
      const dataResponse = await fetch(`${server.url}/data/workspace.json`);
      await expect(dataResponse.json()).resolves.toMatchObject({
        schemaVersion: 2,
        cases: [{ id: "case-1" }],
      });

      const metaResponse = await fetch(`${server.url}/data/meta.json`);
      await expect(metaResponse.json()).resolves.toMatchObject({
        workspaceRoot: "/repo",
        pricing: { source: "fallback" },
      });

      const htmlResponse = await fetch(server.url);
      await expect(htmlResponse.text()).resolves.toContain("report ui");

      const assetResponse = await fetch(`${server.url}/app.js`);
      expect(assetResponse.headers.get("content-type")).toContain(
        "text/javascript",
      );
      await expect(assetResponse.text()).resolves.toContain("console.log");

      const rerunResponse = await postApi(server.url, "/api/rerun", {
        caseId: "missing",
      });
      expect(rerunResponse.status).toBe(404);
      await expect(rerunResponse.json()).resolves.toMatchObject({
        ok: false,
        error: "Case not found in the report.",
      });

      const eventsResponse = await fetch(`${server.url}/api/events`);
      expect(eventsResponse.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      const reader = eventsResponse.body?.getReader();
      const first = await reader?.read();
      expect(new TextDecoder().decode(first?.value)).toContain('"hello"');
      await reader?.cancel();

      const cancelResponse = await postApi(server.url, "/api/rerun/cancel", {
        id: "missing",
      });
      expect(cancelResponse.status).toBe(404);
      await expect(cancelResponse.json()).resolves.toMatchObject({
        ok: false,
        error: "No running job.",
      });

      const reloadResponse = await postApi(server.url, "/api/reload", {});
      expect(reloadResponse.status).toBe(200);
      await expect(reloadResponse.json()).resolves.toMatchObject({ ok: true });
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

      const rerunResponse = await postApi(server.url, "/api/rerun", {
        caseId: "case-1",
      });
      expect(rerunResponse.status).toBe(403);
      await expect(rerunResponse.json()).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining("Re-run is only available"),
      });
    } finally {
      await server.close();
    }
  });

  test("only accepts same-origin JSON posts for the process endpoints", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "vitest-evals-ui-"));
    await writeFile(join(assetsDir, "index.html"), "<main>spa</main>");
    const server = await serveReportWorkspace(workspace, {
      assetsDir,
      host: "127.0.0.1",
      port: 0,
      workspaceRoot: "/repo",
    });
    const rerunUrl = `${server.url}/api/rerun`;
    const body = JSON.stringify({ caseId: "case-1" });

    try {
      // A cross-site page can send text/plain without a CORS preflight.
      const simple = await fetch(rerunUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
      });
      expect(simple.status).toBe(415);

      const crossOrigin = await fetch(rerunUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body,
      });
      expect(crossOrigin.status).toBe(403);

      const get = await fetch(rerunUrl);
      expect(get.status).toBe(405);

      const tooLarge = await postApi(server.url, "/api/rerun", {
        caseId: "x".repeat(70_000),
      });
      expect(tooLarge.status).toBe(413);

      // DNS rebinding: a foreign name resolving to this loopback server.
      const rebound = await requestWithHost(
        `${server.url}/data/workspace.json`,
        "attacker.example",
      );
      expect(rebound).toBe(403);
    } finally {
      await server.close();
    }
  });

  test("disables re-run when bound to a non-loopback address", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "vitest-evals-ui-"));
    await writeFile(join(assetsDir, "index.html"), "<main>spa</main>");
    const server = await serveReportWorkspace(workspace, {
      assetsDir,
      host: "0.0.0.0",
      port: 0,
      workspaceRoot: "/repo",
    });
    try {
      const port = new URL(server.url).port;
      const meta = await fetch(`http://127.0.0.1:${port}/data/meta.json`);
      await expect(meta.json()).resolves.toMatchObject({
        rerunEnabled: false,
      });
      const rerun = await postApi(`http://127.0.0.1:${port}`, "/api/rerun", {
        caseId: "case-1",
      });
      expect(rerun.status).toBe(403);
    } finally {
      await server.close();
    }
  });

  test("returns 500 when asset reads fail", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "vitest-evals-ui-"));
    const assetPath = join(assetsDir, "locked.txt");
    await writeFile(assetPath, "secret");
    await chmod(assetPath, 0o000);

    const server = await serveReportWorkspace(workspace, {
      assetsDir,
      host: "127.0.0.1",
      port: 0,
    });

    try {
      const response = await fetch(`${server.url}/locked.txt`);
      expect(response.status).toBe(500);
      await expect(response.text()).resolves.toBe("Internal server error\n");
    } finally {
      await chmod(assetPath, 0o600);
      await server.close();
    }
  });
});

function postApi(baseUrl: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify(body),
  });
}

/** fetch() can't override Host, so send a raw request for rebinding checks. */
function requestWithHost(url: string, host: string) {
  return new Promise<number | undefined>((resolveStatus, rejectStatus) => {
    const request = httpRequest(url, { headers: { Host: host } }, (res) => {
      res.resume();
      resolveStatus(res.statusCode);
    });
    request.on("error", rejectStatus);
    request.end();
  });
}
