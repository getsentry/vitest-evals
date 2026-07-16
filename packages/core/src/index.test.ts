import { describe, expect, test } from "vitest";
import {
  assistantMessages,
  collectReportWorkspace,
  failedSpans,
  HarnessRunSchema,
  latestAssistantMessageContent,
  messagesToTranscriptEvents,
  messagesByRole,
  parseVitestJsonReport,
  readEvalTaskMeta,
  spans,
  spansByKind,
  systemMessages,
  toolCalls,
  toolMessages,
  traceSpans,
  TranscriptToolResultEventSchema,
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
                  events: [
                    {
                      type: "message",
                      role: "user",
                      content: "Refund invoice inv_404",
                    },
                    {
                      type: "message",
                      role: "assistant",
                      content: "denied",
                    },
                    {
                      type: "tool_call",
                      id: "call_lookup",
                      name: "lookupInvoice",
                      arguments: {
                        invoiceId: "inv_404",
                      },
                      durationMs: 6,
                    },
                    {
                      type: "tool_result",
                      toolCallId: "call_lookup",
                      name: "lookupInvoice",
                      content: {
                        refundable: false,
                      },
                      durationMs: 6,
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
  test("requires session events in the public harness run schema", () => {
    expect(() =>
      HarnessRunSchema.parse({
        session: {},
        usage: {},
        errors: [],
      }),
    ).toThrow();
  });

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
              status: "pending",
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
            status: "pending",
          },
        ],
      },
    });
  });

  test("rejects persisted eval tool calls without status", () => {
    expect(
      readEvalTaskMeta({
        eval: {
          avgScore: 1,
          toolCalls: [
            {
              name: "lookupInvoice",
            },
            {
              name: "createRefund",
              error: {
                message: "amount mismatch",
              },
            },
          ],
        },
      }),
    ).toBeUndefined();
  });

  test("drops persisted session messages instead of adapting old transcript shapes", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "persisted",
          run: {
            session: {
              messages: [
                {
                  role: "user",
                  content: "Refund invoice inv_123",
                },
                {
                  role: "assistant",
                  content: "Checking invoice",
                  toolCalls: [
                    {
                      id: "call_lookup",
                      name: "lookupInvoice",
                      arguments: {
                        invoiceId: "inv_123",
                      },
                    },
                  ],
                },
                {
                  role: "tool",
                  toolCallId: "call_lookup",
                  name: "lookupInvoice",
                  content: {
                    refundable: true,
                  },
                },
              ],
            },
            usage: {},
          },
        },
      }),
    ).toBeUndefined();
  });

  test("drops persisted inline message tool calls", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "message-transport",
          run: {
            session: {
              messages: [
                {
                  role: "assistant",
                  content: "Checking invoice",
                  toolCalls: [
                    {
                      name: "lookupInvoice",
                      result: {
                        refundable: true,
                      },
                    },
                  ],
                },
              ],
            },
            usage: {},
          },
        },
      }),
    ).toBeUndefined();
  });

  test("drops separated tool messages without tool call ids", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "message-transport",
          run: {
            session: {
              messages: [
                {
                  role: "assistant",
                  toolCalls: [
                    {
                      name: "lookupInvoice",
                    },
                  ],
                },
                {
                  role: "tool",
                  name: "lookupInvoice",
                  content: {
                    refundable: true,
                  },
                },
              ],
            },
            usage: {},
          },
        },
      }),
    ).toBeUndefined();
  });

  test("drops persisted message transport that converts to no events", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "message-transport",
          run: {
            session: {
              messages: [{ role: "assistant" }],
            },
            usage: {},
          },
        },
      }),
    ).toBeUndefined();
  });

  test("drops persisted message transport with non-object entries", () => {
    expect(() =>
      readEvalTaskMeta({
        harness: {
          name: "message-transport",
          run: {
            session: {
              messages: [null, 123, "nope"],
            },
            usage: {},
          },
        },
      }),
    ).not.toThrow();

    expect(
      readEvalTaskMeta({
        harness: {
          name: "message-transport",
          run: {
            session: {
              messages: [null, 123, "nope"],
            },
            usage: {},
          },
        },
      }),
    ).toBeUndefined();
  });

  test("rejects harness runs without errors", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "persisted",
          run: {
            session: {
              events: [],
            },
            usage: {
              totalTokens: 42,
            },
          },
        },
      }),
    ).toBeUndefined();
  });

  test("rejects harness runs without usage", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "partial",
          run: {
            session: {
              events: [{ type: "message", role: "user", content: "hello" }],
            },
          },
        },
      }),
    ).toBeUndefined();
  });

  test("rejects harness runs with invalid trace data", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "partial",
          run: {
            session: {
              events: [{ type: "message", role: "user", content: "hello" }],
            },
            usage: {
              totalTokens: 42,
            },
            traces: [
              {
                spans: [
                  {
                    name: 123,
                  },
                ],
              },
            ],
          },
        },
      }),
    ).toBeUndefined();
  });

  test("rejects harness metadata when run metadata cannot be parsed", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "partial",
          run: {
            session: "invalid",
          },
        },
      }),
    ).toBeUndefined();
  });

  test("does not default malformed persisted sessions to empty events", () => {
    expect(
      readEvalTaskMeta({
        harness: {
          name: "malformed",
          run: {
            session: {},
          },
        },
      }),
    ).toBeUndefined();
  });

  test("rejects metadata blocks with unknown keys", () => {
    const meta = readEvalTaskMeta({
      eval: {
        avgScore: 1,
        estimatedCostUsd: 0.02,
        scores: [
          {
            name: "StructuredOutputJudge",
            score: 1,
            unexpected: true,
          },
        ],
        toolCalls: [
          {
            name: "lookupInvoice",
            status: "pending",
            unexpected: true,
          },
        ],
      },
      harness: {
        name: "persisted",
        run: {
          extraRunField: true,
          session: {
            extraSessionField: true,
            events: [
              {
                type: "tool_call",
                extraMessageField: true,
                id: "call_lookup",
                name: "lookupInvoice",
                unexpected: true,
              },
            ],
          },
          usage: {
            estimatedCostUsd: 0.02,
            totalTokens: 42,
          },
        },
      },
    });

    expect(meta).toBeUndefined();
  });
});

describe("messagesToTranscriptEvents", () => {
  test("accepts message tool calls", () => {
    expect(
      messagesToTranscriptEvents([
        {
          role: "assistant",
          content: "Checking invoice",
          toolCalls: [
            {
              id: "call_lookup",
              name: "lookupInvoice",
              arguments: {
                invoiceId: "inv_123",
              },
            },
          ],
        },
        {
          role: "tool",
          toolCallId: "call_lookup",
          content: {
            refundable: true,
          },
        },
      ]),
    ).toEqual([
      {
        type: "message",
        role: "assistant",
        content: "Checking invoice",
      },
      {
        type: "tool_call",
        id: "call_lookup",
        name: "lookupInvoice",
        arguments: {
          invoiceId: "inv_123",
        },
      },
      {
        type: "tool_result",
        toolCallId: "call_lookup",
        content: {
          refundable: true,
        },
      },
    ]);
  });

  test("accepts AI SDK-style content tool parts", () => {
    expect(
      messagesToTranscriptEvents([
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Checking invoice",
            },
            {
              type: "tool-call",
              toolCallId: "call_lookup",
              toolName: "lookupInvoice",
              input: {
                invoiceId: "inv_123",
              },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_lookup",
              toolName: "lookupInvoice",
              output: {
                refundable: true,
              },
            },
          ],
        },
      ]),
    ).toEqual([
      {
        type: "message",
        role: "assistant",
        content: "Checking invoice",
      },
      {
        type: "tool_call",
        id: "call_lookup",
        name: "lookupInvoice",
        arguments: {
          invoiceId: "inv_123",
        },
      },
      {
        type: "tool_result",
        toolCallId: "call_lookup",
        name: "lookupInvoice",
        content: {
          refundable: true,
        },
      },
    ]);
  });

  test("rejects mixed assistant tool call representations", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_lookup",
              toolName: "lookupInvoice",
              input: {
                invoiceId: "inv_123",
              },
            },
          ],
          toolCalls: [
            {
              id: "call_lookup",
              name: "lookupInvoice",
              arguments: {
                invoiceId: "inv_123",
              },
            },
          ],
        },
      ]),
    ).toThrow(
      "Assistant messages must not mix tool-call content parts with toolCalls.",
    );
  });

  test("keeps system and user JSON arrays as message content", () => {
    expect(
      messagesToTranscriptEvents([
        {
          role: "user",
          content: [
            {
              type: "tool-call",
              toolCallId: "not-a-tool",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "tool-call",
            toolCallId: "not-a-tool",
          },
        ],
      },
    ]);
  });

  test("requires separated tool result ids", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "tool",
          content: {
            refundable: true,
          },
        } as never,
      ]),
    ).toThrow("Tool result messages must include toolCallId.");
  });

  test("rejects snake_case top-level tool result ids", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "tool",
          tool_call_id: "call_lookup",
          content: {
            refundable: true,
          },
        } as never,
      ]),
    ).toThrow("Tool result messages must include toolCallId.");
  });

  test("rejects non-string top-level tool result ids", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "tool",
          toolCallId: undefined,
          content: {
            refundable: true,
          },
        } as never,
      ]),
    ).toThrow("Tool result messages must include toolCallId.");
  });

  test("rejects mixed tool result content part ids", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "tool",
          toolCallId: "call_lookup",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_lookup",
              output: {
                refundable: true,
              },
            },
          ],
        },
      ]),
    ).toThrow(
      "Tool-result content parts must not include top-level toolCallId.",
    );
  });

  test("rejects assistant tool calls without a name", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "assistant",
          toolCalls: [
            {
              id: "call_lookup",
            } as never,
          ],
        },
      ]),
    ).toThrow("Assistant tool calls must include name.");
  });

  test("rejects inline assistant tool call outcomes", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "assistant",
          toolCalls: [
            {
              id: "call_lookup",
              name: "lookupInvoice",
              result: {
                refundable: true,
              },
            } as never,
          ],
        },
      ]),
    ).toThrow("Assistant tool calls must use separate tool result messages.");
  });

  test("rejects malformed AI SDK-style tool content parts", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_lookup",
            } as never,
          ],
        },
      ]),
    ).toThrow(
      "Tool-call content parts require assistant role, toolCallId, and toolName.",
    );

    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "assistant",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_lookup",
            } as never,
          ],
        },
      ]),
    ).toThrow("Tool-result content parts require tool role and toolCallId.");
  });

  test("rejects unsupported typed content parts", () => {
    expect(() =>
      messagesToTranscriptEvents([
        {
          role: "assistant",
          content: [
            {
              type: "function_call",
              callId: "call_lookup",
              name: "lookupInvoice",
            },
          ],
        },
      ]),
    ).toThrow("Message content parts must use the harness message contract.");
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

  test("defaults harness-only case scores from Vitest status", () => {
    const json = structuredClone(sampleJson);
    const passed = json.testResults[0]!.assertionResults[0]!;
    passed.status = "passed";
    passed.failureMessages = [];
    passed.meta = {
      harness: (passed.meta as any).harness,
    };

    const failed = structuredClone(passed);
    failed.fullName = "refund agent failed assertions";
    failed.title = "failed assertions";
    failed.status = "failed";
    failed.failureMessages = ["expected approved, received denied"];

    const skipped = structuredClone(passed);
    skipped.fullName = "refund agent skipped assertions";
    skipped.title = "skipped assertions";
    skipped.status = "skipped";

    json.testResults[0]!.assertionResults = [passed, failed, skipped];

    const workspace = collectReportWorkspace(json);

    expect(workspace.cases.map((testCase) => testCase.eval)).toEqual([
      { avgScore: 1, scores: [], thresholdFailed: false },
      { avgScore: 0, scores: [], thresholdFailed: false },
      { avgScore: null, scores: [], thresholdFailed: false },
    ]);
    expect(workspace.runs[0]?.totals).toMatchObject({
      evalTotal: 3,
      evalPassed: 1,
      evalFailed: 1,
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

  test("treats raw Vitest JSON as raw even with a top-level report field", () => {
    const json = {
      ...structuredClone(sampleJson),
      report: "passthrough metadata",
    };

    const workspace = collectReportWorkspace(json);

    expect(workspace.cases).toHaveLength(1);
    expect(workspace.runs[0]?.id).toBe("run-1");
  });
});

describe("normalized run helpers", () => {
  test("reads shared session and trace details", () => {
    const workspace = collectReportWorkspace(sampleJson);
    const run = workspace.cases[0]!.harness!.run!;

    expect(toolCalls(run).map((call) => call.name)).toEqual(["lookupInvoice"]);
    expect(toolCalls(run.session).map((call) => call.name)).toEqual([
      "lookupInvoice",
    ]);
    expect(assistantMessages(run).map((message) => message.role)).toEqual([
      "assistant",
    ]);
    expect(userMessages(run).map((message) => message.role)).toEqual(["user"]);
    expect(systemMessages(run)).toEqual([]);
    expect(toolMessages(run)).toMatchObject([
      {
        type: "tool_result",
        toolCallId: "call_lookup",
        name: "lookupInvoice",
        content: { refundable: false },
      },
    ]);
    expect(messagesByRole(run, "assistant")).toEqual(assistantMessages(run));
    expect(latestAssistantMessageContent(run)).toBe("denied");
    expect(spans(run).map((span) => span.id)).toEqual([
      "trace_1:run",
      "trace_1:tool:1",
    ]);
    expect(spans(run.traces).map((span) => span.id)).toEqual([
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
    expect(spansByKind(run.traces, "tool").map((span) => span.name)).toEqual([
      "lookupInvoice",
    ]);
    expect(failedSpans(run)).toEqual([]);
    expect(failedSpans(run.traces)).toEqual([]);
  });

  test("keeps tool calls pending when no matching result can be linked", () => {
    expect(
      toolCalls({
        events: [
          {
            type: "tool_call",
            id: "call_1",
            name: "lookupInvoice",
            arguments: { invoiceId: "inv_123" },
          },
        ],
      }),
    ).toEqual([
      {
        name: "lookupInvoice",
        arguments: { invoiceId: "inv_123" },
        status: "pending",
      },
    ]);
  });

  test("requires tool result events to reference a tool call id", () => {
    expect(() =>
      TranscriptToolResultEventSchema.parse({
        type: "tool_result",
        name: "lookupInvoice",
        content: { refundable: true },
      }),
    ).toThrow();
  });

  test("uses tool ids to disambiguate out-of-order results when available", () => {
    expect(
      toolCalls({
        events: [
          {
            type: "tool_call",
            id: "call_1",
            name: "lookupInvoice",
            arguments: { invoiceId: "inv_123" },
          },
          {
            type: "tool_call",
            id: "call_2",
            name: "lookupInvoice",
            arguments: { invoiceId: "inv_456" },
          },
          {
            type: "tool_result",
            toolCallId: "call_2",
            name: "lookupInvoice",
            content: { invoiceId: "inv_456" },
          },
          {
            type: "tool_result",
            toolCallId: "call_1",
            name: "lookupInvoice",
            content: { invoiceId: "inv_123" },
          },
        ],
      }),
    ).toEqual([
      {
        name: "lookupInvoice",
        arguments: { invoiceId: "inv_123" },
        status: "ok",
        result: { invoiceId: "inv_123" },
      },
      {
        name: "lookupInvoice",
        arguments: { invoiceId: "inv_456" },
        status: "ok",
        result: { invoiceId: "inv_456" },
      },
    ]);
  });

  test("does not fall back to ordered matching when a result id is explicit", () => {
    expect(
      toolCalls({
        events: [
          {
            type: "tool_call",
            id: "call_1",
            name: "lookupInvoice",
          },
          {
            type: "tool_result",
            toolCallId: "call_missing",
            name: "lookupInvoice",
            content: { invoiceId: "inv_123" },
          },
        ],
      }),
    ).toEqual([
      {
        name: "lookupInvoice",
        status: "pending",
      },
    ]);
  });
});
