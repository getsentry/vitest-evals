import { buildCheckAnnotations } from "./annotations";
import { renderJobSummary, type SummaryOptions } from "./summary";
import type { EvalReport } from "./types";

export type PublishCheckRunOptions = SummaryOptions & {
  token?: string;
  repository?: string;
  sha?: string;
  name?: string;
  apiUrl?: string;
  checkRunId?: number;
  maxAnnotations?: number;
};

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
  const title =
    report.failures.length === 0 && report.status === "passed"
      ? "No eval failures"
      : report.failures.length === 0
        ? "Vitest run failed"
        : `${report.failures.length} eval failure${
            report.failures.length === 1 ? "" : "s"
          }`;

  return {
    status: "completed",
    conclusion: report.status === "passed" ? "success" : "failure",
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
        }),
      ),
      annotations,
    },
  };
}

function truncateCheckSummary(summary: string) {
  if (summary.length <= MAX_CHECK_SUMMARY_LENGTH) {
    return summary;
  }

  return `${summary.slice(0, MAX_CHECK_SUMMARY_LENGTH - 34).trimEnd()}\n\n[truncated for GitHub Check Run]\n`;
}
