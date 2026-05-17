import { afterEach, describe, expect, test, vi } from "vitest";
import { renderWorkflowCommands } from "./annotations";
import { parseCliArgs } from "./cli-options";
import { collectEvalReport } from "./collect";
import { publishCheckRun } from "./github";
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
                  messages: [
                    {
                      role: "assistant",
                      toolCalls: [
                        {
                          name: "lookupInvoice",
                          durationMs: 6,
                        },
                        {
                          name: "createRefund",
                          error: {
                            message: "skipped: invoice not refundable",
                          },
                        },
                      ],
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
    });
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
      jsonPath: "custom-results.json",
    });
  });

  test("uses the default JSON report path when no path is provided", () => {
    expect(parseCliArgs([], {})).toMatchObject({
      jsonPath: "vitest-results.json",
    });
  });

  test("lets CLI paths override environment defaults", () => {
    expect(
      parseCliArgs(["custom-results.json"], {
        VITEST_EVALS_JSON_REPORT: "env-results.json",
      }),
    ).toMatchObject({
      jsonPath: "custom-results.json",
    });
  });

  test("stops parsing after help", () => {
    expect(parseCliArgs(["--help", "--invalid"], {})).toMatchObject({
      help: true,
      jsonPath: "vitest-results.json",
    });
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
    expect(summary).toContain("| Tests | 1 passed, 1 failed, 2 total |");
    expect(summary).toContain("| Evals | 0 passed, 1 failed, 1 total |");
    expect(summary).toContain("| Score | avg 0.20, min 0.20 |");
    expect(summary).toContain("Score distribution");
    expect(summary.indexOf("Score distribution")).toBeLessThan(
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

describe("publishCheckRun", () => {
  test("skips when GitHub configuration is missing", async () => {
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
    });

    expect(result).toEqual({
      status: "created",
      id: 123,
      htmlUrl: "https://github.test/checks/123",
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
