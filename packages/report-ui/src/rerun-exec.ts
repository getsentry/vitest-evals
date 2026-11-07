import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ReportCase, ReportWorkspace } from "@vitest-evals/core";
import {
  EVAL_VITEST_CONFIGS,
  type RerunApiResult,
  formatRerunCommand,
  looksLikeEvalFile,
  rerunTestNamePattern,
} from "./app/rerun.js";

const RERUN_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_ESCALATE_MS = 2_000;

/** Spawn plan for one rerun, built only from cases already in the report. */
export type PreparedRerun = {
  ok: true;
  args: string[];
  command: string;
  cwd: string;
  label: string;
  target: ReportCase;
  /** Absolute path of the case file, used to find it in the rerun output. */
  absFile: string;
  /** Temporary JSON report the rerun writes; read and deleted afterwards. */
  outputFile: string;
};

export type SpawnedVitest = {
  kill: () => void;
  done: Promise<{ exitCode: number; error?: string }>;
};

type RerunError = Extract<RerunApiResult, { ok: false }>;

/**
 * Validates a `{ caseId }` rerun request against the served report and
 * returns the spawn plan. The file and test name come from the report, never
 * from the request, so a caller can only re-run a case the report contains.
 */
export async function prepareRerun(
  body: unknown,
  workspace: ReportWorkspace,
  workspaceRoot: string | undefined,
): Promise<PreparedRerun | RerunError> {
  if (!workspaceRoot) {
    return {
      ok: false,
      status: 400,
      error: "No workspace root. Restart the report with --workspace.",
    };
  }

  const caseId = parseCaseId(body);
  if (!caseId) {
    return { ok: false, status: 400, error: "Expected { caseId }." };
  }

  const target = workspace.cases.find((testCase) => testCase.id === caseId);
  if (!target) {
    return { ok: false, status: 404, error: "Case not found in the report." };
  }

  const absFile = await resolveCaseFile(target, workspaceRoot);
  if (!absFile) {
    return {
      ok: false,
      status: 400,
      error: "The case file is not inside the workspace.",
    };
  }

  const vitestBin = resolveVitestBin(workspaceRoot);
  if (!vitestBin) {
    return {
      ok: false,
      status: 400,
      error: "Could not find vitest in the workspace. Install it first.",
    };
  }

  const relFile = relative(workspaceRoot, absFile);
  const testNamePattern = rerunTestNamePattern(target);
  const config = looksLikeEvalFile(relFile)
    ? await findEvalConfig(workspaceRoot)
    : undefined;
  const outputFile = join(tmpdir(), `vitest-evals-rerun-${randomUUID()}.json`);
  const args = [
    vitestBin,
    "run",
    relFile,
    `--testNamePattern=${testNamePattern}`,
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${outputFile}`,
  ];
  if (config) {
    args.push(`--config=${config}`);
  }
  return {
    ok: true,
    args,
    command: formatRerunCommand({ file: relFile, testNamePattern, config }),
    cwd: workspaceRoot,
    label: target.displayName,
    target,
    absFile,
    outputFile,
  };
}

/** Returns the first eval vitest config present at the workspace root. */
export async function findEvalConfig(workspaceRoot: string) {
  for (const name of EVAL_VITEST_CONFIGS) {
    try {
      await access(join(workspaceRoot, name));
      return name;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

/**
 * Runs the workspace's own vitest under the current node binary and streams
 * stdout/stderr chunks. Running it directly avoids depending on a package
 * manager being on PATH, and the process group lets kill() stop workers too.
 */
export function spawnVitest(
  args: string[],
  cwd: string,
  onChunk: (chunk: string) => void,
): SpawnedVitest {
  const ownGroup = process.platform !== "win32";
  const child = spawn(process.execPath, args, {
    cwd,
    detached: ownGroup,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
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
      const finish = (result: { exitCode: number; error?: string }) => {
        clearTimeout(timer);
        if (escalate) {
          clearTimeout(escalate);
        }
        resolveSpawn(result);
      };
      child.on("error", (error) => {
        onChunk(error.message);
        finish({ exitCode: 1, error: error.message });
      });
      // `exit`, not `close`: orphaned grandchildren can hold the pipes open.
      child.on("exit", (code) => {
        finish({ exitCode: code ?? 1 });
      });
    },
  );

  function signal(name: NodeJS.Signals) {
    if (ownGroup && child.pid) {
      try {
        process.kill(-child.pid, name);
        return;
      } catch {
        // The group is already gone; fall back to the direct child.
      }
    }
    child.kill(name);
  }

  function kill() {
    if (child.exitCode !== null || child.signalCode) {
      return;
    }
    signal("SIGTERM");
    escalate = setTimeout(() => {
      signal("SIGKILL");
    }, KILL_ESCALATE_MS);
  }

  return { kill, done };
}

function parseCaseId(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("caseId" in body)) {
    return undefined;
  }
  return typeof body.caseId === "string" && body.caseId.length > 0
    ? body.caseId
    : undefined;
}

async function resolveCaseFile(testCase: ReportCase, workspaceRoot: string) {
  // CI reports carry the CI checkout path; displayFile is workspace-relative.
  for (const candidate of [testCase.file, testCase.displayFile]) {
    const absFile = resolve(workspaceRoot, candidate);
    if (!isInsideWorkspace(absFile, workspaceRoot)) {
      continue;
    }
    try {
      await access(absFile);
      return absFile;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

function resolveVitestBin(workspaceRoot: string) {
  try {
    const requireFromRoot = createRequire(join(workspaceRoot, "package.json"));
    return join(
      dirname(requireFromRoot.resolve("vitest/package.json")),
      "vitest.mjs",
    );
  } catch {
    return undefined;
  }
}

function isInsideWorkspace(filePath: string, workspaceRoot: string) {
  return filePath.startsWith(`${resolve(workspaceRoot)}${sep}`);
}
