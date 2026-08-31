/** Body posted to the local report server to re-run one eval case. */
export type RerunRequest = {
  file: string;
  title: string;
  label?: string;
};

/** Live job shown in the report task tray. */
export type RerunJobView = {
  id: string;
  title: string;
  command: string;
  status: "running" | "ok" | "err" | "cancelled";
  log: string;
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
  return `pnpm exec vitest run ${shellQuote(request.file)} -t ${shellQuote(escapeRegExp(request.title))}`;
}

/** Escapes a case title so vitest `-t` matches it literally. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
