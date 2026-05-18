import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseActionInputs } from "./inputs";
import { publishEvalReport } from "../report";
import { escapeCommandData, formatScore } from "../utils";

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${escapeCommandData(message)}`);
  process.exit(1);
});

async function main() {
  const inputs = parseActionInputs();
  const result = await publishEvalReport({
    resultPatterns: inputs.results,
    cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    workspace: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    summaryEnabled: inputs.publishSummary,
    summaryPath: process.env.GITHUB_STEP_SUMMARY,
    annotations: inputs.publishAnnotations,
    checkRun: inputs.publishCheck,
    checkName: inputs.checkName,
    failOnCheckError: false,
    maxAnnotations: inputs.maxAnnotations,
    maxFailures: inputs.maxFailures,
    token: inputs.githubToken,
    warn: (message) => console.log(`::warning::${escapeCommandData(message)}`),
  });

  setOutput("status", result.report.status);
  setOutput("results-count", result.resultFiles.length);
  setOutput("evals-total", result.report.totals.evalTotal);
  setOutput("evals-failed", result.report.totals.evalFailed);
  setOutput("score-average", formatScore(result.report.score?.average));
  if (result.checkRun?.status !== "skipped" && result.checkRun?.htmlUrl) {
    setOutput("check-url", result.checkRun.htmlUrl);
  }

  if (inputs.failOnFailures && result.report.status === "failed") {
    console.error("::error::vitest-evals report failed");
    process.exit(1);
  }
}

function setOutput(name: string, value: string | number) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }

  const stringValue = String(value);
  if (!stringValue.includes("\n")) {
    appendFileSync(outputFile, `${name}=${stringValue}\n`);
    return;
  }

  const delimiter = `vitest_evals_${randomUUID()}`;
  appendFileSync(
    outputFile,
    `${name}<<${delimiter}\n${stringValue}\n${delimiter}\n`,
  );
}
