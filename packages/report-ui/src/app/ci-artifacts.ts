import type { ReportCase, ReportWorkspace } from "@vitest-evals/core";
import { formatSignedScore, formatSignedUsd, workspaceDelta } from "./compare";
import {
  formatDuration,
  formatNumber,
  formatScore,
  summarizeWorkspace,
} from "./model";
import { type PricingTable, estimateWorkspaceCost, formatUsd } from "./pricing";

/** Writes a JUnit XML document for CI systems that consume xUnit reports. */
export function formatJunitXml(workspace: ReportWorkspace): string {
  const summary = summarizeWorkspace(workspace);
  const suites = workspace.runs.map((run) => {
    const cases = workspace.cases.filter(
      (testCase) => testCase.runId === run.id,
    );
    const failures = cases.filter((testCase) => testCase.status === "failed");
    const body = cases.map((testCase) => formatJunitCase(testCase)).join("\n");
    return [
      `  <testsuite name="${escapeXml(run.source ?? run.id)}" tests="${cases.length}" failures="${failures.length}" time="${seconds(run.durationMs)}">`,
      body,
      "  </testsuite>",
    ].join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="vitest-evals" tests="${summary.caseCount}" failures="${summary.failed}" time="${seconds(summary.durationMs)}">`,
    ...suites,
    "</testsuites>",
    "",
  ].join("\n");
}

/** Writes a pull-request comment body from the collected workspace. */
export function formatPullRequestComment(
  workspace: ReportWorkspace,
  pricing?: PricingTable,
): string {
  const summary = summarizeWorkspace(workspace);
  const cost = estimateWorkspaceCost(
    workspace.cases.map((testCase) => testCase.harness?.run?.usage ?? {}),
    pricing ?? { source: "none", sources: [], models: [] },
  );
  const delta = workspaceDelta(workspace, pricing);
  const executed = summary.passed + summary.failed;
  const passRate =
    executed === 0
      ? "n/a"
      : `${Math.round((summary.passed / executed) * 100)}%`;
  const failures = workspace.cases.filter(
    (testCase) => testCase.status === "failed",
  );
  const lines = [
    "## vitest-evals",
    "",
    "| | |",
    "| --- | --- |",
    `| Pass rate | ${passRate} |`,
    `| Cases | ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped |`,
    `| Avg score | ${formatScore(summary.averageScore)} |`,
    `| Runtime | ${formatDuration(summary.durationMs)} |`,
    `| Tokens | ${formatNumber(summary.totalTokens)} |`,
    `| Est. cost | ${formatUsd(cost)} |`,
  ];
  if (delta) {
    lines.push(
      `| vs previous | ${formatSignedScore(delta.passRate)} pass · ${formatSignedScore(delta.averageScore)} score · ${formatSignedUsd(delta.costUsd)} (${delta.matchedCases} matched) |`,
    );
  }
  lines.push("", "### Failures", "");
  if (failures.length === 0) {
    lines.push("No eval failures.", "");
  } else {
    for (const testCase of failures.slice(0, 20)) {
      const score = formatScore(testCase.eval?.avgScore);
      const firstFailure = testCase.failureMessages[0]?.split("\n")[0] ?? "";
      lines.push(
        `- **${testCase.displayName}** (${score}) — \`${testCase.displayFile}\`${firstFailure ? ` — ${firstFailure}` : ""}`,
      );
    }
    if (failures.length > 20) {
      lines.push("", `${failures.length - 20} more failure(s) omitted.`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function formatJunitCase(testCase: ReportCase) {
  const time = seconds(testCase.durationMs);
  const open = `    <testcase classname="${escapeXml(testCase.displayFile)}" name="${escapeXml(testCase.displayName)}" time="${time}"`;
  if (testCase.status !== "failed") {
    return `${open} />`;
  }
  const message = testCase.failureMessages[0] ?? "eval failed";
  return [
    `${open}>`,
    `      <failure message="${escapeXml(message.split("\n")[0] ?? "eval failed")}">${escapeXml(testCase.failureMessages.join("\n\n"))}</failure>`,
    "    </testcase>",
  ].join("\n");
}

function seconds(durationMs: number | undefined) {
  return ((durationMs ?? 0) / 1000).toFixed(3);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
