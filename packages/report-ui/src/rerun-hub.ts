import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { ReportWorkspace } from "@vitest-evals/core";
import { readReportWorkspace } from "@vitest-evals/core/node";
import type { HubEvent, RerunApiResult, RerunJobView } from "./app/rerun.js";
import { mergeRerunWorkspace } from "./merge-workspace.js";
import { type SpawnedVitest, prepareRerun, spawnVitest } from "./rerun-exec.js";

const LOG_LIMIT = 32_768;

/** Fan-out for rerun jobs, live logs, and dump reloads after a job ends. */
export function createRerunHub(options: {
  workspaceRoot?: string;
  resultFiles: string[];
  getWorkspace: () => ReportWorkspace;
  setWorkspace: (workspace: ReportWorkspace) => void;
}) {
  const jobs = new Map<string, RerunJobView>();
  const children = new Map<string, SpawnedVitest>();
  const clients = new Set<ServerResponse>();

  function emit(event: HubEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }

  function snapshot(job: RerunJobView): RerunJobView {
    return { ...job };
  }

  async function startJob(body: unknown) {
    const prepared = await prepareRerun(body, options.workspaceRoot);
    if (!prepared.ok || !("args" in prepared)) {
      return prepared;
    }

    const job: RerunJobView = {
      id: randomUUID(),
      title: prepared.label,
      command: prepared.command,
      status: "running",
      log: "",
      startedAt: Date.now(),
    };
    jobs.set(job.id, job);
    emit({ type: "job", job: snapshot(job) });

    void runJob(job, prepared.args, prepared.cwd);
    return { ok: true as const, status: 202, job: snapshot(job) };
  }

  async function runJob(job: RerunJobView, args: string[], cwd: string) {
    const spawned = spawnVitest(args, cwd, (chunk) => {
      job.log = trimLog(`${job.log}${chunk}`);
      emit({ type: "log", jobId: job.id, chunk });
    });
    children.set(job.id, spawned);
    const result = await spawned.done;
    children.delete(job.id);
    job.endedAt = Date.now();
    if (job.status === "cancelled") {
      emit({ type: "job", job: snapshot(job) });
      return;
    }
    const noTests = /No test files found/i.test(job.log);
    job.status = result.exitCode === 0 && !noTests ? "ok" : "err";
    job.exitCode = result.exitCode;
    job.error = noTests
      ? "No test files found. The project include pattern may exclude this file."
      : result.exitCode === 0
        ? undefined
        : result.error || `vitest exited ${result.exitCode}`;
    emit({ type: "job", job: snapshot(job) });
    await reloadDump();
  }

  function cancelJob(body: unknown): RerunApiResult {
    const id =
      body &&
      typeof body === "object" &&
      "id" in body &&
      typeof body.id === "string"
        ? body.id
        : undefined;
    if (!id) {
      return { ok: false, status: 400, error: "Expected { id }." };
    }
    const job = jobs.get(id);
    if (!job || job.status !== "running") {
      return { ok: false, status: 404, error: "No running job." };
    }
    job.status = "cancelled";
    job.endedAt = Date.now();
    job.error = "Cancelled";
    children.get(id)?.kill();
    emit({ type: "job", job: snapshot(job) });
    return { ok: true, status: 200, job: snapshot(job) };
  }

  async function reloadDump() {
    if (options.resultFiles.length === 0) {
      return { ok: true as const, status: 200 };
    }
    try {
      const next = await readReportWorkspace(options.resultFiles, {
        workspace: options.workspaceRoot,
      });
      options.setWorkspace(
        mergeRerunWorkspace(options.getWorkspace(), next.workspace),
      );
      emit({ type: "dump" });
      return { ok: true as const, status: 200 };
    } catch {
      return {
        ok: false as const,
        status: 500,
        error: "Could not reload dump.",
      };
    }
  }

  function subscribe(response: ServerResponse) {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    response.write(
      `data: ${JSON.stringify({ type: "hello", jobs: [...jobs.values()].map(snapshot) })}\n\n`,
    );
    clients.add(response);
    response.on("close", () => {
      clients.delete(response);
    });
  }

  function close() {
    for (const [id, spawned] of children) {
      const job = jobs.get(id);
      if (job && job.status === "running") {
        job.status = "cancelled";
        job.endedAt = Date.now();
        job.error = "Server closed";
      }
      spawned.kill();
    }
    children.clear();
    for (const client of clients) {
      client.end();
    }
    clients.clear();
  }

  return { startJob, cancelJob, reloadDump, subscribe, close };
}

function trimLog(value: string) {
  if (value.length <= LOG_LIMIT) {
    return value;
  }
  return value.slice(value.length - LOG_LIMIT);
}
