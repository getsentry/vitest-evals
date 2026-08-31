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
const KILL_ESCALATE_MS = 2_000;

export type PreparedRerun = {
  ok: true;
  args: string[];
  command: string;
  cwd: string;
  label: string;
  title: string;
};

export type SpawnedVitest = {
  kill: () => void;
  done: Promise<{ exitCode: number; error?: string }>;
};

/** Validates a rerun request and returns the spawn plan, or an HTTP error. */
export async function prepareRerun(
  body: unknown,
  workspaceRoot: string | undefined,
): Promise<PreparedRerun | RerunApiResult> {
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
  return {
    ok: true,
    args: ["exec", "vitest", "run", relFile, "-t", pattern],
    command: formatRerunCommand({ file: relFile, title: request.title }),
    cwd: workspaceRoot,
    label: request.label ?? request.title,
    title: request.title,
  };
}

/** Runs `pnpm exec vitest` and streams stdout/stderr chunks. */
export function spawnVitest(
  args: string[],
  cwd: string,
  onChunk: (chunk: string) => void,
): SpawnedVitest {
  const child = spawn("pnpm", args, {
    cwd,
    env: process.env,
  });
  let escalate: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    kill();
  }, RERUN_TIMEOUT_MS);

  const done = new Promise<{ exitCode: number; error?: string }>(
    (resolveSpawn) => {
      child.stdout.on("data", (chunk) => {
        onChunk(String(chunk));
      });
      child.stderr.on("data", (chunk) => {
        onChunk(String(chunk));
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        if (escalate) {
          clearTimeout(escalate);
        }
        onChunk(error.message);
        resolveSpawn({ exitCode: 1, error: error.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (escalate) {
          clearTimeout(escalate);
        }
        resolveSpawn({ exitCode: code ?? 1 });
      });
    },
  );

  function kill() {
    if (child.exitCode !== null || child.signalCode) {
      return;
    }
    child.kill("SIGTERM");
    escalate = setTimeout(() => {
      if (child.exitCode === null && !child.signalCode) {
        child.kill("SIGKILL");
      }
    }, KILL_ESCALATE_MS);
  }

  return { kill, done };
}

function parseRerunBody(body: unknown): RerunRequest | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const file = "file" in body ? body.file : undefined;
  const title = "title" in body ? body.title : undefined;
  const label = "label" in body ? body.label : undefined;
  if (typeof file !== "string" || file.length === 0) {
    return undefined;
  }
  if (typeof title !== "string" || title.length === 0) {
    return undefined;
  }
  return {
    file,
    title,
    label: typeof label === "string" && label.length > 0 ? label : undefined,
  };
}

function isInsideWorkspace(filePath: string, workspaceRoot: string) {
  const root = resolve(workspaceRoot);
  return filePath === root || filePath.startsWith(`${root}${sep}`);
}
