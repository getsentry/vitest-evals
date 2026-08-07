import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { formatPercent } from "../gate";
import { publishEvalReport } from "../report";
import { escapeCommandData, formatScore } from "../utils";
import { parseActionInputs } from "./inputs";

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
    failOnFailures: inputs.failOnFailures,
    minPassRate: inputs.minPassRate,
    minScoreAverage: inputs.minScoreAverage,
    maxAnnotations: inputs.maxAnnotations,
    maxFailures: inputs.maxFailures,
    token: inputs.githubToken,
    warn: (message) => console.log(`::warning::${escapeCommandData(message)}`),
  });

  setOutput("status", result.report.status);
  setOutput("results-count", result.resultFiles.length);
  setOutput("evals-total", result.report.totals.evalTotal);
  setOutput("evals-passed", result.report.totals.evalPassed);
  setOutput("evals-failed", result.report.totals.evalFailed);
  setOutput("pass-rate", formatPercent(result.gate.passRate));
  setOutput("score-average", formatScore(result.report.score?.average));
  setOutput("score-minimum", formatScore(result.report.score?.minimum));
  setOutput("gate-status", result.gate.status);
  setOutput("gate-message", result.gate.message);
  if (result.checkRun?.status !== "skipped" && result.checkRun?.htmlUrl) {
    setOutput("check-url", result.checkRun.htmlUrl);
  }

  if (result.shouldFail) {
    // Suite-level gate annotation is emitted by publishEvalReport when
    // annotations are enabled. Keep a plain error here so the step log still
    // shows the gate decision if annotations are off.
    console.error(result.gate.message);
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
