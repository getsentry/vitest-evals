import type { EvalCase, EvalReport } from "./types";
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

/** Options for rendering GitHub Actions summary markdown. */
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
const SCORE_DISTRIBUTION_BUCKETS = [
  "0-19%",
  "20-39%",
  "40-59%",
  "60-79%",
  "80-100%",
] as const;
const SCORE_DISTRIBUTION_BAR_WIDTH = 20;

/** Renders the GitHub Actions job summary markdown for an eval report. */
export function renderJobSummary(
  report: EvalReport,
  options: SummaryOptions = {},
) {
  const maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
  const failures = report.failures.slice(0, maxFailures);
  const nonEvalFailures = report.totals.failed - report.totals.evalFailed;
  const lines: string[] = [
    "# vitest-evals",
    "",
    ...renderSummaryTable(report, nonEvalFailures),
    "",
    ...renderScoreDistribution(report),
    "## Results",
    "",
  ];

  if (report.failures.length > 0) {
    lines.push("### Failures", "");
    failures.forEach((testCase, index) => {
      lines.push(...renderFailureDetails(testCase, index + 1, options), "");
    });

    if (report.failures.length > failures.length) {
      lines.push(
        `${report.failures.length - failures.length} more failures omitted from this summary.`,
        "",
      );
    }
  } else if (report.totals.evalTotal > 0) {
    lines.push("### Failures", "", "No eval failures.", "");
  }

  if (report.totals.evalTotal === 0) {
    lines.push("No eval metadata was found in the Vitest JSON report.", "");
  }

  return `${lines.join("\n")}\n`;
}

function formatCountLine(passed: number, failed: number, total: number) {
  return `${formatNumber(passed)} passed, ${formatNumber(failed)} failed, ${formatNumber(total)} total`;
}

function renderSummaryTable(report: EvalReport, nonEvalFailures: number) {
  const rows: Array<[string, string]> = [
    ["Status", report.status],
    [
      "Tests",
      formatCountLine(
        report.totals.passed,
        report.totals.failed,
        report.totals.total,
      ),
    ],
    [
      "Evals",
      formatCountLine(
        report.totals.evalPassed,
        report.totals.evalFailed,
        report.totals.evalTotal,
      ),
    ],
  ];

  if (report.score) {
    rows.push(["Score", formatScoreSummary(report.score)]);
  }

  if (nonEvalFailures > 0) {
    rows.push([
      "Other Failures",
      `${formatNumber(nonEvalFailures)} non-eval test failure${
        nonEvalFailures === 1 ? "" : "s"
      }`,
    ]);
  }

  rows.push(["Duration", formatDuration(report.durationMs)]);

  return [
    "| Metric | Value |",
    "| --- | --- |",
    ...rows.map(
      ([metric, value]) =>
        `| ${escapeTableCell(metric)} | ${escapeTableCell(value)} |`,
    ),
  ];
}

function formatScoreSummary(score: NonNullable<EvalReport["score"]>) {
  return `avg ${formatScore(score.average)}${
    score.minimum === undefined ? "" : `, min ${formatScore(score.minimum)}`
  }`;
}

function escapeTableCell(value: string) {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}

function renderScoreDistribution(report: EvalReport) {
  const scores = report.cases
    .map((testCase) => testCase.eval?.avgScore)
    .filter(
      (score): score is number =>
        typeof score === "number" && Number.isFinite(score),
    );
  if (scores.length === 0) {
    return [];
  }

  const counts = SCORE_DISTRIBUTION_BUCKETS.map(() => 0);
  for (const score of scores) {
    const bucket = Math.min(
      SCORE_DISTRIBUTION_BUCKETS.length - 1,
      Math.max(0, Math.floor(score * SCORE_DISTRIBUTION_BUCKETS.length)),
    );
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }

  const maxCount = Math.max(...counts);
  return [
    "Score distribution",
    "",
    "```text",
    ...SCORE_DISTRIBUTION_BUCKETS.map((label, index) =>
      formatScoreDistributionBucket(label, counts[index] ?? 0, maxCount),
    ),
    "```",
    "",
  ];
}

function formatScoreDistributionBucket(
  label: string,
  count: number,
  maxCount: number,
) {
  const barLength =
    count === 0
      ? 0
      : Math.max(
          1,
          Math.round((count / maxCount) * SCORE_DISTRIBUTION_BAR_WIDTH),
        );
  const bar = "#".repeat(barLength).padEnd(SCORE_DISTRIBUTION_BAR_WIDTH, " ");
  return `${label.padEnd(7)} | ${bar} ${formatNumber(count)}`;
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
    "```text",
    ...renderFailureBlock(testCase, {
      finalOutput,
      maxOutputChars,
      maxReasonChars,
      maxToolCalls,
      number,
      usage,
    }).map(escapeFence),
    "```",
    "",
    "</details>",
  ];
  return lines;
}

function renderFailureBlock(
  testCase: EvalCase,
  {
    finalOutput,
    maxOutputChars,
    maxReasonChars,
    maxToolCalls,
    number,
    usage,
  }: {
    finalOutput: unknown;
    maxOutputChars: number;
    maxReasonChars: number;
    maxToolCalls: number;
    number: number;
    usage: string;
  },
) {
  const failure = testCase.primaryFailure;
  const overviewRows: Array<[string, string]> = [
    ["Case", `${number}. ${testCase.displayName}`],
    ["Status", testCase.status],
    ["Location", formatLocation(testCase.displayFile, testCase.location)],
    ["Harness", testCase.harness?.name ?? "n/a"],
    ["Score", formatScore(failure?.score ?? testCase.eval?.avgScore)],
    ["Judge", failure?.judgeName ?? "n/a"],
  ];
  if (usage) {
    overviewRows.push(["Usage", usage]);
  }
  if (testCase.durationMs !== undefined) {
    overviewRows.push(["Duration", formatDuration(testCase.durationMs)]);
  }

  const lines = [
    ...renderAsciiSection("Result", renderKeyValues(overviewRows)),
    "",
  ];

  if (failure?.reason) {
    lines.push(
      ...renderAsciiSection(
        "Reason",
        truncate(failure.reason, maxReasonChars).split(/\r?\n/),
      ),
      "",
    );
  }

  if (testCase.eval?.scores.length) {
    lines.push(
      ...renderAsciiTable(
        ["Judge", "Score"],
        testCase.eval.scores.map((score) => [
          score.name ?? "Unknown",
          formatScore(score.score),
        ]),
      ),
      "",
    );
  }

  if (finalOutput !== undefined) {
    lines.push(
      ...renderAsciiSection(
        "Final Output",
        stringifyValue(finalOutput, maxOutputChars).split(/\r?\n/),
      ),
      "",
    );
  }

  if (testCase.harness?.toolCalls.length) {
    const toolCalls = testCase.harness.toolCalls.slice(0, maxToolCalls);
    lines.push(
      ...renderAsciiTable(
        ["Tool", "Status", "Duration"],
        toolCalls.map((toolCall) => [
          toolCall.name,
          toolCall.error ? `error: ${compactLine(toolCall.error, 120)}` : "ok",
          toolCall.durationMs === undefined
            ? "n/a"
            : formatDuration(toolCall.durationMs),
        ]),
      ),
    );
    if (testCase.harness.toolCalls.length > maxToolCalls) {
      lines.push(
        `${testCase.harness.toolCalls.length - maxToolCalls} more tool calls omitted`,
      );
    }
    lines.push("");
  }

  if (testCase.harness?.errors.length) {
    lines.push(
      ...renderAsciiSection(
        "Harness Errors",
        stringifyValue(testCase.harness.errors, maxReasonChars).split(/\r?\n/),
      ),
      "",
    );
  }

  while (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function renderAsciiSection(title: string, content: string[]) {
  return [title, "-".repeat(title.length), ...content];
}

function renderKeyValues(rows: Array<[string, string]>) {
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  return rows.map(
    ([label, value]) =>
      `${label.padEnd(labelWidth)}  ${compactLine(value, 500)}`,
  );
}

function renderAsciiTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const renderRow = (row: string[]) =>
    row
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join("  ")
      .trimEnd();

  return [
    renderRow(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(renderRow),
  ];
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
