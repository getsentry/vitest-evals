import type { EvalCase, EvalReport, UsageSummary } from "./types";
import {
  compactLine,
  escapeFence,
  escapeHtml,
  formatDuration,
  formatLocation,
  formatNumber,
  formatScore,
  stringifyValue,
  truncate,
} from "./utils";

export type SummaryOptions = {
  maxFailures?: number;
  maxReasonChars?: number;
  maxOutputChars?: number;
  maxToolCalls?: number;
};

const DEFAULT_MAX_FAILURES = 20;
const DEFAULT_MAX_REASON_CHARS = 8000;
const DEFAULT_MAX_OUTPUT_CHARS = 4000;
const DEFAULT_MAX_TOOL_CALLS = 20;

/** Renders the GitHub Actions job summary markdown for an eval report. */
export function renderJobSummary(
  report: EvalReport,
  options: SummaryOptions = {},
) {
  const maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
  const failures = report.failures.slice(0, maxFailures);
  const nonEvalFailures = report.totals.failed - report.totals.evalFailed;
  const lines: string[] = [
    "## vitest-evals",
    "",
    `Status: ${report.status}`,
    `Tests: ${formatCountLine(report.totals.passed, report.totals.failed, report.totals.total)}`,
    `Evals: ${formatCountLine(report.totals.evalPassed, report.totals.evalFailed, report.totals.evalTotal)}`,
  ];

  if (report.score) {
    lines.push(
      `Score: avg ${formatScore(report.score.average)}${
        report.score.minimum === undefined
          ? ""
          : `, min ${formatScore(report.score.minimum)}`
      }`,
    );
  }

  const usage = formatUsage(report.usage);
  if (usage) {
    lines.push(`Usage: ${usage}`);
  }
  if (nonEvalFailures > 0) {
    lines.push(
      `Other Failures: ${formatNumber(nonEvalFailures)} non-eval test failure${
        nonEvalFailures === 1 ? "" : "s"
      }`,
    );
  }

  lines.push(`Duration: ${formatDuration(report.durationMs)}`, "");

  if (report.totals.evalTotal === 0) {
    lines.push("No eval metadata was found in the Vitest JSON report.", "");
    return `${lines.join("\n")}\n`;
  }

  if (report.failures.length === 0) {
    lines.push("No eval failures.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Failures", "");
  failures.forEach((testCase, index) => {
    lines.push(...renderFailureIndexItem(testCase, index + 1), "");
  });

  if (report.failures.length > failures.length) {
    lines.push(
      `${report.failures.length - failures.length} more failures omitted from this summary.`,
      "",
    );
  }

  lines.push("### Details", "");
  failures.forEach((testCase, index) => {
    lines.push(...renderFailureDetails(testCase, index + 1, options), "");
  });

  return `${lines.join("\n")}\n`;
}

function formatCountLine(passed: number, failed: number, total: number) {
  return `${formatNumber(passed)} passed, ${formatNumber(failed)} failed, ${formatNumber(total)} total`;
}

function renderFailureIndexItem(testCase: EvalCase, number: number) {
  const failure = testCase.primaryFailure;
  const reason = compactLine(failure?.reason ?? "", 180);
  const lines = [
    `${number}. ${testCase.displayName}`,
    `   Score: ${formatScore(failure?.score ?? testCase.eval?.avgScore)}`,
    `   Judge: ${failure?.judgeName ?? "n/a"}`,
    `   Location: ${formatLocation(testCase.displayFile, testCase.location)}`,
  ];

  if (reason) {
    lines.push(`   Reason: ${reason}`);
  }

  return lines;
}

function renderFailureDetails(
  testCase: EvalCase,
  number: number,
  options: SummaryOptions,
) {
  const failure = testCase.primaryFailure;
  const maxReasonChars = options.maxReasonChars ?? DEFAULT_MAX_REASON_CHARS;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const maxToolCalls = options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const usage = formatCaseUsage(testCase);
  const finalOutput = testCase.eval?.output ?? testCase.harness?.output;
  const summary = `${number}. ${testCase.displayName} - ${
    failure?.judgeName ?? "failure"
  } - ${formatScore(failure?.score ?? testCase.eval?.avgScore)}`;
  const lines = [
    "<details>",
    `<summary>${escapeHtml(summary)}</summary>`,
    "",
    `Location: ${formatLocation(testCase.displayFile, testCase.location)}`,
    `Harness: ${testCase.harness?.name ?? "n/a"}`,
  ];

  if (usage) {
    lines.push(`Usage: ${usage}`);
  }
  if (testCase.durationMs !== undefined) {
    lines.push(`Duration: ${formatDuration(testCase.durationMs)}`);
  }

  lines.push("");

  if (failure?.reason) {
    lines.push(
      "Reason:",
      "",
      "```text",
      escapeFence(truncate(failure.reason, maxReasonChars)),
      "```",
      "",
    );
  }

  if (testCase.eval?.scores.length) {
    lines.push("Scores:");
    for (const score of testCase.eval.scores) {
      lines.push(
        `- ${score.name ?? "Unknown"}: ${formatScore(score.score ?? 0)}`,
      );
    }
    lines.push("");
  }

  if (finalOutput !== undefined) {
    lines.push(
      "Final:",
      "",
      "```text",
      escapeFence(stringifyValue(finalOutput, maxOutputChars)),
      "```",
      "",
    );
  }

  if (testCase.harness?.toolCalls.length) {
    lines.push("Tools:");
    for (const toolCall of testCase.harness.toolCalls.slice(0, maxToolCalls)) {
      const status = toolCall.error
        ? `error: ${compactLine(toolCall.error, 120)}`
        : "ok";
      const duration =
        toolCall.durationMs === undefined
          ? ""
          : `, ${formatDuration(toolCall.durationMs)}`;
      lines.push(`- ${toolCall.name}: ${status}${duration}`);
    }
    if (testCase.harness.toolCalls.length > maxToolCalls) {
      lines.push(
        `- ${testCase.harness.toolCalls.length - maxToolCalls} more tool calls omitted`,
      );
    }
    lines.push("");
  }

  if (testCase.harness?.errors.length) {
    lines.push(
      "Harness errors:",
      "",
      "```text",
      escapeFence(stringifyValue(testCase.harness.errors, maxReasonChars)),
      "```",
      "",
    );
  }

  lines.push("</details>");
  return lines;
}

function formatUsage(usage: Required<UsageSummary>) {
  const parts: string[] = [];
  if (usage.totalTokens > 0) {
    parts.push(`${formatNumber(usage.totalTokens)} tokens`);
  }
  if (usage.toolCalls > 0) {
    parts.push(
      `${formatNumber(usage.toolCalls)} tool${usage.toolCalls === 1 ? "" : "s"}`,
    );
  }
  if (usage.estimatedCost > 0) {
    parts.push(`$${usage.estimatedCost.toFixed(4)}`);
  }
  return parts.join(", ");
}

function formatCaseUsage(testCase: EvalCase) {
  const usage = testCase.harness?.usage;
  const parts: string[] = [];
  const totalTokens =
    usage?.totalTokens ??
    (usage?.inputTokens ?? 0) +
      (usage?.outputTokens ?? 0) +
      (usage?.reasoningTokens ?? 0);
  const toolCalls = usage?.toolCalls ?? testCase.harness?.toolCalls.length ?? 0;

  if (totalTokens > 0) {
    parts.push(`${formatNumber(totalTokens)} tokens`);
  }
  if (toolCalls > 0) {
    parts.push(`${formatNumber(toolCalls)} tool${toolCalls === 1 ? "" : "s"}`);
  }
  if (testCase.harness?.timingMs !== undefined) {
    parts.push(formatDuration(testCase.harness.timingMs));
  }

  return parts.join(", ");
}
