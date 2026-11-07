import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { ReportWorkspace } from "@vitest-evals/core";
import { readReportWorkspace } from "@vitest-evals/core/node";
import {
  type HubEvent,
  type RerunApiResult,
  type RerunJobView,
  trimRerunLog,
} from "./app/rerun.js";
import { mergeRerunWorkspace, replaceRerunCase } from "./merge-workspace.js";
import {
  type PreparedRerun,
  type SpawnedVitest,
  prepareRerun,
  spawnVitest,
} from "./rerun-exec.js";

/** Finished jobs kept for the tray; older ones are dropped. */
const FINISHED_JOB_LIMIT = 20;

/** Fan-out for rerun jobs, live logs, and workspace updates after a job ends. */
export function createRerunHub(options: {
  workspaceRoot?: string;
  resultFiles: string[];
  getWorkspace: () => ReportWorkspace;
  setWorkspace: (workspace: ReportWorkspace) => void;
}) {
  const jobs = new Map<string, RerunJobView>();
  const children = new Map<string, SpawnedVitest>();
  const clients = new Set<ServerResponse>();
  // Workspace updates run one at a time so two finishing jobs can't race.
  let updates: Promise<unknown> = Promise.resolve();

  function emit(event: HubEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }

  function snapshot(job: RerunJobView): RerunJobView {
    return { ...job };
  }

  function updateWorkspace<T>(task: () => Promise<T>): Promise<T> {
    const next = updates.then(task, task);
    updates = next.catch(() => undefined);
    return next;
  }

  function pruneFinishedJobs() {
    const finished = [...jobs.values()].filter(
      (job) => job.status !== "running",
    );
    for (const job of finished.slice(0, -FINISHED_JOB_LIMIT)) {
      jobs.delete(job.id);
    }
  }

  async function startJob(body: unknown): Promise<RerunApiResult> {
    const prepared = await prepareRerun(
      body,
      options.getWorkspace(),
      options.workspaceRoot,
    );
    if (!prepared.ok) {
      return prepared;
    }

    const existing = [...jobs.values()].find(
      (job) => job.status === "running" && job.caseId === prepared.target.id,
    );
    if (existing) {
      return {
        ok: false,
        status: 409,
        error: "This case is already re-running.",
        job: snapshot(existing),
      };
    }

    const job: RerunJobView = {
      id: randomUUID(),
      caseId: prepared.target.id,
      title: prepared.label,
      command: prepared.command,
      status: "running",
      log: "",
      startedAt: Date.now(),
    };
    jobs.set(job.id, job);
    emit({ type: "job", job: snapshot(job) });

    void runJob(job, prepared);
    return { ok: true, status: 202, job: snapshot(job) };
  }

  async function runJob(job: RerunJobView, prepared: PreparedRerun) {
    const spawned = spawnVitest(prepared.args, prepared.cwd, (chunk) => {
      job.log = trimRerunLog(`${job.log}${chunk}`);
      emit({ type: "log", jobId: job.id, chunk });
    });
    children.set(job.id, spawned);
    const result = await spawned.done;
    children.delete(job.id);
    try {
      job.endedAt = Date.now();
      if (job.status === "cancelled") {
        return;
      }
      job.exitCode = result.exitCode;
      const merged = await updateWorkspace(() => mergeJobOutput(prepared));
      if (/No test files found/i.test(job.log)) {
        job.status = "err";
        job.error =
          "No test files found. The project include pattern may exclude this file.";
      } else if (!merged) {
        job.status = "err";
        job.error =
          result.error ?? "The re-run did not report this case. Check the log.";
      } else {
        // A failing case is still a finished re-run; its result is merged.
        job.status = result.exitCode === 0 ? "ok" : "err";
        job.error =
          result.exitCode === 0
            ? undefined
            : (result.error ?? `vitest exited ${result.exitCode}`);
      }
    } finally {
      await rm(prepared.outputFile, { force: true });
      pruneFinishedJobs();
      emit({ type: "job", job: snapshot(job) });
    }
  }

  async function mergeJobOutput(prepared: PreparedRerun) {
    let output: ReportWorkspace;
    try {
      output = (
        await readReportWorkspace([prepared.outputFile], {
          workspace: options.workspaceRoot,
        })
      ).workspace;
    } catch {
      return false;
    }
    // The JSON reporter also lists the file's filtered-out tests as skipped.
    const replacement = output.cases.find(
      (testCase) =>
        testCase.fullName === prepared.target.fullName &&
        resolve(prepared.cwd, testCase.file) === prepared.absFile,
    );
    if (!replacement) {
      return false;
    }
    options.setWorkspace(
      replaceRerunCase(options.getWorkspace(), prepared.target.id, replacement),
    );
    emit({ type: "dump" });
    return true;
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

  function reloadDump(): Promise<RerunApiResult> {
    return updateWorkspace(async () => {
      if (options.resultFiles.length === 0) {
        return { ok: true, status: 200 };
      }
      try {
        const next = await readReportWorkspace(options.resultFiles, {
          workspace: options.workspaceRoot,
        });
        options.setWorkspace(
          mergeRerunWorkspace(options.getWorkspace(), next.workspace),
        );
        emit({ type: "dump" });
        return { ok: true, status: 200 };
      } catch {
        return { ok: false, status: 500, error: "Could not reload dump." };
      }
    });
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
