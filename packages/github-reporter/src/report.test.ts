import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveResultFiles } from "@vitest-evals/core/node";
import { afterEach, describe, expect, test, vi } from "vitest";
import { parseActionInputs } from "./action/inputs";
import { buildCheckAnnotations, renderWorkflowCommands } from "./annotations";
import { parseCliArgs } from "./cli-options";
import { collectEvalReport } from "./collect";
import {
  evaluateEvalGate,
  formatPercent,
  renderGateWorkflowCommand,
} from "./gate";
import {
  publishCheckRun,
  resolveCheckDetailsUrl,
  resolveCheckSha,
} from "./github";
import { mergeEvalReports } from "./merge";
import { publishEvalReport } from "./report";
import { renderJobSummary } from "./summary";
import type { VitestJsonReport } from "./types";
import { formatDuration, normalizePathForGitHub } from "./utils";

const sampleJson: VitestJsonReport = {
  numFailedTests: 1,
  numPassedTests: 1,
  numPendingTests: 0,
  numTodoTests: 0,
  numTotalTests: 2,
  startTime: 1000,
  success: false,
  testResults: [
    {
      name: "/repo/apps/demo/evals/refund.eval.ts",
      status: "failed",
      message: "",
      startTime: 1000,
      endTime: 5500,
      assertionResults: [
        {
          ancestorTitles: ["refund agent"],
          fullName: "refund agent rejects fraud",
          title: "rejects fraud",
          status: "failed",
          duration: 42,
          failureMessages: ["Score: 0.20 below threshold: 1.00"],
          location: {
            line: 42,
            column: 3,
          },
          tags: [],
          meta: {
            eval: {
              avgScore: 0.2,
              thresholdFailed: true,
              output: {
                status: "denied",
                reason: "invoice is not refundable",
              },
              scores: [
                {
                  name: "StructuredOutputJudge",
                  score: 0.2,
                  metadata: {
                    rationale:
                      "status mismatch\nExpected status=approved, got status=denied",
                  },
                },
                {
                  name: "ToolCallJudge",
                  score: 1,
                },
              ],
            },
            harness: {
              name: "pi-ai",
              run: {
                output: {
                  status: "denied",
                },
                usage: {
                  totalTokens: 1220,
                  toolCalls: 2,
                },
                timings: {
                  totalMs: 4100,
                },
                session: {
                  events: [
                    {
                      type: "tool_call",
                      id: "call_lookup",
                      name: "lookupInvoice",
                      durationMs: 6,
                    },
                    {
                      type: "tool_call",
                      id: "call_refund",
                      name: "createRefund",
                    },
                    {
                      type: "tool_result",
                      toolCallId: "call_lookup",
                      name: "lookupInvoice",
                      durationMs: 6,
                    },
                    {
                      type: "tool_result",
                      toolCallId: "call_refund",
                      name: "createRefund",
                      error: {
                        message: "skipped: invoice not refundable",
                      },
                    },
                  ],
                },
                errors: [],
              },
            },
          },
        },
        {
          ancestorTitles: ["unit"],
          fullName: "unit plain test",
          title: "plain test",
          status: "passed",
          duration: 3,
          failureMessages: [],
          location: {
            line: 12,
            column: 1,
          },
          tags: [],
          meta: {},
        },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("collectEvalReport", () => {
  test("extracts eval metadata from Vitest JSON assertions", () => {
    const report = collectEvalReport(sampleJson, {
      workspace: "/repo",
    });

    expect(report.status).toBe("failed");
    expect(report.totals).toMatchObject({
      total: 2,
      failed: 1,
      evalTotal: 1,
      evalFailed: 1,
    });
    expect(report.score).toEqual({
      average: 0.2,
      minimum: 0.2,
    });
    expect(report.usage.totalTokens).toBe(1220);
    expect(report.usage.toolCalls).toBe(2);
    expect(report.failures[0]).toMatchObject({
      displayFile: "apps/demo/evals/refund.eval.ts",
      displayName: "refund agent > rejects fraud",
      primaryFailure: {
        judgeName: "StructuredOutputJudge",
        score: 0.2,
      },
      toolCalls: [
        {
          name: "lookupInvoice",
          durationMs: 6,
          status: "ok",
        },
        {
          name: "createRefund",
          status: "error",
        },
      ],
    });
  });

  test("counts harness-only assertions as scored evals", () => {
    const json = structuredClone(sampleJson);
    const assertion = json.testResults[0]!.assertionResults[0]!;
    assertion.status = "passed";
    assertion.failureMessages = [];
    assertion.meta = {
      harness: (assertion.meta as any).harness,
    };

    const report = collectEvalReport(json, {
      workspace: "/repo",
    });

    expect(report.totals).toMatchObject({
      evalTotal: 1,
      evalPassed: 1,
      evalFailed: 0,
    });
    expect(report.score).toEqual({
      average: 1,
      minimum: 1,
    });
    expect(report.cases[0]?.eval).toEqual({
      avgScore: 1,
      thresholdFailed: false,
      scores: [],
    });
  });

  test("does not normalize provider-specific cost as usage", () => {
    const json = structuredClone(sampleJson);
    const usage = (json.testResults[0]?.assertionResults[0]?.meta as any)
      .harness.run.usage;
    usage.estimatedCost = 20;
    usage.metadata = {
      costUSD: 20,
    };

    const report = collectEvalReport(json, {
      workspace: "/repo",
    });

    expect("estimatedCost" in report.usage).toBe(false);
    expect(renderJobSummary(report)).not.toContain("$20");
  });

  test("ignores non-finite eval scores", () => {
    const json = structuredClone(sampleJson);
    const evalMeta = (json.testResults[0]?.assertionResults[0]?.meta as any)
      .eval;
    evalMeta.avgScore = Number.POSITIVE_INFINITY;
    evalMeta.scores[0].score = Number.POSITIVE_INFINITY;

    const report = collectEvalReport(json, {
      workspace: "/repo",
    });

    expect(report.score).toBeUndefined();
    expect(report.failures[0]?.eval?.avgScore).toBeUndefined();
    expect(report.failures[0]?.eval?.scores[0]?.score).toBeNull();
    expect(renderJobSummary(report)).not.toContain("Infinity");
    expect(renderWorkflowCommands(report)[0]).toContain("score n/a");
  });

  test("uses validated core duration collection", () => {
    const json = structuredClone(sampleJson);
    json.testResults[0]!.endTime = 500;

    const report = collectEvalReport(json, {
      workspace: "/repo",
    });

    expect(report.durationMs).toBeUndefined();
  });

  test("includes tool calls stored on eval metadata", () => {
    const json = structuredClone(sampleJson);
    const assertion = json.testResults[0]!.assertionResults[0]!;
    assertion.meta = {
      eval: {
        avgScore: 0.5,
        thresholdFailed: true,
        output: {
          status: "denied",
        },
        scores: [
          {
            name: "ToolCallJudge",
            score: 0.5,
            metadata: {
              rationale: "missing notification",
            },
          },
        ],
        toolCalls: [
          {
            name: "validateRefund",
            status: "ok",
          },
          {
            name: "notifyCustomer",
            status: "error",
            error: {
              message: "blocked by policy",
            },
          },
          {
            name: "emailCustomer",
            status: "pending",
          },
        ],
      },
    };

    const report = collectEvalReport(json, {
      workspace: "/repo",
    });

    expect(report.usage.toolCalls).toBe(3);
    expect(report.failures[0]?.harness).toBeUndefined();
    expect(report.failures[0]?.toolCalls).toMatchObject([
      {
        name: "validateRefund",
        status: "ok",
      },
      {
        name: "notifyCustomer",
        status: "error",
      },
      {
        name: "emailCustomer",
        status: "pending",
      },
    ]);
    expect(renderJobSummary(report)).toContain(
      "notifyCustomer  error: blocked by policy",
    );
    expect(renderJobSummary(report)).toContain("emailCustomer   pending");
  });
});

describe("mergeEvalReports", () => {
  test("combines sharded reports into one report", () => {
    const secondJson = structuredClone(sampleJson);
    secondJson.success = true;
    secondJson.numFailedTests = 0;
    secondJson.numPassedTests = 1;
    secondJson.numTotalTests = 1;
    secondJson.startTime = 6000;
    secondJson.testResults[0]!.name = "/repo/apps/demo/evals/other.eval.ts";
    secondJson.testResults[0]!.status = "passed";
    secondJson.testResults[0]!.startTime = 6000;
    secondJson.testResults[0]!.endTime = 8000;
    secondJson.testResults[0]!.assertionResults = [
      {
        ...secondJson.testResults[0]!.assertionResults[0]!,
        fullName: "refund agent approves refund",
        title: "approves refund",
        status: "passed",
        failureMessages: [],
        meta: {
          eval: {
            avgScore: 0.8,
            thresholdFailed: false,
            output: { status: "approved" },
            scores: [{ name: "StructuredOutputJudge", score: 0.8 }],
          },
          harness: {
            name: "pi-ai",
            run: {
              output: { status: "approved" },
              usage: {
                totalTokens: 300,
                toolCalls: 1,
              },
              timings: {
                totalMs: 2000,
              },
              session: {
                events: [],
              },
              errors: [],
            },
          },
        },
      },
    ];

    const report = mergeEvalReports([
      collectEvalReport(sampleJson, { workspace: "/repo" }),
      collectEvalReport(secondJson, { workspace: "/repo" }),
    ]);

    expect(report.status).toBe("failed");
    expect(report.totals).toMatchObject({
      total: 3,
      passed: 2,
      failed: 1,
      evalTotal: 2,
      evalPassed: 1,
      evalFailed: 1,
    });
    expect(report.score).toEqual({
      average: 0.5,
      minimum: 0.2,
    });
    expect(report.usage.totalTokens).toBe(1520);
    expect(report.usage.toolCalls).toBe(3);
    expect(report.cases).toHaveLength(2);
    expect(report.failures).toHaveLength(1);
    expect(report.durationMs).toBe(7000);
  });

  test("sums durations when some merged reports do not have start times", () => {
    const first = collectEvalReport(sampleJson, { workspace: "/repo" });
    const second = {
      ...first,
      startedAt: undefined,
      durationMs: 2000,
      cases: [],
      failures: [],
    };

    expect(mergeEvalReports([first, second]).durationMs).toBe(6500);
  });
});

describe("resolveResultFiles", () => {
  test("resolves result globs relative to the workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-report-"));
    const resultsDirectory = join(directory, "eval-results");
    await mkdir(resultsDirectory);
    await writeFile(join(resultsDirectory, "one.json"), "{}");
    await writeFile(join(resultsDirectory, "two.json"), "{}");
    await writeFile(join(resultsDirectory, "notes.txt"), "");

    await expect(
      resolveResultFiles(["eval-results/*.json"], {
        cwd: directory,
      }),
    ).resolves.toEqual([
      join(resultsDirectory, "one.json"),
      join(resultsDirectory, "two.json"),
    ]);
  });

  test("resolves result globs with an explicit current-directory prefix", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-report-"));
    const resultsDirectory = join(directory, "eval-results");
    await mkdir(resultsDirectory);
    await writeFile(join(resultsDirectory, "one.json"), "{}");

    await expect(
      resolveResultFiles(["./eval-results/*.json"], {
        cwd: directory,
      }),
    ).resolves.toEqual([join(resultsDirectory, "one.json")]);
  });

  test("resolves parent-directory relative result globs", async () => {
    const parentDirectory = await mkdtemp(
      join(tmpdir(), "vitest-evals-report-"),
    );
    const workspaceDirectory = join(parentDirectory, "workspace");
    const resultsDirectory = join(parentDirectory, "eval-results");
    await mkdir(workspaceDirectory);
    await mkdir(resultsDirectory);
    await writeFile(join(resultsDirectory, "one.json"), "{}");

    await expect(
      resolveResultFiles(["../eval-results/*.json"], {
        cwd: workspaceDirectory,
      }),
    ).resolves.toEqual([join(resultsDirectory, "one.json")]);
  });

  test("treats bracket characters as literal path characters", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-report-"));
    const resultFile = join(directory, "eval-results[1].json");
    await writeFile(resultFile, "{}");

    await expect(
      resolveResultFiles(["eval-results[1].json"], {
        cwd: directory,
      }),
    ).resolves.toEqual([resultFile]);
  });
});

describe("publishEvalReport", () => {
  test("includes the result filename when JSON parsing fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-report-"));
    const resultFile = join(directory, "broken.json");
    await writeFile(resultFile, "{");

    await expect(
      publishEvalReport({
        resultPatterns: [resultFile],
        summaryEnabled: false,
      }),
    ).rejects.toThrow(`Failed to read eval result file ${resultFile}`);
  });

  test("forwards summary detail limits when publishing reports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-report-"));
    const resultFile = join(directory, "vitest-results.json");
    const summaryFile = join(directory, "summary.md");
    const json = structuredClone(sampleJson);
    const assertion = json.testResults[0]?.assertionResults[0];
    if (!assertion) {
      throw new Error("sample assertion missing");
    }

    const evalMeta = (assertion.meta as any).eval;
    const harnessRun = (assertion.meta as any).harness.run;
    evalMeta.scores[0].metadata.rationale = "abcdefghijklmnopqrstuvwxyz";
    evalMeta.output = {
      value: "abcdefghijklmnopqrstuvwxyz",
    };
    harnessRun.session.events.push({
      type: "tool_call",
      id: "call_notify",
      name: "notifyCustomer",
      durationMs: 4,
    });

    await writeFile(resultFile, `${JSON.stringify(json)}\n`);

    await publishEvalReport({
      resultPatterns: [resultFile],
      summaryPath: summaryFile,
      maxReasonChars: 20,
      maxOutputChars: 30,
      maxToolCalls: 1,
    });

    const summary = await readFile(summaryFile, "utf8");

    expect(summary).toContain("abcde... [truncated]");
    expect(summary).not.toContain('"value": "abcdefghijklmnopqrstuvwxyz"');
    expect(summary).toContain("lookupInvoice  ok");
    expect(summary).not.toContain("createRefund");
    expect(summary).toContain("2 more tool calls omitted");
  });

  test("soft-fails a gated miss when a Check Run is published", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-report-"));
    const resultFile = join(directory, "vitest-results.json");
    await writeFile(resultFile, `${JSON.stringify(sampleJson)}\n`);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 55,
        html_url: "https://github.test/checks/55",
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishEvalReport({
      resultPatterns: [resultFile],
      summaryEnabled: false,
      annotations: false,
      checkRun: true,
      minPassRate: 1,
      token: "token",
      repository: "getsentry/vitest-evals",
      sha: "abc123",
    });

    expect(result.gate.ok).toBe(false);
    expect(result.checkRun).toMatchObject({
      status: "created",
      htmlUrl: "https://github.test/checks/55",
    });
    expect(result.shouldFail).toBe(false);
  });

  test("still fails the step when Check Run publishing is skipped", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-report-"));
    const resultFile = join(directory, "vitest-results.json");
    await writeFile(resultFile, `${JSON.stringify(sampleJson)}\n`);

    const result = await publishEvalReport({
      resultPatterns: [resultFile],
      summaryEnabled: false,
      annotations: false,
      checkRun: true,
      minPassRate: 1,
      token: "",
      repository: "getsentry/vitest-evals",
      sha: "abc123",
    });

    expect(result.gate.ok).toBe(false);
    expect(result.checkRun).toMatchObject({ status: "skipped" });
    expect(result.shouldFail).toBe(true);
  });

  test("honors softFail false even when a Check Run is published", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-report-"));
    const resultFile = join(directory, "vitest-results.json");
    await writeFile(resultFile, `${JSON.stringify(sampleJson)}\n`);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 56,
        html_url: "https://github.test/checks/56",
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishEvalReport({
      resultPatterns: [resultFile],
      summaryEnabled: false,
      annotations: false,
      checkRun: true,
      softFail: false,
      minPassRate: 1,
      token: "token",
      repository: "getsentry/vitest-evals",
      sha: "abc123",
    });

    expect(result.shouldFail).toBe(true);
  });
});

describe("normalizePathForGitHub", () => {
  test("only strips the exact workspace path prefix", () => {
    expect(
      normalizePathForGitHub("/repo/apps/demo/evals/refund.eval.ts", "/repo"),
    ).toBe("apps/demo/evals/refund.eval.ts");
    expect(normalizePathForGitHub("/repo-other/file.ts", "/repo")).toBe(
      "/repo-other/file.ts",
    );
  });
});

describe("parseCliArgs", () => {
  test("accepts a positional JSON report path", () => {
    expect(parseCliArgs(["custom-results.json"], {})).toMatchObject({
      resultPatterns: ["custom-results.json"],
    });
  });

  test("accepts multiple positional JSON report paths", () => {
    expect(
      parseCliArgs(["one-results.json", "two-results.json"], {}),
    ).toMatchObject({
      resultPatterns: ["one-results.json", "two-results.json"],
    });
  });

  test("accepts repeated JSON report flags", () => {
    expect(
      parseCliArgs(["--json", "one-results.json", "--json", "two-*.json"], {}),
    ).toMatchObject({
      resultPatterns: ["one-results.json", "two-*.json"],
    });
  });

  test("uses the default JSON report path when no path is provided", () => {
    expect(parseCliArgs([], {})).toMatchObject({
      resultPatterns: ["vitest-results.json"],
    });
  });

  test("lets CLI paths override environment defaults", () => {
    expect(
      parseCliArgs(["custom-results.json"], {
        VITEST_EVALS_JSON_REPORT: "env-results.json",
      }),
    ).toMatchObject({
      resultPatterns: ["custom-results.json"],
    });
  });

  test("stops parsing after help", () => {
    expect(parseCliArgs(["--help", "--invalid"], {})).toMatchObject({
      help: true,
      resultPatterns: ["vitest-results.json"],
    });
  });

  test("rejects non-integer numeric options", () => {
    expect(() => parseCliArgs(["--max-failures", "5abc"], {})).toThrow(
      "Invalid integer for --max-failures",
    );
    expect(() => parseCliArgs(["--max-failures", "1e2"], {})).toThrow(
      "Invalid integer for --max-failures",
    );
  });

  test("parses score gate options", () => {
    expect(
      parseCliArgs(
        ["--min-pass-rate", "0.8", "--min-score-average", "0.75"],
        {},
      ),
    ).toMatchObject({
      minPassRate: 0.8,
      minScoreAverage: 0.75,
    });
  });

  test("rejects invalid ratio options", () => {
    expect(() => parseCliArgs(["--min-pass-rate", "2"], {})).toThrow(
      "Invalid ratio for --min-pass-rate",
    );
  });
});

describe("evaluateEvalGate", () => {
  test("mirrors report status when no policy is configured", () => {
    const report = collectEvalReport(sampleJson, { workspace: "/repo" });
    const gate = evaluateEvalGate(report);

    expect(gate).toMatchObject({
      ok: false,
      enforced: false,
      status: "failed",
      title: "1 eval failure",
    });
  });

  test("passes a partial suite above the pass-rate floor", () => {
    const report = collectEvalReport(sampleJson, { workspace: "/repo" });
    report.totals.evalTotal = 10;
    report.totals.evalPassed = 8;
    report.totals.evalFailed = 2;
    report.score = { average: 0.84, minimum: 0.2 };

    const gate = evaluateEvalGate(report, { minPassRate: 0.8 });

    expect(gate.ok).toBe(true);
    expect(gate.enforced).toBe(true);
    expect(gate.passRate).toBe(0.8);
    expect(gate.title).toContain("80.0%");
    expect(gate.message).toContain("pass rate floor 80.0%");
  });

  test("fails a suite below the pass-rate floor with a titled annotation", () => {
    const report = collectEvalReport(sampleJson, { workspace: "/repo" });
    report.totals.evalTotal = 102;
    report.totals.evalPassed = 65;
    report.totals.evalFailed = 37;
    report.score = { average: 0.72, minimum: 0.2 };

    const gate = evaluateEvalGate(report, { minPassRate: 0.8 });

    expect(gate.ok).toBe(false);
    expect(gate.title).toBe("Eval pass rate 63.7% — required 80.0%");
    expect(renderGateWorkflowCommand(gate)).toBe(
      "::error title=Eval pass rate 63.7%25 — required 80.0%25::eval pass rate below floor: 65/102 passed (63.7%25), avg score 0.72; required >= 80.0%25",
    );
  });

  test("fails closed on non-eval failures even when pass rate is high", () => {
    const report = collectEvalReport(sampleJson, { workspace: "/repo" });
    report.totals.evalTotal = 10;
    report.totals.evalPassed = 10;
    report.totals.evalFailed = 0;
    report.totals.failed = 1;
    report.failures = [];
    report.score = { average: 0.95, minimum: 0.9 };

    const gate = evaluateEvalGate(report, { minPassRate: 0.8 });

    expect(gate.ok).toBe(false);
    expect(gate.title).toBe("Eval report hard failure");
    expect(gate.message).toContain("non-eval test failure");
  });

  test("treats fail-on-failures as a 100% pass-rate floor", () => {
    const report = collectEvalReport(sampleJson, { workspace: "/repo" });
    const gate = evaluateEvalGate(report, { failOnFailures: true });

    expect(gate.ok).toBe(false);
    expect(gate.enforced).toBe(true);
    expect(gate.title).toContain("required 100.0%");
  });

  test("formats percentages with one decimal place", () => {
    expect(formatPercent(0.8)).toBe("80.0%");
    expect(formatPercent(0.637)).toBe("63.7%");
    expect(formatPercent(null)).toBe("n/a");
  });
});

describe("parseActionInputs", () => {
  test("parses semantic action inputs", () => {
    expect(
      parseActionInputs({
        INPUT_RESULTS: "eval-results/*.json\nother-results.json",
        "INPUT_PUBLISH-CHECK": "true",
        "INPUT_GITHUB-TOKEN": "token",
        "INPUT_FAIL-ON-FAILURES": "true",
        "INPUT_SOFT-FAIL": "false",
        "INPUT_MIN-PASS-RATE": "0.8",
        "INPUT_MIN-SCORE-AVERAGE": "0.75",
        "INPUT_CHECK-NAME": "sharded evals",
        "INPUT_MAX-FAILURES": "5",
        INPUT_SHA: "deadbeef",
      }),
    ).toMatchObject({
      results: ["eval-results/*.json", "other-results.json"],
      publishSummary: true,
      publishAnnotations: true,
      publishCheck: true,
      githubToken: "token",
      failOnFailures: true,
      softFail: false,
      minPassRate: 0.8,
      minScoreAverage: 0.75,
      checkName: "sharded evals",
      maxFailures: 5,
      sha: "deadbeef",
    });
  });

  test("trims action inputs and accepts case-insensitive booleans", () => {
    expect(
      parseActionInputs({
        INPUT_RESULTS: " ./eval-results/*.json ",
        "INPUT_PUBLISH-CHECK": " TRUE ",
        "INPUT_PUBLISH-SUMMARY": " False ",
        "INPUT_MAX-FAILURES": " 5 ",
      }),
    ).toMatchObject({
      results: ["./eval-results/*.json"],
      publishSummary: false,
      publishCheck: true,
      maxFailures: 5,
    });
  });

  test("keeps commas inside action result paths", () => {
    expect(
      parseActionInputs({
        INPUT_RESULTS: "eval-results/report,v2.json\neval-results/*.json",
      }),
    ).toMatchObject({
      results: ["eval-results/report,v2.json", "eval-results/*.json"],
    });
  });

  test("does not fall back to env token when the token input is blank", () => {
    expect(
      parseActionInputs({
        "INPUT_GITHUB-TOKEN": "",
        GITHUB_TOKEN: "env-token",
      }),
    ).toMatchObject({
      githubToken: "",
    });
  });

  test("rejects non-integer numeric inputs", () => {
    expect(() =>
      parseActionInputs({
        INPUT_MAX_FAILURES: "5abc",
      }),
    ).toThrow("Invalid integer input: 5abc");
    expect(() =>
      parseActionInputs({
        INPUT_MAX_FAILURES: "1e2",
      }),
    ).toThrow("Invalid integer input: 1e2");
  });

  test("rejects invalid ratio inputs", () => {
    expect(() =>
      parseActionInputs({
        "INPUT_MIN-PASS-RATE": "1.5",
      }),
    ).toThrow("Invalid ratio input: 1.5");
    expect(() =>
      parseActionInputs({
        "INPUT_MIN-SCORE-AVERAGE": "abc",
      }),
    ).toThrow("Invalid ratio input: abc");
  });
});

describe("formatDuration", () => {
  test("carries rounded seconds into minutes", () => {
    expect(formatDuration(119_500)).toBe("2m 0s");
  });
});

describe("renderJobSummary", () => {
  test("renders the summary table before result details", () => {
    const report = collectEvalReport(sampleJson, {
      workspace: "/repo",
    });
    const summary = renderJobSummary(report);

    expect(summary).toContain("# vitest-evals");
    expect(summary).toContain("## Results");
    expect(summary.indexOf("| Metric | Value |")).toBeLessThan(
      summary.indexOf("## Results"),
    );
    expect(summary).toContain("### Failures");
    expect(summary).toContain("<details>");
    expect(summary).toContain(
      "<summary>1. refund agent &gt; rejects fraud - StructuredOutputJudge - 0.20</summary>",
    );
    expect(summary).toContain("| Metric | Value |");
    expect(summary).toContain("| Status | failed |");
    expect(summary).toContain("| Evals | 0 passed, 1 failed, 1 total |");
    expect(summary).toContain("| Pass Rate | 0.0% |");
    expect(summary).not.toContain("| Tests |");
    expect(summary).toContain("| Score | avg 0.20, min 0.20 |");
    expect(summary).not.toContain("| Usage |");
    expect(summary).toContain("## Scores");
    expect(summary.indexOf("## Scores")).toBeLessThan(
      summary.indexOf("## Results"),
    );
    expect(summary).toContain("20-39%  | #################### 1");
    expect(summary).not.toContain("### Details");
    expect(summary).not.toContain("| Test |");

    const details = summary.match(/<details>[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(details.match(/```/g)).toHaveLength(2);
    expect(details).toContain("```text\nResult\n------");
    expect(details).toContain("Case      1. refund agent > rejects fraud");
    expect(details).toContain("Location  apps/demo/evals/refund.eval.ts:42");
    expect(details).toContain("Usage     1,220 tokens, 2 tools, 4.1s");
    expect(details).toContain("Reason\n------");
    expect(details).toContain("Expected status=approved, got status=denied");
    expect(details).toContain("Judge                  Score");
    expect(details).toContain("StructuredOutputJudge  0.20");
    expect(details).toContain("Final Output\n------------");
    expect(details).toContain('"reason": "invoice is not refundable"');
    expect(details).toContain("Tool           Status");
    expect(details).toContain(
      "createRefund   error: skipped: invoice not refundable",
    );
    expect(details).not.toContain("Scores\n------");
    expect(details).not.toContain("Tool Calls\n----------");
    expect(details).not.toContain("Reason:\n\n```text");
    expect(details).not.toContain("Final:\n\n```text");
  });

  test("surfaces non-eval failures without pretending the run passed", () => {
    const json: VitestJsonReport = {
      ...sampleJson,
      numFailedTests: 1,
      numPassedTests: 0,
      numTotalTests: 1,
      success: false,
      testResults: [
        {
          name: "/repo/src/plain.test.ts",
          status: "failed",
          message: "",
          startTime: 1000,
          endTime: 1100,
          assertionResults: [
            {
              ancestorTitles: [],
              fullName: "plain failure",
              title: "plain failure",
              status: "failed",
              duration: 10,
              failureMessages: ["plain failure"],
              location: {
                line: 4,
                column: 1,
              },
              tags: [],
              meta: {},
            },
          ],
        },
      ],
    };

    const summary = renderJobSummary(
      collectEvalReport(json, {
        workspace: "/repo",
      }),
    );

    expect(summary).toContain("| Status | failed |");
    expect(summary).toContain("| Evals | 0 passed, 0 failed, 0 total |");
    expect(summary).not.toContain("| Tests |");
    expect(summary).toContain("| Other Failures | 1 non-eval test failure |");
    expect(summary).toContain("## Results");
    expect(summary).toContain("No eval metadata was found");
  });

  test("escapes table cell control characters", () => {
    const report = collectEvalReport(sampleJson, {
      workspace: "/repo",
    });
    report.status = "failed \\ | escaped" as typeof report.status;

    expect(renderJobSummary(report)).toContain(
      String.raw`| Status | failed \\ \| escaped |`,
    );
  });
});

describe("renderWorkflowCommands", () => {
  test("emits escaped terse annotations", () => {
    const json = structuredClone(sampleJson);
    const evalMeta = (json.testResults[0]?.assertionResults[0]?.meta as any)
      .eval;
    evalMeta.scores[0].metadata.rationale =
      "bad value: expected, got 20%\nwith extra detail";
    const report = collectEvalReport(json, {
      workspace: "/repo",
    });

    expect(renderWorkflowCommands(report)).toEqual([
      "::error file=apps/demo/evals/refund.eval.ts,line=42,col=3,title=vitest-evals::refund agent > rejects fraud - score 0.20 - StructuredOutputJudge - bad value: expected, got 20%25",
    ]);
  });

  test("demotes case misses to warnings when the suite gate passed", () => {
    const report = collectEvalReport(sampleJson, {
      workspace: "/repo",
    });
    report.totals.evalTotal = 10;
    report.totals.evalPassed = 9;
    report.totals.evalFailed = 1;
    report.score = { average: 0.91, minimum: 0.2 };
    const gate = evaluateEvalGate(report, { minPassRate: 0.8 });

    expect(gate.ok).toBe(true);
    expect(renderWorkflowCommands(report, { gate })[0]).toMatch(/^::warning /);
    expect(buildCheckAnnotations(report, { gate })[0]?.annotation_level).toBe(
      "warning",
    );
  });

  test("uses the canonical score formatter in annotations", () => {
    const json = structuredClone(sampleJson);
    const evalMeta = (json.testResults[0]?.assertionResults[0]?.meta as any)
      .eval;
    evalMeta.avgScore = Number.NaN;
    evalMeta.scores = [];
    const report = collectEvalReport(json, {
      workspace: "/repo",
    });

    expect(renderWorkflowCommands(report)[0]).toContain("score n/a");
  });
});

describe("buildCheckAnnotations", () => {
  test("caps Check Run annotations at GitHub's per-request limit", () => {
    const report = collectEvalReport(sampleJson, {
      workspace: "/repo",
    });
    const failure = report.failures[0]!;
    report.failures = Array.from({ length: 60 }, (_, index) => ({
      ...failure,
      id: `${failure.id}:${index}`,
    }));

    expect(buildCheckAnnotations(report, { maxAnnotations: 100 })).toHaveLength(
      50,
    );
  });

  test("labels pending tool calls in Check Run annotations", () => {
    const json = structuredClone(sampleJson);
    const harnessRun = (json.testResults[0]?.assertionResults[0]?.meta as any)
      .harness.run;
    harnessRun.session.events.push({
      type: "tool_call",
      id: "call_email",
      name: "emailCustomer",
      durationMs: 4,
    });
    const report = collectEvalReport(json, {
      workspace: "/repo",
    });

    const toolCalls = report.failures[0]?.toolCalls ?? [];
    expect(toolCalls[toolCalls.length - 1]).toMatchObject({
      name: "emailCustomer",
      durationMs: 4,
      status: "pending",
    });
    expect(buildCheckAnnotations(report)[0]?.raw_details).toContain(
      "- emailCustomer: pending",
    );
  });
});

describe("resolveCheckSha", () => {
  test("prefers explicit sha over environment values", () => {
    expect(
      resolveCheckSha(
        {
          GITHUB_PR_HEAD_SHA: "env-head",
          GITHUB_SHA: "merge",
        },
        { sha: "explicit" },
      ),
    ).toBe("explicit");
  });

  test("prefers GITHUB_PR_HEAD_SHA over GITHUB_SHA", () => {
    expect(
      resolveCheckSha({
        GITHUB_PR_HEAD_SHA: "env-head",
        GITHUB_SHA: "merge",
      }),
    ).toBe("env-head");
  });

  test("reads pull_request.head.sha from the event payload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-event-"));
    const eventPath = join(directory, "event.json");
    await writeFile(
      eventPath,
      `${JSON.stringify({
        pull_request: { head: { sha: "pr-head-sha" } },
      })}\n`,
    );

    expect(
      resolveCheckSha(
        {
          GITHUB_SHA: "merge-sha",
          GITHUB_EVENT_PATH: eventPath,
        },
        { eventPath },
      ),
    ).toBe("pr-head-sha");
  });

  test("falls back to GITHUB_SHA", () => {
    expect(resolveCheckSha({ GITHUB_SHA: "merge-sha" })).toBe("merge-sha");
  });
});

describe("resolveCheckDetailsUrl", () => {
  test("prefers an explicit details URL", () => {
    expect(
      resolveCheckDetailsUrl(
        {
          GITHUB_SERVER_URL: "https://github.com",
          GITHUB_REPOSITORY: "getsentry/vitest-evals",
          GITHUB_RUN_ID: "99",
        },
        { detailsUrl: "https://example.test/details" },
      ),
    ).toBe("https://example.test/details");
  });

  test("builds a workflow run URL from Actions env", () => {
    expect(
      resolveCheckDetailsUrl({
        GITHUB_SERVER_URL: "https://github.com/",
        GITHUB_REPOSITORY: "getsentry/vitest-evals",
        GITHUB_RUN_ID: "123",
        GITHUB_JOB: "report",
      }),
    ).toBe("https://github.com/getsentry/vitest-evals/actions/runs/123");
  });
});

describe("publishCheckRun", () => {
  test("skips when GitHub configuration is missing", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GITHUB_REPOSITORY", "");
    vi.stubEnv("GITHUB_SHA", "");
    const report = collectEvalReport(sampleJson);

    await expect(publishCheckRun(report)).resolves.toEqual({
      status: "skipped",
      reason: "missing GITHUB_TOKEN",
    });
  });

  test("creates a Check Run with annotations", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 123,
        html_url: "https://github.test/checks/123",
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const report = collectEvalReport(sampleJson, {
      workspace: "/repo",
    });
    const result = await publishCheckRun(report, {
      token: "token",
      repository: "getsentry/vitest-evals",
      sha: "abc123",
      detailsUrl: "https://github.test/actions/runs/9",
    });

    expect(result).toEqual({
      status: "created",
      id: 123,
      htmlUrl: "https://github.test/checks/123",
      sha: "abc123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe(
      "https://api.github.com/repos/getsentry/vitest-evals/check-runs",
    );
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toMatchObject({
      name: "vitest-evals",
      head_sha: "abc123",
      details_url: "https://github.test/actions/runs/9",
      status: "completed",
      conclusion: "failure",
      output: {
        title: "1 eval failure",
        annotations: [
          {
            path: "apps/demo/evals/refund.eval.ts",
            start_line: 42,
            annotation_level: "failure",
          },
        ],
      },
    });
  });

  test("uses pull_request head sha when only GITHUB_SHA is the merge commit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-event-"));
    const eventPath = join(directory, "event.json");
    await writeFile(
      eventPath,
      `${JSON.stringify({
        pull_request: { head: { sha: "pr-head" } },
      })}\n`,
    );
    vi.stubEnv("GITHUB_EVENT_PATH", eventPath);
    vi.stubEnv("GITHUB_SHA", "merge-sha");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 321,
        html_url: "https://github.test/checks/321",
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const report = collectEvalReport(sampleJson);
    await publishCheckRun(report, {
      token: "token",
      repository: "getsentry/vitest-evals",
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(request.body).head_sha).toBe("pr-head");
  });

  test("uses the configured gate for Check Run conclusion and title", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 126,
        html_url: "https://github.test/checks/126",
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const report = collectEvalReport(sampleJson, {
      workspace: "/repo",
    });
    report.totals.evalTotal = 10;
    report.totals.evalPassed = 9;
    report.totals.evalFailed = 1;
    report.score = { average: 0.91, minimum: 0.2 };
    const gate = evaluateEvalGate(report, { minPassRate: 0.8 });

    await publishCheckRun(report, {
      token: "token",
      repository: "getsentry/vitest-evals",
      sha: "abc123",
      gate,
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const body = JSON.parse(request.body);
    expect(body.conclusion).toBe("success");
    expect(body.output.title).toContain("90.0%");
    expect(body.output.summary).toContain("| Status | passed |");
    expect(body.output.summary).toContain("| Pass Rate | 90.0% |");
    expect(body.output.summary).toContain("| Gate |");
    expect(body.output.summary).toContain("### Quality Misses");
    expect(body.output.annotations[0]?.annotation_level).toBe("warning");
  });

  test("caps Check Run summary at GitHub's summary length limit", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 125,
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const report = collectEvalReport(sampleJson, {
      workspace: "/repo",
    });
    report.failures[0]!.primaryFailure = {
      ...report.failures[0]!.primaryFailure,
      reason: "x".repeat(70_000),
    };

    await publishCheckRun(report, {
      token: "token",
      repository: "getsentry/vitest-evals",
      sha: "abc123",
      maxReasonChars: 70_000,
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const body = JSON.parse(request.body);
    expect(body.output.summary).toHaveLength(64_000);
    expect(
      body.output.summary.endsWith("\n\n[truncated for GitHub Check Run]\n"),
    ).toBe(true);
  });

  test("uses a non-eval failure title for failed runs without eval failures", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 124,
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const report = collectEvalReport({
      ...sampleJson,
      success: false,
      testResults: [
        {
          name: "/repo/src/plain.test.ts",
          status: "failed",
          message: "",
          startTime: 1000,
          endTime: 1100,
          assertionResults: [
            {
              ancestorTitles: [],
              fullName: "plain failure",
              title: "plain failure",
              status: "failed",
              duration: 10,
              failureMessages: ["plain failure"],
              location: {
                line: 4,
                column: 1,
              },
              tags: [],
              meta: {},
            },
          ],
        },
      ],
    });

    await publishCheckRun(report, {
      token: "token",
      repository: "getsentry/vitest-evals",
      sha: "abc123",
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(request.body)).toMatchObject({
      conclusion: "failure",
      output: {
        title: "Vitest run failed",
        annotations: [],
      },
    });
  });
});
