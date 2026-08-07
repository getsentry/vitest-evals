import { buildCheckAnnotations } from "./annotations";
import type { EvalGateResult } from "./gate";
import { type SummaryOptions, renderJobSummary } from "./summary";
import type { EvalReport } from "./types";

/** Options for creating or updating a GitHub Check Run. */
export type PublishCheckRunOptions = SummaryOptions & {
  token?: string;
  repository?: string;
  sha?: string;
  name?: string;
  apiUrl?: string;
  checkRunId?: number;
  maxAnnotations?: number;
  gate?: EvalGateResult;
};

/** Result of attempting to publish a GitHub Check Run. */
export type PublishCheckRunResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "created" | "updated";
      id?: number;
      htmlUrl?: string;
    };

const DEFAULT_CHECK_NAME = "vitest-evals";
const MAX_CHECK_SUMMARY_LENGTH = 64_000;
const CHECK_SUMMARY_TRUNCATION_SUFFIX =
  "\n\n[truncated for GitHub Check Run]\n";

/** Publishes the eval report to a GitHub Check Run when configuration allows it. */
export async function publishCheckRun(
  report: EvalReport,
  options: PublishCheckRunOptions = {},
): Promise<PublishCheckRunResult> {
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
  const sha = options.sha ?? process.env.GITHUB_SHA;

  if (!token) {
    return { status: "skipped", reason: "missing GITHUB_TOKEN" };
  }
  if (!repository) {
    return { status: "skipped", reason: "missing GITHUB_REPOSITORY" };
  }
  if (!sha && options.checkRunId === undefined) {
    return { status: "skipped", reason: "missing GITHUB_SHA" };
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    return {
      status: "skipped",
      reason: `invalid GitHub repository: ${repository}`,
    };
  }

  const payload = buildCheckRunPayload(report, options);
  const apiUrl =
    options.apiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
  const requestUrl =
    options.checkRunId === undefined
      ? `${apiUrl}/repos/${owner}/${repo}/check-runs`
      : `${apiUrl}/repos/${owner}/${repo}/check-runs/${options.checkRunId}`;
  const response = await fetch(requestUrl, {
    method: options.checkRunId === undefined ? "POST" : "PATCH",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify(
      options.checkRunId === undefined
        ? {
            name: options.name ?? DEFAULT_CHECK_NAME,
            head_sha: sha,
            ...payload,
          }
        : payload,
    ),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub Check Run request failed: ${response.status} ${response.statusText} ${text}`.trim(),
    );
  }

  const data = (await response.json()) as {
    id?: number;
    html_url?: string;
  };

  return {
    status: options.checkRunId === undefined ? "created" : "updated",
    id: data.id,
    htmlUrl: data.html_url,
  };
}

function buildCheckRunPayload(
  report: EvalReport,
  options: PublishCheckRunOptions,
) {
  const annotations = buildCheckAnnotations(report, {
    maxAnnotations: options.maxAnnotations,
  });
  // publishEvalReport always supplies a gate so title/conclusion stay policy-aware.
  const title = options.gate?.title ?? legacyCheckTitle(report);
  const conclusion =
    options.gate !== undefined
      ? options.gate.ok
        ? "success"
        : "failure"
      : report.status === "passed"
        ? "success"
        : "failure";

  return {
    status: "completed",
    conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title,
      summary: truncateCheckSummary(
        renderJobSummary(report, {
          ...options,
          maxFailures: options.maxFailures ?? 5,
          maxReasonChars: options.maxReasonChars ?? 4000,
          maxOutputChars: options.maxOutputChars ?? 2000,
          maxToolCalls: options.maxToolCalls ?? 10,
          gate: options.gate,
        }),
      ),
      annotations,
    },
  };
}

function legacyCheckTitle(report: EvalReport) {
  if (report.failures.length === 0 && report.status === "passed") {
    return "No eval failures";
  }
  if (report.failures.length === 0) {
    return "Vitest run failed";
  }
  return `${report.failures.length} eval failure${
    report.failures.length === 1 ? "" : "s"
  }`;
}

function truncateCheckSummary(summary: string) {
  if (summary.length <= MAX_CHECK_SUMMARY_LENGTH) {
    return summary;
  }

  return `${summary
    .slice(0, MAX_CHECK_SUMMARY_LENGTH - CHECK_SUMMARY_TRUNCATION_SUFFIX.length)
    .trimEnd()}${CHECK_SUMMARY_TRUNCATION_SUFFIX}`;
}
