import type { ReportCase, ReportRun } from "@vitest-evals/core";
import { formatDuration, formatJson, formatScore } from "./model";

/** Builds a paste-ready Markdown brief for an agent working on one eval case. */
export function caseToMarkdown(
  testCase: ReportCase,
  run: ReportRun | undefined,
): string {
  const lines = [
    `# Eval case: ${testCase.displayName}`,
    "",
    "Help fix or improve this vitest-evals case. Keep the change minimal, preserve the eval intent, and say what you would change.",
    "",
    "## Status",
    "",
    `- **Result:** ${testCase.status}`,
    `- **Score:** ${formatScore(testCase.eval?.avgScore)}`,
    `- **Duration:** ${formatDuration(testCase.durationMs)}`,
    `- **File:** \`${testCase.displayFile}\``,
    `- **Run:** ${run?.source ?? testCase.runId}`,
  ];

  if (testCase.failureMessages.length > 0) {
    lines.push("", "## Failures", "");
    for (const message of testCase.failureMessages) {
      lines.push("```", message, "```", "");
    }
  }

  const output = testCase.eval?.output ?? testCase.harness?.run?.output;
  if (output !== undefined) {
    lines.push("## Output", "", "```json", formatJson(output), "```", "");
  }

  const scores = testCase.eval?.scores ?? [];
  if (scores.length > 0) {
    lines.push("## Judge evidence", "", "| Judge | Score |", "| --- | --- |");
    for (const score of scores) {
      lines.push(`| ${score.name ?? "Score"} | ${formatScore(score.score)} |`);
    }
    lines.push("");
  }

  lines.push(
    "## Raw case JSON",
    "",
    "```json",
    formatJson(testCase),
    "```",
    "",
  );

  return lines.join("\n");
}
