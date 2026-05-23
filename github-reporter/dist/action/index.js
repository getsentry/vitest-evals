"use strict";

// src/action/main.ts
var import_node_fs = require("fs");
var import_node_crypto = require("crypto");

// src/results.ts
var import_promises = require("fs/promises");
var import_node_path = require("path");
var GLOB_META_PATTERN = /[*?]/;
async function resolveResultFiles(patterns, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const files = [];
  for (const pattern of patterns.map((entry) => entry.trim()).filter(Boolean)) {
    if (hasGlob(pattern)) {
      files.push(...await expandGlob(pattern, cwd));
    } else {
      files.push((0, import_node_path.isAbsolute)(pattern) ? pattern : (0, import_node_path.resolve)(cwd, pattern));
    }
  }
  return [...new Set(files)].sort();
}
function splitResultsInput(value) {
  return (value ?? "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}
function hasGlob(pattern) {
  return GLOB_META_PATTERN.test(pattern);
}
async function expandGlob(pattern, cwd) {
  const normalizedPattern = normalizeGlobPattern(pattern);
  const absolutePattern = (0, import_node_path.isAbsolute)(pattern);
  const base = globBase(normalizedPattern);
  const basePath = absolutePattern ? base || import_node_path.sep : (0, import_node_path.resolve)(cwd, base || ".");
  const regex = globToRegExp(normalizedPattern);
  const matches = [];
  for (const file of await listFiles(basePath)) {
    const normalizedFile = normalizePath(file);
    const candidate = absolutePattern ? normalizedFile : normalizePath((0, import_node_path.relative)((0, import_node_path.resolve)(cwd), file));
    if (regex.test(candidate)) {
      matches.push(file);
    }
  }
  return matches;
}
function globBase(pattern) {
  const segments = pattern.split("/");
  const baseSegments = [];
  for (const segment of segments) {
    if (hasGlob(segment)) {
      break;
    }
    baseSegments.push(segment);
  }
  return baseSegments.join("/");
}
async function listFiles(directory) {
  const entries = await readDirectory(directory);
  if (!entries) {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const child = (0, import_node_path.resolve)(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}
async function readDirectory(directory) {
  try {
    return await (0, import_promises.readdir)(directory, { withFileTypes: true });
  } catch {
    return void 0;
  }
}
function globToRegExp(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      const following = pattern[index + 2];
      if (following === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegExp(char ?? "");
  }
  return new RegExp(`^${source}$`);
}
function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
function normalizePath(path) {
  return path.replace(/\\/g, "/");
}
function normalizeGlobPattern(pattern) {
  const normalizedPattern = normalizePath(pattern);
  if ((0, import_node_path.isAbsolute)(pattern)) {
    return normalizedPattern;
  }
  return normalizedPattern.replace(/^(\.\/)+/, "");
}

// src/action/inputs.ts
function parseActionInputs(env = process.env) {
  return {
    results: splitResultsInput(
      getInput(env, "results") || "vitest-results.json"
    ),
    publishSummary: parseBooleanInput(getInput(env, "publish-summary"), true),
    publishAnnotations: parseBooleanInput(
      getInput(env, "publish-annotations"),
      true
    ),
    publishCheck: parseBooleanInput(getInput(env, "publish-check"), false),
    checkName: getInput(env, "check-name") || "vitest-evals",
    githubToken: getInput(env, "github-token"),
    failOnFailures: parseBooleanInput(getInput(env, "fail-on-failures"), false),
    maxAnnotations: parseOptionalInteger(getInput(env, "max-annotations")),
    maxFailures: parseOptionalInteger(getInput(env, "max-failures"))
  };
}
function getInput(env, name) {
  const hyphenKey = `INPUT_${name.toUpperCase()}`;
  const underscoreKey = `INPUT_${name.toUpperCase().replace(/-/g, "_")}`;
  return (env[hyphenKey] ?? env[underscoreKey] ?? "").trim();
}
function parseBooleanInput(value, defaultValue) {
  if (!value) {
    return defaultValue;
  }
  const normalizedValue = value.toLowerCase();
  if (normalizedValue === "true") {
    return true;
  }
  if (normalizedValue === "false") {
    return false;
  }
  throw new Error(`Invalid boolean input: ${value}`);
}
function parseOptionalInteger(value) {
  if (!value) {
    return void 0;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid integer input: ${value}`);
  }
  return Number(value);
}

// src/report.ts
var import_promises2 = require("fs/promises");

// src/utils.ts
var import_node_path2 = require("path");
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function compactLine(value, maxLength) {
  const line = value.split(/\r?\n/).map((part) => part.trim()).find((part) => part.length > 0);
  if (!line) {
    return "";
  }
  return truncate(line, maxLength);
}
function truncate(value, maxLength) {
  if (maxLength <= 0) {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 15)).trimEnd()}... [truncated]`;
}
function stringifyValue(value, maxLength) {
  if (value === void 0) {
    return "";
  }
  if (typeof value === "string") {
    return truncate(value, maxLength);
  }
  try {
    return truncate(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return truncate(String(value), maxLength);
  }
}
function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value);
}
function formatScore(value) {
  if (value == null || !Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}
function formatDuration(ms) {
  if (ms === void 0 || !Number.isFinite(ms)) {
    return "n/a";
  }
  if (ms < 1e3) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1e3;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
function formatLocation(file, location) {
  if (!location) {
    return file;
  }
  return `${file}:${location.line}`;
}
function normalizePathForGitHub(path, workspace) {
  const normalized = path.replace(/\\/g, "/");
  if (!workspace) {
    return normalized;
  }
  const workspacePath = workspace.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized !== workspacePath && !normalized.startsWith(`${workspacePath}/`)) {
    return normalized;
  }
  return import_node_path2.posix.relative(workspacePath, normalized);
}
function escapeFence(value) {
  return value.replace(/```/g, "'''");
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeCommandData(value) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeCommandProperty(value) {
  return escapeCommandData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

// src/annotations.ts
var DEFAULT_MAX_WORKFLOW_ANNOTATIONS = 10;
var DEFAULT_MAX_CHECK_ANNOTATIONS = 50;
var MAX_CHECK_FIELD_LENGTH = 64e3;
function renderWorkflowCommands(report, options = {}) {
  const maxAnnotations = options.maxAnnotations ?? DEFAULT_MAX_WORKFLOW_ANNOTATIONS;
  return report.failures.filter(hasAnnotationLocation).slice(0, maxAnnotations).map(
    (testCase) => formatWorkflowCommand({
      command: "error",
      properties: {
        file: testCase.displayFile,
        line: String(testCase.location.line),
        col: String(testCase.location.column),
        title: "vitest-evals"
      },
      message: formatWorkflowMessage(testCase)
    })
  );
}
function buildCheckAnnotations(report, options = {}) {
  const maxAnnotations = Math.min(
    options.maxAnnotations ?? DEFAULT_MAX_CHECK_ANNOTATIONS,
    DEFAULT_MAX_CHECK_ANNOTATIONS
  );
  return report.failures.filter(hasAnnotationLocation).slice(0, maxAnnotations).map((testCase) => ({
    path: testCase.displayFile,
    start_line: testCase.location.line,
    end_line: testCase.location.line,
    annotation_level: "failure",
    title: truncate(
      `${testCase.primaryFailure?.judgeName ?? "vitest-evals"} - ${testCase.displayName}`,
      255
    ),
    message: truncate(
      formatWorkflowMessage(testCase),
      MAX_CHECK_FIELD_LENGTH
    ),
    raw_details: truncate(formatRawDetails(testCase), MAX_CHECK_FIELD_LENGTH)
  }));
}
function hasAnnotationLocation(testCase) {
  return Boolean(testCase.location);
}
function formatWorkflowMessage(testCase) {
  const failure = testCase.primaryFailure;
  const parts = [
    testCase.displayName,
    `score ${formatScore(failure?.score ?? testCase.eval?.avgScore)}`
  ];
  if (failure?.judgeName) {
    parts.push(failure.judgeName);
  }
  const reason = compactLine(failure?.reason ?? "", 320);
  if (reason) {
    parts.push(reason);
  }
  return parts.join(" - ");
}
function formatRawDetails(testCase) {
  const lines = [
    `Test: ${testCase.displayName}`,
    `Location: ${testCase.displayFile}:${testCase.location.line}`,
    `Harness: ${testCase.harness?.name ?? "n/a"}`,
    `Score: ${formatScore(testCase.primaryFailure?.score ?? testCase.eval?.avgScore)}`,
    `Judge: ${testCase.primaryFailure?.judgeName ?? "n/a"}`,
    "",
    "Reason:",
    testCase.primaryFailure?.reason ?? "n/a"
  ];
  const finalOutput = testCase.eval?.output ?? testCase.harness?.output;
  if (finalOutput !== void 0) {
    lines.push("", "Final:", stringifyValue(finalOutput, 8e3));
  }
  if (testCase.harness?.toolCalls.length) {
    lines.push("", "Tools:");
    for (const toolCall of testCase.harness.toolCalls) {
      lines.push(
        `- ${toolCall.name}: ${toolCall.error ? `error: ${toolCall.error}` : "ok"}`
      );
    }
  }
  return lines.join("\n");
}
function formatWorkflowCommand({
  command,
  properties,
  message
}) {
  const renderedProperties = Object.entries(properties).map(([key, value]) => `${key}=${escapeCommandProperty(value)}`).join(",");
  return `::${command} ${renderedProperties}::${escapeCommandData(message)}`;
}

// src/collect.ts
function collectEvalReport(input, options = {}) {
  const cases = input.testResults.flatMap(
    (file) => file.assertionResults.flatMap((assertion) => {
      const evalCase = collectEvalCase(file, assertion, options);
      return evalCase ? [evalCase] : [];
    })
  );
  const failures = cases.filter((testCase) => testCase.status === "failed");
  const evalScores = cases.map((testCase) => testCase.eval?.avgScore).filter((score) => isFiniteNumber(score));
  const usage = sumUsage(cases);
  const durationMs = resolveRunDuration(input);
  return {
    status: input.success && failures.length === 0 ? "passed" : "failed",
    startedAt: input.startTime,
    durationMs,
    totals: {
      total: input.numTotalTests,
      passed: input.numPassedTests,
      failed: input.numFailedTests,
      skipped: input.numPendingTests + input.numTodoTests,
      evalTotal: cases.length,
      evalPassed: cases.filter((testCase) => testCase.status === "passed").length,
      evalFailed: failures.length
    },
    score: evalScores.length > 0 ? {
      average: evalScores.reduce((total, score) => total + score, 0) / evalScores.length,
      minimum: Math.min(...evalScores)
    } : void 0,
    usage,
    cases,
    failures
  };
}
function collectEvalCase(file, assertion, options) {
  const meta = isRecord(assertion.meta) ? assertion.meta : {};
  const evalMeta = getEvalMeta(meta.eval);
  const harnessMeta = getHarnessMeta(meta.harness);
  if (!evalMeta && !harnessMeta) {
    return null;
  }
  const displayFile = normalizePathForGitHub(file.name, options.workspace);
  const scores = evalMeta?.scores ?? [];
  const harnessRun = harnessMeta?.run;
  const toolCalls = collectToolCalls(harnessRun?.session);
  const evalCase = {
    id: `${file.name}:${assertion.location?.line ?? 0}:${assertion.fullName}`,
    file: file.name,
    displayFile,
    title: assertion.title,
    displayName: formatDisplayName(assertion),
    status: assertion.status,
    durationMs: typeof assertion.duration === "number" ? assertion.duration : void 0,
    location: assertion.location ?? void 0,
    failureMessages: assertion.failureMessages ?? [],
    eval: evalMeta ? {
      avgScore: evalMeta.avgScore,
      thresholdFailed: evalMeta.thresholdFailed,
      output: evalMeta.output,
      scores
    } : void 0,
    harness: harnessMeta ? {
      name: harnessMeta.name,
      output: harnessRun?.output,
      usage: harnessRun?.usage,
      timingMs: harnessRun?.timings?.totalMs,
      toolCalls,
      errors: harnessRun?.errors ?? []
    } : void 0
  };
  evalCase.primaryFailure = getPrimaryFailure(evalCase);
  return evalCase;
}
function getEvalMeta(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  return {
    scores: Array.isArray(value.scores) ? value.scores.filter(isRecord).map(normalizeScore) : void 0,
    avgScore: numberField(value.avgScore),
    output: value.output,
    thresholdFailed: typeof value.thresholdFailed === "boolean" ? value.thresholdFailed : void 0
  };
}
function normalizeScore(score) {
  const metadata = isRecord(score.metadata) ? score.metadata : void 0;
  return {
    name: typeof score.name === "string" ? score.name : void 0,
    score: numberField(score.score) ?? null,
    metadata
  };
}
function getHarnessMeta(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const run = isRecord(value.run) ? value.run : void 0;
  const usage = isRecord(run?.usage) ? getUsage(run.usage) : void 0;
  const timings = isRecord(run?.timings) ? run.timings : void 0;
  return {
    name: typeof value.name === "string" ? value.name : void 0,
    run: run ? {
      output: run.output,
      usage,
      timings: {
        totalMs: typeof timings?.totalMs === "number" ? timings.totalMs : void 0
      },
      session: isRecord(run.session) ? {
        messages: Array.isArray(run.session.messages) ? run.session.messages : void 0
      } : void 0,
      errors: Array.isArray(run.errors) ? run.errors : void 0
    } : void 0
  };
}
function getUsage(value) {
  return {
    inputTokens: numberField(value.inputTokens),
    outputTokens: numberField(value.outputTokens),
    reasoningTokens: numberField(value.reasoningTokens),
    totalTokens: numberField(value.totalTokens),
    toolCalls: numberField(value.toolCalls)
  };
}
function numberField(value) {
  return isFiniteNumber(value) ? value : void 0;
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function collectToolCalls(session) {
  const messages = session?.messages ?? [];
  const toolCalls = [];
  for (const message of messages) {
    if (!Array.isArray(message.toolCalls)) {
      continue;
    }
    for (const call of message.toolCalls) {
      if (!isRecord(call) || typeof call.name !== "string") {
        continue;
      }
      toolCalls.push({
        name: call.name,
        error: getToolCallError(call.error),
        durationMs: numberField(call.durationMs)
      });
    }
  }
  return toolCalls;
}
function getToolCallError(value) {
  if (isRecord(value) && typeof value.message === "string") {
    return value.message;
  }
  if (value !== void 0) {
    return stringifyValue(value, 240);
  }
  return void 0;
}
function getPrimaryFailure(testCase) {
  const failingScores = [...testCase.eval?.scores ?? []].filter(
    (score2) => (score2.score ?? 0) < 1 || score2.metadata?.rationale !== void 0 || score2.metadata?.output !== void 0
  ).sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  const primary = failingScores[0];
  const score = typeof primary?.score === "number" ? primary.score : testCase.eval?.avgScore;
  const reason = stringifyReason(primary?.metadata?.rationale) ?? compactLine(testCase.failureMessages.join("\n"), 500);
  if (!primary && !reason && score === void 0) {
    return void 0;
  }
  return {
    judgeName: primary?.name,
    score,
    reason: reason || void 0
  };
}
function stringifyReason(value) {
  if (value === void 0) {
    return void 0;
  }
  return typeof value === "string" ? value : stringifyValue(value, 4e3);
}
function formatDisplayName(assertion) {
  return [...assertion.ancestorTitles, assertion.title].filter((part) => part.length > 0).join(" > ");
}
function sumUsage(cases) {
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    toolCalls: 0
  };
  for (const testCase of cases) {
    const caseUsage = testCase.harness?.usage;
    usage.inputTokens += caseUsage?.inputTokens ?? 0;
    usage.outputTokens += caseUsage?.outputTokens ?? 0;
    usage.reasoningTokens += caseUsage?.reasoningTokens ?? 0;
    usage.totalTokens += caseUsage?.totalTokens ?? (caseUsage?.inputTokens ?? 0) + (caseUsage?.outputTokens ?? 0) + (caseUsage?.reasoningTokens ?? 0);
    usage.toolCalls += caseUsage?.toolCalls ?? testCase.harness?.toolCalls.length ?? 0;
  }
  return usage;
}
function resolveRunDuration(input) {
  const startTimes = input.testResults.map((file) => file.startTime).filter((time) => Number.isFinite(time));
  const endTimes = input.testResults.map((file) => file.endTime).filter((time) => Number.isFinite(time));
  if (startTimes.length === 0 || endTimes.length === 0) {
    return void 0;
  }
  return Math.max(...endTimes) - Math.min(...startTimes);
}

// src/summary.ts
var DEFAULT_MAX_FAILURES = 20;
var DEFAULT_MAX_REASON_CHARS = 8e3;
var DEFAULT_MAX_OUTPUT_CHARS = 4e3;
var DEFAULT_MAX_TOOL_CALLS = 20;
var SCORE_DISTRIBUTION_BUCKETS = [
  "0-19%",
  "20-39%",
  "40-59%",
  "60-79%",
  "80-100%"
];
var SCORE_DISTRIBUTION_BAR_WIDTH = 20;
function renderJobSummary(report, options = {}) {
  const maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
  const failures = report.failures.slice(0, maxFailures);
  const nonEvalFailures = report.totals.failed - report.totals.evalFailed;
  const lines = [
    "# vitest-evals",
    "",
    ...renderSummaryTable(report, nonEvalFailures),
    "",
    ...renderScoreDistribution(report),
    "## Results",
    ""
  ];
  if (report.failures.length > 0) {
    lines.push("### Failures", "");
    failures.forEach((testCase, index) => {
      lines.push(...renderFailureDetails(testCase, index + 1, options), "");
    });
    if (report.failures.length > failures.length) {
      lines.push(
        `${report.failures.length - failures.length} more failures omitted from this summary.`,
        ""
      );
    }
  } else if (report.totals.evalTotal > 0) {
    lines.push("### Failures", "", "No eval failures.", "");
  }
  if (report.totals.evalTotal === 0) {
    lines.push("No eval metadata was found in the Vitest JSON report.", "");
  }
  return `${lines.join("\n")}
`;
}
function formatCountLine(passed, failed, total) {
  return `${formatNumber(passed)} passed, ${formatNumber(failed)} failed, ${formatNumber(total)} total`;
}
function renderSummaryTable(report, nonEvalFailures) {
  const rows = [
    ["Status", report.status],
    [
      "Evals",
      formatCountLine(
        report.totals.evalPassed,
        report.totals.evalFailed,
        report.totals.evalTotal
      )
    ]
  ];
  if (report.score) {
    rows.push(["Score", formatScoreSummary(report.score)]);
  }
  if (nonEvalFailures > 0) {
    rows.push([
      "Other Failures",
      `${formatNumber(nonEvalFailures)} non-eval test failure${nonEvalFailures === 1 ? "" : "s"}`
    ]);
  }
  rows.push(["Duration", formatDuration(report.durationMs)]);
  return [
    "| Metric | Value |",
    "| --- | --- |",
    ...rows.map(
      ([metric, value]) => `| ${escapeTableCell(metric)} | ${escapeTableCell(value)} |`
    )
  ];
}
function formatScoreSummary(score) {
  return `avg ${formatScore(score.average)}${score.minimum === void 0 ? "" : `, min ${formatScore(score.minimum)}`}`;
}
function escapeTableCell(value) {
  return value.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}
function renderScoreDistribution(report) {
  const scores = report.cases.map((testCase) => testCase.eval?.avgScore).filter(
    (score) => typeof score === "number" && Number.isFinite(score)
  );
  if (scores.length === 0) {
    return [];
  }
  const counts = SCORE_DISTRIBUTION_BUCKETS.map(() => 0);
  for (const score of scores) {
    const bucket = Math.min(
      SCORE_DISTRIBUTION_BUCKETS.length - 1,
      Math.max(0, Math.floor(score * SCORE_DISTRIBUTION_BUCKETS.length))
    );
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  const maxCount = Math.max(...counts);
  return [
    "## Scores",
    "",
    "```text",
    ...SCORE_DISTRIBUTION_BUCKETS.map(
      (label, index) => formatScoreDistributionBucket(label, counts[index] ?? 0, maxCount)
    ),
    "```",
    ""
  ];
}
function formatScoreDistributionBucket(label, count, maxCount) {
  const barLength = count === 0 ? 0 : Math.max(
    1,
    Math.round(count / maxCount * SCORE_DISTRIBUTION_BAR_WIDTH)
  );
  const bar = "#".repeat(barLength).padEnd(SCORE_DISTRIBUTION_BAR_WIDTH, " ");
  return `${label.padEnd(7)} | ${bar} ${formatNumber(count)}`;
}
function renderFailureDetails(testCase, number, options) {
  const failure = testCase.primaryFailure;
  const maxReasonChars = options.maxReasonChars ?? DEFAULT_MAX_REASON_CHARS;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const maxToolCalls = options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const usage = formatCaseUsage(testCase);
  const finalOutput = testCase.eval?.output ?? testCase.harness?.output;
  const summary = `${number}. ${testCase.displayName} - ${failure?.judgeName ?? "failure"} - ${formatScore(failure?.score ?? testCase.eval?.avgScore)}`;
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
      usage
    }).map(escapeFence),
    "```",
    "",
    "</details>"
  ];
  return lines;
}
function renderFailureBlock(testCase, {
  finalOutput,
  maxOutputChars,
  maxReasonChars,
  maxToolCalls,
  number,
  usage
}) {
  const failure = testCase.primaryFailure;
  const overviewRows = [
    ["Case", `${number}. ${testCase.displayName}`],
    ["Status", testCase.status],
    ["Location", formatLocation(testCase.displayFile, testCase.location)],
    ["Harness", testCase.harness?.name ?? "n/a"],
    ["Score", formatScore(failure?.score ?? testCase.eval?.avgScore)],
    ["Judge", failure?.judgeName ?? "n/a"]
  ];
  if (usage) {
    overviewRows.push(["Usage", usage]);
  }
  if (testCase.durationMs !== void 0) {
    overviewRows.push(["Duration", formatDuration(testCase.durationMs)]);
  }
  const lines = [
    ...renderAsciiSection("Result", renderKeyValues(overviewRows)),
    ""
  ];
  if (failure?.reason) {
    lines.push(
      ...renderAsciiSection(
        "Reason",
        truncate(failure.reason, maxReasonChars).split(/\r?\n/)
      ),
      ""
    );
  }
  if (testCase.eval?.scores.length) {
    lines.push(
      ...renderAsciiTable(
        ["Judge", "Score"],
        testCase.eval.scores.map((score) => [
          score.name ?? "Unknown",
          formatScore(score.score)
        ])
      ),
      ""
    );
  }
  if (finalOutput !== void 0) {
    lines.push(
      ...renderAsciiSection(
        "Final Output",
        stringifyValue(finalOutput, maxOutputChars).split(/\r?\n/)
      ),
      ""
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
          toolCall.durationMs === void 0 ? "n/a" : formatDuration(toolCall.durationMs)
        ])
      )
    );
    if (testCase.harness.toolCalls.length > maxToolCalls) {
      lines.push(
        `${testCase.harness.toolCalls.length - maxToolCalls} more tool calls omitted`
      );
    }
    lines.push("");
  }
  if (testCase.harness?.errors.length) {
    lines.push(
      ...renderAsciiSection(
        "Harness Errors",
        stringifyValue(testCase.harness.errors, maxReasonChars).split(/\r?\n/)
      ),
      ""
    );
  }
  while (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}
function renderAsciiSection(title, content) {
  return [title, "-".repeat(title.length), ...content];
}
function renderKeyValues(rows) {
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  return rows.map(
    ([label, value]) => `${label.padEnd(labelWidth)}  ${compactLine(value, 500)}`
  );
}
function renderAsciiTable(headers, rows) {
  const widths = headers.map(
    (header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );
  const renderRow = (row) => row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  ").trimEnd();
  return [
    renderRow(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(renderRow)
  ];
}
function formatCaseUsage(testCase) {
  const usage = testCase.harness?.usage;
  const parts = [];
  const totalTokens = usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) + (usage?.reasoningTokens ?? 0);
  const toolCalls = usage?.toolCalls ?? testCase.harness?.toolCalls.length ?? 0;
  if (totalTokens > 0) {
    parts.push(`${formatNumber(totalTokens)} tokens`);
  }
  if (toolCalls > 0) {
    parts.push(`${formatNumber(toolCalls)} tool${toolCalls === 1 ? "" : "s"}`);
  }
  if (testCase.harness?.timingMs !== void 0) {
    parts.push(formatDuration(testCase.harness.timingMs));
  }
  return parts.join(", ");
}

// src/github.ts
var DEFAULT_CHECK_NAME = "vitest-evals";
var MAX_CHECK_SUMMARY_LENGTH = 64e3;
var CHECK_SUMMARY_TRUNCATION_SUFFIX = "\n\n[truncated for GitHub Check Run]\n";
async function publishCheckRun(report, options = {}) {
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
  const sha = options.sha ?? process.env.GITHUB_SHA;
  if (!token) {
    return { status: "skipped", reason: "missing GITHUB_TOKEN" };
  }
  if (!repository) {
    return { status: "skipped", reason: "missing GITHUB_REPOSITORY" };
  }
  if (!sha && options.checkRunId === void 0) {
    return { status: "skipped", reason: "missing GITHUB_SHA" };
  }
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    return {
      status: "skipped",
      reason: `invalid GitHub repository: ${repository}`
    };
  }
  const payload = buildCheckRunPayload(report, options);
  const apiUrl = options.apiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
  const requestUrl = options.checkRunId === void 0 ? `${apiUrl}/repos/${owner}/${repo}/check-runs` : `${apiUrl}/repos/${owner}/${repo}/check-runs/${options.checkRunId}`;
  const response = await fetch(requestUrl, {
    method: options.checkRunId === void 0 ? "POST" : "PATCH",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify(
      options.checkRunId === void 0 ? {
        name: options.name ?? DEFAULT_CHECK_NAME,
        head_sha: sha,
        ...payload
      } : payload
    )
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub Check Run request failed: ${response.status} ${response.statusText} ${text}`.trim()
    );
  }
  const data = await response.json();
  return {
    status: options.checkRunId === void 0 ? "created" : "updated",
    id: data.id,
    htmlUrl: data.html_url
  };
}
function buildCheckRunPayload(report, options) {
  const annotations = buildCheckAnnotations(report, {
    maxAnnotations: options.maxAnnotations
  });
  const title = report.failures.length === 0 && report.status === "passed" ? "No eval failures" : report.failures.length === 0 ? "Vitest run failed" : `${report.failures.length} eval failure${report.failures.length === 1 ? "" : "s"}`;
  return {
    status: "completed",
    conclusion: report.status === "passed" ? "success" : "failure",
    completed_at: (/* @__PURE__ */ new Date()).toISOString(),
    output: {
      title,
      summary: truncateCheckSummary(
        renderJobSummary(report, {
          ...options,
          maxFailures: options.maxFailures ?? 5,
          maxReasonChars: options.maxReasonChars ?? 4e3,
          maxOutputChars: options.maxOutputChars ?? 2e3,
          maxToolCalls: options.maxToolCalls ?? 10
        })
      ),
      annotations
    }
  };
}
function truncateCheckSummary(summary) {
  if (summary.length <= MAX_CHECK_SUMMARY_LENGTH) {
    return summary;
  }
  return `${summary.slice(0, MAX_CHECK_SUMMARY_LENGTH - CHECK_SUMMARY_TRUNCATION_SUFFIX.length).trimEnd()}${CHECK_SUMMARY_TRUNCATION_SUFFIX}`;
}

// src/merge.ts
function mergeEvalReports(reports) {
  const cases = reports.flatMap((report) => report.cases);
  const failures = reports.flatMap((report) => report.failures);
  const scoredCases = cases.map((testCase) => testCase.eval?.avgScore).filter(
    (score) => typeof score === "number" && Number.isFinite(score)
  );
  const startedAtValues = reports.map((report) => report.startedAt).filter(
    (startedAt2) => typeof startedAt2 === "number" && Number.isFinite(startedAt2)
  );
  const startedAt = startedAtValues.length > 0 ? Math.min(...startedAtValues) : void 0;
  return {
    status: reports.some((report) => report.status === "failed") ? "failed" : "passed",
    startedAt,
    durationMs: mergeDuration(reports),
    totals: {
      total: sum(reports, (report) => report.totals.total),
      passed: sum(reports, (report) => report.totals.passed),
      failed: sum(reports, (report) => report.totals.failed),
      skipped: sum(reports, (report) => report.totals.skipped),
      evalTotal: sum(reports, (report) => report.totals.evalTotal),
      evalPassed: sum(reports, (report) => report.totals.evalPassed),
      evalFailed: sum(reports, (report) => report.totals.evalFailed)
    },
    score: scoredCases.length > 0 ? {
      average: scoredCases.reduce((total, score) => total + score, 0) / scoredCases.length,
      minimum: Math.min(...scoredCases)
    } : void 0,
    usage: mergeUsage(reports.map((report) => report.usage)),
    cases,
    failures
  };
}
function mergeUsage(usages) {
  return {
    inputTokens: sum(usages, (usage) => usage.inputTokens),
    outputTokens: sum(usages, (usage) => usage.outputTokens),
    reasoningTokens: sum(usages, (usage) => usage.reasoningTokens),
    totalTokens: sum(usages, (usage) => usage.totalTokens),
    toolCalls: sum(usages, (usage) => usage.toolCalls)
  };
}
function mergeDuration(reports) {
  const intervals = reports.map((report) => {
    if (typeof report.startedAt !== "number" || !Number.isFinite(report.startedAt) || typeof report.durationMs !== "number" || !Number.isFinite(report.durationMs)) {
      return void 0;
    }
    return {
      start: report.startedAt,
      end: report.startedAt + report.durationMs
    };
  }).filter(
    (interval) => Boolean(interval)
  );
  if (intervals.length > 0) {
    return Math.max(...intervals.map((interval) => interval.end)) - Math.min(...intervals.map((interval) => interval.start));
  }
  const durations = reports.map((report) => report.durationMs).filter(
    (durationMs) => typeof durationMs === "number" && Number.isFinite(durationMs)
  );
  return durations.length > 0 ? durations.reduce((total, durationMs) => total + durationMs, 0) : void 0;
}
function sum(items, select) {
  return items.reduce((total, item) => total + select(item), 0);
}

// src/report.ts
async function publishEvalReport(options) {
  const resultFiles = await resolveResultFiles(options.resultPatterns, {
    cwd: options.cwd
  });
  if (resultFiles.length === 0) {
    throw new Error(
      `No eval result files matched: ${options.resultPatterns.join(", ")}`
    );
  }
  const reports = await Promise.all(
    resultFiles.map(async (resultFile) => {
      const json = await readVitestJsonReport(resultFile);
      return collectEvalReport(json, {
        workspace: options.workspace
      });
    })
  );
  const report = mergeEvalReports(reports);
  const summary = renderJobSummary(report, {
    maxFailures: options.maxFailures,
    maxOutputChars: options.maxOutputChars,
    maxReasonChars: options.maxReasonChars,
    maxToolCalls: options.maxToolCalls
  });
  if (options.summaryEnabled !== false) {
    if (options.summaryPath) {
      await (0, import_promises2.appendFile)(options.summaryPath, `${summary}
`);
    } else {
      console.log(summary);
    }
  }
  if (options.annotations) {
    for (const command of renderWorkflowCommands(report, {
      maxAnnotations: options.maxAnnotations
    })) {
      console.log(command);
    }
  }
  let checkRun;
  if (options.checkRun) {
    try {
      checkRun = await publishCheckRun(report, {
        checkRunId: options.checkRunId,
        maxAnnotations: options.maxAnnotations,
        maxFailures: options.maxFailures,
        maxOutputChars: options.maxOutputChars,
        maxReasonChars: options.maxReasonChars,
        maxToolCalls: options.maxToolCalls,
        name: options.checkName,
        repository: options.repository,
        sha: options.sha,
        token: options.token
      });
      if (checkRun.status === "skipped") {
        options.warn?.(`GitHub Check Run skipped: ${checkRun.reason}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.failOnCheckError) {
        throw error;
      }
      options.warn?.(message);
    }
  }
  return {
    report,
    resultFiles,
    checkRun
  };
}
async function readVitestJsonReport(resultFile) {
  try {
    return JSON.parse(await (0, import_promises2.readFile)(resultFile, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read eval result file ${resultFile}: ${message}`
    );
  }
}

// src/action/main.ts
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
    warn: (message) => console.log(`::warning::${escapeCommandData(message)}`)
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
function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }
  const stringValue = String(value);
  if (!stringValue.includes("\n")) {
    (0, import_node_fs.appendFileSync)(outputFile, `${name}=${stringValue}
`);
    return;
  }
  const delimiter = `vitest_evals_${(0, import_node_crypto.randomUUID)()}`;
  (0, import_node_fs.appendFileSync)(
    outputFile,
    `${name}<<${delimiter}
${stringValue}
${delimiter}
`
  );
}
