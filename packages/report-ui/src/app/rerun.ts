import { relativeDisplayPath } from "./display-path";

/** Body posted to the local report server to re-run one eval case. */
type RerunRequest = {
  caseId: string;
};

/** Workspace-root vitest configs used for `*.eval(s).ts` files. */
export const EVAL_VITEST_CONFIGS = [
  "vitest.evals.config.ts",
  "vitest.evals.config.mts",
  "vitest.evals.config.js",
  "vitest.eval.config.ts",
] as const;

/** True when the file is an eval suite, not a default unit-test include. */
export function looksLikeEvalFile(file: string): boolean {
  return /(?:^|\/)__eval__\/|\.evals?\.[cm]?[jt]sx?$/.test(file);
}

/** Most recent rerun output kept per job, on the server and in the tray. */
const RERUN_LOG_LIMIT = 32_768;

/** Keeps the tail of a rerun log within RERUN_LOG_LIMIT. */
export function trimRerunLog(value: string): string {
  return value.length <= RERUN_LOG_LIMIT
    ? value
    : value.slice(value.length - RERUN_LOG_LIMIT);
}

/** Live job shown in the report task tray. */
export type RerunJobView = {
  id: string;
  caseId: string;
  title: string;
  command: string;
  status: "running" | "ok" | "err" | "cancelled";
  log: string;
  startedAt: number;
  endedAt?: number;
  error?: string;
  exitCode?: number;
};

/** SSE payloads from GET /api/events. */
export type HubEvent =
  | { type: "hello"; jobs: RerunJobView[] }
  | { type: "job"; job: RerunJobView }
  | { type: "log"; jobId: string; chunk: string }
  | { type: "dump" };

/** Result returned by the POST /api/* endpoints. */
export type RerunApiResult =
  | { ok: true; status: number; job?: RerunJobView }
  | { ok: false; status: number; error: string; job?: RerunJobView };

/** Inputs shared by the spawned rerun and its copyable preview. */
type RerunCommand = {
  file: string;
  testNamePattern: string;
  config?: string;
};

/**
 * Anchored vitest `--testNamePattern` for one case. Vitest matches the
 * pattern against `describe > test` names, so anchoring keeps
 * `returns weather` from also running `returns weather for Paris`.
 */
export function rerunTestNamePattern(testCase: {
  ancestorTitles: string[];
  title: string;
}): string {
  return `^${escapeRegExp([...testCase.ancestorTitles, testCase.title].join(" > "))}$`;
}

/** Shell-quoted `vitest run` command for copy/display. */
export function formatRerunCommand(command: RerunCommand): string {
  const parts = [
    "vitest run",
    shellQuote(command.file),
    `--testNamePattern=${shellQuote(command.testNamePattern)}`,
  ];
  if (command.config) {
    parts.push("--config", shellQuote(command.config));
  }
  return parts.join(" ");
}

/** The command the report server will run, built from the served meta. */
export function previewRerunCommand(
  testCase: {
    file: string;
    displayFile?: string;
    ancestorTitles: string[];
    title: string;
  },
  meta: { workspaceRoot?: string; evalConfig?: string },
): string {
  const file = rerunPreviewFile(testCase, meta.workspaceRoot);
  return formatRerunCommand({
    file,
    testNamePattern: rerunTestNamePattern(testCase),
    config: looksLikeEvalFile(file) ? meta.evalConfig : undefined,
  });
}

// Mirrors the server's resolveCaseFile: a report from another checkout (CI)
// has a `file` outside this workspace, so the server runs `displayFile`.
function rerunPreviewFile(
  testCase: { file: string; displayFile?: string },
  workspaceRoot: string | undefined,
) {
  const relative = relativeDisplayPath(testCase.file, workspaceRoot);
  const outsideWorkspace =
    relative === testCase.file && /^(?:\/|[A-Za-z]:[\\/])/.test(relative);
  return outsideWorkspace && testCase.displayFile
    ? testCase.displayFile
    : relative;
}

/** Escapes a case title so vitest `-t` matches it literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Elapsed clock for a running or finished job. */
export function jobElapsedMs(job: RerunJobView, now: number): number {
  const end = job.status === "running" ? now : (job.endedAt ?? now);
  return Math.max(0, end - job.startedAt);
}

/** Short clock like `12s` or `1m 04s`. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return seconds > 0 || minutes > 0
      ? `${hours}h ${String(minutes).padStart(2, "0")}m`
      : `${hours}h`;
  }
  return seconds > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${minutes}m`;
}

/** The in-flight rerun for this case, if any. */
export function runningJobForCase(
  jobs: RerunJobView[],
  testCase: { id: string },
): RerunJobView | undefined {
  return jobs.find(
    (job) => job.status === "running" && job.caseId === testCase.id,
  );
}

/** Quotes a value for POSIX shells. */
function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Starts one case on the local report server. Logs stream over /api/events. */
export async function postRerun(testCase: {
  id: string;
}): Promise<RerunApiResult> {
  const request: RerunRequest = { caseId: testCase.id };
  return postJson("/api/rerun", request);
}

/** Asks the report server to stop the in-flight vitest for one job. */
export async function postCancel(jobId: string): Promise<RerunApiResult> {
  return postJson("/api/rerun/cancel", { id: jobId });
}

/** Re-reads the dump files. The ledger updates when the server emits `dump`. */
export async function postReload(): Promise<RerunApiResult> {
  return postJson("/api/reload", {});
}

async function postJson(path: string, body: unknown): Promise<RerunApiResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "The report server is not reachable.",
    };
  }
  const payload = await response.json().catch(() => undefined);
  if (!isApiPayload(payload)) {
    return {
      ok: false,
      status: response.status,
      error: `The report server answered ${response.status}.`,
    };
  }
  if (!response.ok || !payload.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload.error ?? `The report server answered ${response.status}.`,
      job: payload.job,
    };
  }
  return { ok: true, status: response.status, job: payload.job };
}

function isApiPayload(
  value: unknown,
): value is { ok: boolean; error?: string; job?: RerunJobView } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}
