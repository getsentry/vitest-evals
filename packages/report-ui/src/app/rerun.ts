/** Body posted to the local report server to re-run one eval case. */
export type RerunRequest = {
  file: string;
  title: string;
};

/** Result returned by POST /api/rerun. */
export type RerunApiResult = {
  ok: boolean;
  status?: number;
  error?: string;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

/** Builds the vitest -t pattern and display command for one case. */
export function rerunRequest(testCase: {
  file: string;
  title: string;
}): RerunRequest {
  return { file: testCase.file, title: testCase.title };
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

/** Posts one case to the local report server and returns the spawn result. */
export async function postRerun(testCase: {
  file: string;
  title: string;
}): Promise<RerunApiResult> {
  const response = await fetch("/api/rerun", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rerunRequest(testCase)),
  });
  const payload = (await response.json()) as RerunApiResult;
  return {
    ...payload,
    ok: response.ok && payload.ok,
    status: response.status,
  };
}
