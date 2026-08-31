import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
  type RerunApiResult,
  type RerunRequest,
  escapeRegExp,
  formatRerunCommand,
} from "./app/rerun.js";

const RERUN_TIMEOUT_MS = 10 * 60 * 1000;

/** Validates a rerun request and runs vitest for that one case. */
export async function executeRerun(
  body: unknown,
  workspaceRoot: string | undefined,
): Promise<RerunApiResult> {
  if (!workspaceRoot) {
    return {
      ok: false,
      status: 400,
      error: "No workspace root. Restart the report with --workspace.",
    };
  }

  const request = parseRerunBody(body);
  if (!request) {
    return {
      ok: false,
      status: 400,
      error: "Expected { file, title }.",
    };
  }

  const absFile = resolve(workspaceRoot, request.file);
  if (!isInsideWorkspace(absFile, workspaceRoot)) {
    return {
      ok: false,
      status: 400,
      error: "File is outside the workspace.",
    };
  }

  try {
    await access(absFile);
  } catch {
    return {
      ok: false,
      status: 400,
      error: "File not found.",
    };
  }

  const relFile = relative(workspaceRoot, absFile);
  const pattern = escapeRegExp(request.title);
  const command = formatRerunCommand({ file: relFile, title: request.title });
  const spawned = await spawnVitest(
    ["exec", "vitest", "run", relFile, "-t", pattern],
    workspaceRoot,
  );

  return {
    ok: spawned.exitCode === 0,
    status: spawned.exitCode === 0 ? 200 : 422,
    exitCode: spawned.exitCode,
    command,
    stdout: spawned.stdout,
    stderr: spawned.stderr,
    error:
      spawned.exitCode === 0
        ? undefined
        : spawned.stderr.trim() || `vitest exited ${spawned.exitCode}`,
  };
}

function parseRerunBody(body: unknown): RerunRequest | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const file = "file" in body ? body.file : undefined;
  const title = "title" in body ? body.title : undefined;
  if (typeof file !== "string" || file.length === 0) {
    return undefined;
  }
  if (typeof title !== "string" || title.length === 0) {
    return undefined;
  }
  return { file, title };
}

function isInsideWorkspace(filePath: string, workspaceRoot: string) {
  const root = resolve(workspaceRoot);
  return filePath === root || filePath.startsWith(`${root}${sep}`);
}

function spawnVitest(args: string[], cwd: string) {
  return new Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>((resolveSpawn) => {
    const child = spawn("pnpm", args, {
      cwd,
      env: process.env,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, RERUN_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveSpawn({
        exitCode: 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: error.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveSpawn({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}
