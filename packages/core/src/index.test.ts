import { describe, expect, test } from "vitest";
import {
  assistantMessages,
  collectReportWorkspace,
  failedSpans,
  latestAssistantMessageContent,
  messagesByRole,
  parseVitestJsonReport,
  readEvalTaskMeta,
  spans,
  spansByKind,
  systemMessages,
  toolCalls,
  toolMessages,
  traceSpans,
  UsageSummarySchema,
  userMessages,
  type VitestJsonReport,
} from "./index";

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
              },
              scores: [
                {
                  name: "StructuredOutputJudge",
                  score: 0.2,
                  metadata: {
                    rationale: "status mismatch",
                  },
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
                  provider: "anthropic",
                  model: "claude-sonnet-4-5",
                  totalTokens: 1220,
                  toolCalls: 1,
                  metadata: {
                    cached: true,
                  },
                },
                timings: {
                  totalMs: 4100,
                },
                session: {
                  messages: [
                    {
                      role: "user",
                      content: "Refund invoice inv_404",
                    },
                    {
                      role: "assistant",
                      content: "denied",
                      toolCalls: [
                        {
                          name: "lookupInvoice",
                          arguments: {
                            invoiceId: "inv_404",
                          },
                          result: {
                            refundable: false,
                          },
                          durationMs: 6,
                        },
                      ],
                    },
                  ],
                },
                traces: [
                  {
                    id: "trace_1",
                    name: "pi-ai",
                    durationMs: 4100,
                    spans: [
                      {
                        id: "trace_1:run",
                        traceId: "trace_1",
                        name: "pi-ai",
                        kind: "run",
                        durationMs: 4100,
                        attributes: {
                          "gen_ai.workflow.name": "pi-ai",
                        },
                      },
                      {
                        id: "trace_1:tool:1",
                        traceId: "trace_1",
                        parentId: "trace_1:run",
                        name: "lookupInvoice",
                        kind: "tool",
                        durationMs: 6,
                      },
                    ],
                  },
                ],
                artifacts: {
                  invoiceId: "inv_404",
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
          meta: {},
        },
      ],
    },
  ],
};

describe("parseVitestJsonReport", () => {
  test("validates Vitest JSON reports", () => {
    expect(parseVitestJsonReport(sampleJson)).toMatchObject({
      success: false,
      numTotalTests: 2,
    });
  });

  test("explains invalid reports", () => {
    expect(() => parseVitestJsonReport({ success: true })).toThrow(
      "Invalid Vitest JSON report",
    );
  });

  test("tolerates missing or invalid file timing values", () => {
    const report = parseVitestJsonReport({
      ...sampleJson,
      testResults: [
        {
          ...sampleJson.testResults[0]!,
          startTime: null,
          endTime: Number.POSITIVE_INFINITY,
        },
        {
          assertionResults: [],
          message: "",
          name: "/repo/apps/demo/evals/missing-timing.eval.ts",
          status: "passed",
        },
      ],
    });

    expect(report.testResults[0]?.startTime).toBeUndefined();
    expect(report.testResults[0]?.endTime).toBeUndefined();
    expect(report.testResults[1]?.startTime).toBeUndefined();
    expect(report.testResults[1]?.endTime).toBeUndefined();
    expect(collectReportWorkspace(report).runs[0]?.durationMs).toBeUndefined();
  });
});

describe("readEvalTaskMeta", () => {
  test("reads eval and harness metadata from assertion meta", () => {
    const assertion = sampleJson.testResults[0]!.assertionResults[0]!;

    expect(readEvalTaskMeta(assertion.meta)).toMatchObject({
      eval: {
        avgScore: 0.2,
      },
      harness: {
        name: "pi-ai",
      },
    });
  });

  test("ignores metadata without eval or harness fields", () => {
    expect(readEvalTaskMeta({ retry: 1 })).toBeUndefined();
  });

  test("preserves eval metadata with null scores and recorded tool calls", () => {
    expect(
      readEvalTaskMeta({
        eval: {
          avgScore: null,
          output: {
            status: "skipped",
          },
          scores: [],
          toolCalls: [
            {
              name: "lookupInvoice",
            },
          ],
        },
      }),
    ).toMatchObject({
      eval: {
        avgScore: null,
        output: {
          status: "skipped",
        },
        toolCalls: [
          {
            name: "lookupInvoice",
          },
        ],
      },
    });
  });

  test("defaults missing harness errors for legacy run metadata", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "legacy",
          run: {
            session: {
              messages: [],
            },
            usage: {
              totalTokens: 42,
            },
          },
        },
      }),
    ).toMatchObject({
      harness: {
        name: "legacy",
        run: {
          errors: [],
          usage: {
            totalTokens: 42,
          },
        },
      },
    });
  });
});

describe("UsageSummarySchema", () => {
  test("keeps provider-specific usage data under metadata", () => {
    expect(
      UsageSummarySchema.safeParse({
        totalTokens: 120,
        estimatedCostUsd: 0.02,
      }).success,
    ).toBe(false);

    expect(
      UsageSummarySchema.safeParse({
        totalTokens: 120,
        metadata: {
          estimatedCostUsd: 0.02,
        },
      }).success,
    ).toBe(true);
  });
});

describe("collectReportWorkspace", () => {
  test("collects full-fidelity harness run data from Vitest JSON", () => {
    const workspace = collectReportWorkspace(
      {
        report: sampleJson,
        source: "vitest-results.json",
      },
      {
        workspace: "/repo",
      },
    );

    expect(workspace.runs).toEqual([
      {
        id: "vitest-results.json",
        source: "vitest-results.json",
        status: "failed",
        startedAt: 1000,
        durationMs: 4500,
        totals: {
          total: 2,
          passed: 1,
          failed: 1,
          skipped: 0,
          evalTotal: 1,
          evalPassed: 0,
          evalFailed: 1,
        },
      },
    ]);
    expect(workspace.schemaVersion).toBe(1);
    expect(workspace.cases).toHaveLength(1);
    expect(workspace.cases[0]).toMatchObject({
      displayFile: "apps/demo/evals/refund.eval.ts",
      fullName: "refund agent rejects fraud",
      ancestorTitles: ["refund agent"],
      displayName: "refund agent > rejects fraud",
      harness: {
        run: {
          traces: [
            {
              id: "trace_1",
              spans: [
                {
                  id: "trace_1:run",
                  kind: "run",
                },
                {
                  id: "trace_1:tool:1",
                  kind: "tool",
                },
              ],
            },
          ],
          artifacts: {
            invoiceId: "inv_404",
          },
        },
      },
    });
  });

  test("collects eval-only cases when avgScore is null", () => {
    const json = structuredClone(sampleJson);
    json.testResults[0]!.assertionResults = [
      {
        ancestorTitles: ["refund agent"],
        fullName: "refund agent skipped case",
        title: "skipped case",
        status: "skipped",
        duration: 0,
        failureMessages: [],
        meta: {
          eval: {
            avgScore: null,
            scores: [],
            thresholdFailed: false,
          },
        },
      },
    ];

    const workspace = collectReportWorkspace(json);

    expect(workspace.cases).toHaveLength(1);
    expect(workspace.cases[0]?.eval?.avgScore).toBeNull();
    expect(workspace.runs[0]?.totals).toMatchObject({
      evalTotal: 1,
      evalPassed: 0,
      evalFailed: 0,
    });
  });
});

describe("normalized run helpers", () => {
  test("reads shared session and trace details", () => {
    const workspace = collectReportWorkspace(sampleJson);
    const run = workspace.cases[0]!.harness!.run!;

    expect(toolCalls(run.session).map((call) => call.name)).toEqual([
      "lookupInvoice",
    ]);
    expect(
      assistantMessages(run.session).map((message) => message.role),
    ).toEqual(["assistant"]);
    expect(userMessages(run.session).map((message) => message.role)).toEqual([
      "user",
    ]);
    expect(systemMessages(run.session)).toEqual([]);
    expect(toolMessages(run.session)).toEqual([]);
    expect(messagesByRole(run.session, "assistant")).toEqual(
      assistantMessages(run.session),
    );
    expect(latestAssistantMessageContent(run.session)).toBe("denied");
    expect(spans(run).map((span) => span.id)).toEqual([
      "trace_1:run",
      "trace_1:tool:1",
    ]);
    expect(traceSpans(run).map((span) => span.id)).toEqual([
      "trace_1:run",
      "trace_1:tool:1",
    ]);
    expect(spansByKind(run, "tool").map((span) => span.name)).toEqual([
      "lookupInvoice",
    ]);
    expect(failedSpans(run)).toEqual([]);
  });
});
