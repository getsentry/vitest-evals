import { readFileSync } from "node:fs";
import { buildCheckAnnotations } from "./annotations";
import { type EvalGateResult, evaluateEvalGate } from "./gate";
import { type SummaryOptions, renderJobSummary } from "./summary";
import type { EvalReport } from "./types";

/** Options for creating or updating a GitHub Check Run. */
export type PublishCheckRunOptions = SummaryOptions & {
  token?: string;
  repository?: string;
  sha?: string;
  name?: string;
  apiUrl?: string;
  detailsUrl?: string;
  externalId?: string;
  checkRunId?: number;
  maxAnnotations?: number;
  /**
   * Suite gate decision. When omitted, the report is evaluated with the
   * default advisory policy so title/conclusion stay consistent.
   */
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
      sha?: string;
    };

const DEFAULT_CHECK_NAME = "vitest-evals";
const MAX_CHECK_SUMMARY_LENGTH = 64_000;
const CHECK_SUMMARY_TRUNCATION_SUFFIX =
  "\n\n[truncated for GitHub Check Run]\n";

/**
 * Resolve the commit SHA a Check Run should attach to.
 *
 * On `pull_request`, `GITHUB_SHA` is the temporary merge commit. PR status and
 * required checks attach to the head commit, so prefer an explicit head SHA
 * (option/env or `pull_request.head.sha` from the event payload) first.
 */
export function resolveCheckSha(
  env: NodeJS.ProcessEnv = process.env,
  options: { sha?: string; eventPath?: string } = {},
): string | undefined {
  const explicit = options.sha?.trim() || env.GITHUB_PR_HEAD_SHA?.trim();
  if (explicit) {
    return explicit;
  }

  const eventPath = options.eventPath?.trim() || env.GITHUB_EVENT_PATH?.trim();
  if (eventPath) {
    try {
      const event = JSON.parse(readFileSync(eventPath, "utf8")) as {
        pull_request?: { head?: { sha?: unknown } };
      };
      const headSha = event.pull_request?.head?.sha;
      if (typeof headSha === "string" && headSha.trim()) {
        return headSha.trim();
      }
    } catch {
      // Fall through to GITHUB_SHA when the event payload is unavailable.
    }
  }

  return env.GITHUB_SHA?.trim() || undefined;
}

/**
 * Build a Check Run details URL that points back at the current workflow job
 * (or run) when GitHub Actions env is present.
 */
export function resolveCheckDetailsUrl(
  env: NodeJS.ProcessEnv = process.env,
  options: { detailsUrl?: string } = {},
): string | undefined {
  const explicit = options.detailsUrl?.trim();
  if (explicit) {
    return explicit;
  }

  const server = env.GITHUB_SERVER_URL?.replace(/\/$/, "");
  const repository = env.GITHUB_REPOSITORY?.trim();
  const runId = env.GITHUB_RUN_ID?.trim();
  if (!server || !repository || !runId) {
    return undefined;
  }

  const jobId = env.GITHUB_JOB?.trim();
  // GITHUB_JOB is the job id/key, not the numeric job database id, so link the
  // run page. Consumers can override with an explicit details URL when needed.
  return `${server}/${repository}/actions/runs/${runId}${jobId ? `#${jobId}` : ""}`;
}

/** Publishes the eval report to a GitHub Check Run when configuration allows it. */
export async function publishCheckRun(
  report: EvalReport,
  options: PublishCheckRunOptions = {},
): Promise<PublishCheckRunResult> {
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
  const sha = resolveCheckSha(process.env, { sha: options.sha });
  const detailsUrl = resolveCheckDetailsUrl(process.env, {
    detailsUrl: options.detailsUrl,
  });

  if (!token) {
    return { status: "skipped", reason: "missing GITHUB_TOKEN" };
  }
  if (!repository) {
    return { status: "skipped", reason: "missing GITHUB_REPOSITORY" };
  }
  if (!sha && options.checkRunId === undefined) {
    return {
      status: "skipped",
      reason:
        "missing commit SHA (set --sha / options.sha, GITHUB_PR_HEAD_SHA, pull_request.head.sha, or GITHUB_SHA)",
    };
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    return {
      status: "skipped",
      reason: `invalid GitHub repository: ${repository}`,
    };
  }

  const payload = buildCheckRunPayload(report, options, detailsUrl);
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
            ...(options.externalId ? { external_id: options.externalId } : {}),
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
    sha,
  };
}

function buildCheckRunPayload(
  report: EvalReport,
  options: PublishCheckRunOptions,
  detailsUrl?: string,
) {
  const gate = options.gate ?? evaluateEvalGate(report);
  const annotations = buildCheckAnnotations(report, {
    maxAnnotations: options.maxAnnotations,
    gate,
  });

  return {
    status: "completed",
    conclusion: gate.ok ? "success" : "failure",
    completed_at: new Date().toISOString(),
    ...(detailsUrl ? { details_url: detailsUrl } : {}),
    output: {
      title: gate.title,
      summary: truncateCheckSummary(
        renderJobSummary(report, {
          ...options,
          maxFailures: options.maxFailures ?? 5,
          maxReasonChars: options.maxReasonChars ?? 4000,
          maxOutputChars: options.maxOutputChars ?? 2000,
          maxToolCalls: options.maxToolCalls ?? 10,
          gate,
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

  return `${summary
    .slice(0, MAX_CHECK_SUMMARY_LENGTH - CHECK_SUMMARY_TRUNCATION_SUFFIX.length)
    .trimEnd()}${CHECK_SUMMARY_TRUNCATION_SUFFIX}`;
}
