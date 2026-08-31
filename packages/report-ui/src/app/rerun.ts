/** Body posted to the local report server to re-run one eval case. */
export type RerunRequest = {
  file: string;
  title: string;
  label?: string;
  config?: string;
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

/** Live job shown in the report task tray. */
export type RerunJobView = {
  id: string;
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

/** Result returned by POST /api/rerun. */
export type RerunApiResult = {
  ok: boolean;
  status?: number;
  error?: string;
  command?: string;
  job?: RerunJobView;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

/** Builds the vitest -t pattern and display command for one case. */
export function rerunRequest(testCase: {
  file: string;
  title: string;
  displayName?: string;
}): RerunRequest {
  return {
    file: testCase.file,
    title: testCase.title,
    label: testCase.displayName,
  };
}

/** Shell-quoted `pnpm exec vitest run <file> -t <title>` for copy/display. */
export function formatRerunCommand(request: RerunRequest): string {
  const parts = [
    "pnpm exec vitest run",
    shellQuote(request.file),
    "-t",
    shellQuote(escapeRegExp(request.title)),
  ];
  const config =
    request.config ??
    (looksLikeEvalFile(request.file) ? EVAL_VITEST_CONFIGS[0] : undefined);
  if (config) {
    parts.push("--config", shellQuote(config));
  }
  return parts.join(" ");
}

/** Escapes a case title so vitest `-t` matches it literally. */
export function escapeRegExp(value: string): string {
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
  testCase: { displayName: string; title: string },
): RerunJobView | undefined {
  return jobs.find(
    (job) =>
      job.status === "running" &&
      (job.title === testCase.displayName || job.title === testCase.title),
  );
}

/** Quotes a value for POSIX shells. */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Starts one case on the local report server. Logs stream over /api/events. */
export async function postRerun(testCase: {
  file: string;
  title: string;
  displayName?: string;
}): Promise<RerunApiResult> {
  return postJson("/api/rerun", rerunRequest(testCase));
}

/** Asks the report server to SIGTERM the in-flight vitest for one job. */
export async function postCancel(jobId: string): Promise<RerunApiResult> {
  return postJson("/api/rerun/cancel", { id: jobId });
}

/** Re-reads the dump files. The ledger updates when the server emits `dump`. */
export async function postReload(): Promise<RerunApiResult> {
  return postJson("/api/reload", {});
}

async function postJson(path: string, body: unknown): Promise<RerunApiResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as RerunApiResult;
  return {
    ...payload,
    ok: response.ok && payload.ok,
    status: response.status,
  };
}
