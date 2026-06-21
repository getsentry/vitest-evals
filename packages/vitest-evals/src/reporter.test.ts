import { stripVTControlCharacters } from "node:util";
import { describe, expect, test, vi } from "vitest";
import type { NormalizedMessage } from "./harness";
import DefaultEvalReporter from "./reporter";

type ReporterOptions = {
  isTTY?: boolean;
  reportLevel?: "normal" | "info";
  silent?: boolean | "passed-only";
  toolDetails?: boolean | number;
};

function createReporter(options: ReporterOptions = {}) {
  const logger = {
    log: vi.fn(),
    error: vi.fn(),
    printBanner: vi.fn(),
    printNoTestFound: vi.fn(),
  };

  const reporter = new DefaultEvalReporter({ isTTY: false, ...options });
  reporter.onInit({
    logger,
    config: {
      hideSkippedTests: false,
      slowTestThreshold: 300,
      root: process.cwd(),
    },
  } as any);

  return { reporter, logger };
}

function createInfoReporter() {
  return createReporter({ reportLevel: "info" });
}

function createDetailedReporter(toolDetails: boolean | number = 2) {
  return createReporter({ toolDetails });
}

function createTestCase({
  avgScore,
  evalMeta,
  harness,
  fullName = "demo pi refund agent > streams eval progress",
  state = "passed",
}: {
  avgScore?: number;
  evalMeta?: {
    avgScore: number;
    output?: unknown;
    thresholdFailed?: boolean;
    scores?: Array<{
      name?: string;
      score?: number | null;
      metadata?: {
        rationale?: string;
        output?: unknown;
      };
    }>;
  };
  harness?: {
    name: string;
    run: {
      output?: Record<string, unknown> | string;
      session: {
        messages: NormalizedMessage[];
      };
      usage?: {
        totalTokens?: number;
        toolCalls?: number;
      };
      errors?: unknown[];
    };
  };
  fullName?: string;
  state?: "passed" | "failed";
}) {
  return {
    task: {
      name: "streams eval progress",
      type: "test",
      mode: "run",
      file: {
        name: "fixtures/reporter.eval.ts",
      },
      result: {
        state,
        duration: 42,
      },
    },
    module: {
      task: {
        name: "fixtures/reporter.eval.ts",
      },
      project: {
        name: "",
      },
    },
    project: {
      name: "",
    },
    options: {},
    location: {
      line: 12,
      column: 3,
    },
    meta: () => ({
      ...(evalMeta
        ? { eval: evalMeta }
        : avgScore == null
          ? {}
          : { eval: { avgScore } }),
      ...(harness ? { harness } : {}),
    }),
    result: () => ({
      state,
      errors: state === "failed" ? [{ message: "threshold not met" }] : [],
    }),
    diagnostic: () => ({
      duration: 42,
    }),
    annotations: () => [],
    fullName,
  };
}

describe("DefaultEvalReporter", () => {
  test("streams eval test cases with scores and avoids a file-end flush", () => {
    const { reporter, logger } = createReporter();
    const testCase = createTestCase({ avgScore: 0.82 });

    reporter.onTestCaseResult(testCase as any);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).toContain(
      "fixtures/reporter.eval.ts:12:3 > demo pi refund agent > streams eval progress [0.82] 42ms",
    );

    reporter.onTestModuleEnd({
      state: () => "passed",
      task: {},
    } as any);

    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  test("falls back to verbose output for non-eval tests", () => {
    const { reporter, logger } = createReporter();

    reporter.onTestCaseResult(createTestCase({}) as any);

    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).toContain(
      "fixtures/reporter.eval.ts:12:3 > streams eval progress 42ms",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).not.toContain(
      "[0.",
    );
  });

  test("logs failed eval test details with the score suffix", () => {
    const { reporter, logger } = createReporter();

    reporter.onTestCaseResult(
      createTestCase({
        state: "failed",
        evalMeta: {
          avgScore: 0.2,
          thresholdFailed: true,
          output:
            '{"status":"denied","invoiceId":"inv_404","reason":"Invoice is not refundable"}',
          scores: [
            {
              name: "StructuredOutputJudge",
              score: 0.2,
              metadata: {
                rationale:
                  'Missing required fields: status - status: expected "approved", got "denied"',
              },
            },
          ],
        },
      }) as any,
    );

    expect(logger.log).toHaveBeenCalledTimes(4);
    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).toContain(
      "fixtures/reporter.eval.ts:12:3 > demo pi refund agent > streams eval progress [0.20] 42ms",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[1][0])).toContain(
      "score   StructuredOutputJudge 0.20",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      'reason  Missing required fields: status - status: expected "approved", got "denied"',
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[3][0])).toContain(
      'final   status=denied invoiceId=inv_404 reason="Invoice is not refundable"',
    );
  });

  test("streams harness test cases with a compact harness summary", () => {
    const { reporter, logger } = createReporter();

    reporter.onTestCaseResult(
      createTestCase({
        harness: {
          name: "pi-ai",
          run: {
            output: {
              status: "approved",
              refundId: "rf_inv_123",
            },
            session: {
              messages: [
                {
                  role: "assistant",
                  content: "approved",
                  toolCalls: [
                    {
                      id: "call_lookup",
                      name: "lookupInvoice",
                    },
                  ],
                },
                {
                  role: "tool",
                  toolCallId: "call_lookup",
                  name: "lookupInvoice",
                  content: {
                    invoiceId: "inv_123",
                    refundable: true,
                  },
                },
              ],
            },
            usage: {
              totalTokens: 12,
            },
            errors: [],
          },
        },
      }) as any,
    );

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).toContain(
      "fixtures/reporter.eval.ts:12:3 > demo pi refund agent > streams eval progress [12 tok | 1 tool] 42ms",
    );
  });

  test("shows per-tool metrics in info report mode", () => {
    const { reporter, logger } = createInfoReporter();

    reporter.onTestCaseResult(
      createTestCase({
        harness: {
          name: "pi-ai",
          run: {
            output: {
              status: "approved",
              refundId: "rf_inv_123",
            },
            session: {
              messages: [
                {
                  role: "assistant",
                  content: "approved",
                  toolCalls: [
                    {
                      id: "call_lookup",
                      name: "lookupInvoice",
                    },
                    {
                      id: "call_refund",
                      name: "createRefund",
                    },
                  ],
                },
                {
                  role: "tool",
                  toolCallId: "call_lookup",
                  name: "lookupInvoice",
                  content: {
                    invoiceId: "inv_123",
                    refundable: true,
                  },
                },
                {
                  role: "tool",
                  toolCallId: "call_refund",
                  name: "createRefund",
                  content: {
                    refundId: "rf_inv_123",
                    status: "submitted",
                  },
                },
              ],
            },
            usage: {
              totalTokens: 12,
            },
            errors: [],
          },
        },
      }) as any,
    );

    expect(logger.log).toHaveBeenCalledTimes(6);
    expect(stripVTControlCharacters(logger.log.mock.calls[1][0])).toContain(
      "├─ tool    lookupInvoice",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "result  invoiceId=inv_123 refundable=true [41B]",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[3][0])).toContain(
      "├─ tool    createRefund",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[4][0])).toContain(
      "result  status=submitted refundId=rf_inv_123 [46B]",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[5][0])).toContain(
      "└─ final   status=approved refundId=rf_inv_123",
    );
  });

  test("respects explicit toolDetails=false over environment flags", () => {
    vi.stubEnv("VITEST_EVALS_TOOL_DETAILS", "1");
    vi.stubEnv("VITEST_EVALS_TOOL_DETAILS_LEVEL", "3");

    try {
      const { reporter, logger } = createDetailedReporter(false);

      reporter.onTestCaseResult(
        createTestCase({
          harness: {
            name: "pi-ai",
            run: {
              output: {
                status: "approved",
                refundId: "rf_inv_123",
              },
              session: {
                messages: [
                  {
                    role: "assistant",
                    content: "approved",
                    toolCalls: [
                      {
                        id: "call_lookup",
                        name: "lookupInvoice",
                      },
                    ],
                  },
                  {
                    role: "tool",
                    toolCallId: "call_lookup",
                    name: "lookupInvoice",
                    content: {
                      invoiceId: "inv_123",
                      refundable: true,
                    },
                  },
                ],
              },
              usage: {
                totalTokens: 12,
              },
              errors: [],
            },
          },
        }) as any,
      );

      expect(logger.log).toHaveBeenCalledTimes(1);
      expect(
        stripVTControlCharacters(logger.log.mock.calls[0][0]),
      ).not.toContain("tool    lookupInvoice");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("uses info report mode from the environment", () => {
    vi.stubEnv("VITEST_EVALS_REPORT_LEVEL", "info");

    try {
      const { reporter, logger } = createReporter();

      reporter.onTestCaseResult(
        createTestCase({
          harness: {
            name: "pi-ai",
            run: {
              output: {
                status: "approved",
              },
              session: {
                messages: [
                  {
                    role: "assistant",
                    content: "approved",
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
                      invoiceId: "inv_123",
                    },
                  },
                ],
              },
              usage: {
                totalTokens: 12,
              },
              errors: [],
            },
          },
        }) as any,
      );

      const rendered = logger.log.mock.calls
        .map(([line]) => stripVTControlCharacters(line))
        .join("\n");

      expect(rendered).toContain("tool    lookupInvoice");
      expect(rendered).toContain("args    invoiceId=inv_123");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("respects explicit normal report mode over environment flags", () => {
    vi.stubEnv("VITEST_EVALS_REPORT_LEVEL", "info");

    try {
      const { reporter, logger } = createReporter({ reportLevel: "normal" });

      reporter.onTestCaseResult(
        createTestCase({
          harness: {
            name: "pi-ai",
            run: {
              output: {
                status: "approved",
              },
              session: {
                messages: [
                  {
                    role: "assistant",
                    content: "approved",
                    toolCalls: [
                      {
                        id: "call_lookup",
                        name: "lookupInvoice",
                      },
                    ],
                  },
                  {
                    role: "tool",
                    toolCallId: "call_lookup",
                    name: "lookupInvoice",
                    content: {
                      invoiceId: "inv_123",
                    },
                  },
                ],
              },
              usage: {
                totalTokens: 12,
              },
              errors: [],
            },
          },
        }) as any,
      );

      expect(logger.log).toHaveBeenCalledTimes(1);
      expect(
        stripVTControlCharacters(logger.log.mock.calls[0][0]),
      ).not.toContain("tool    lookupInvoice");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("shows response size for tool results", () => {
    const { reporter, logger } = createInfoReporter();

    reporter.onTestCaseResult(
      createTestCase({
        harness: {
          name: "pi-ai",
          run: {
            output: {
              status: "approved",
            },
            session: {
              messages: [
                {
                  role: "assistant",
                  content: "approved",
                  toolCalls: [
                    {
                      id: "call_lookup",
                      name: "lookupInvoice",
                    },
                  ],
                },
                {
                  role: "tool",
                  toolCallId: "call_lookup",
                  name: "lookupInvoice",
                  content: {
                    invoiceId: "inv_123",
                  },
                },
              ],
            },
            usage: {
              totalTokens: 12,
            },
            errors: [],
          },
        },
      }) as any,
    );

    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "result  invoiceId=inv_123 [23B]",
    );
  });

  test("keeps replay metadata out of tool result summaries", () => {
    const { reporter, logger } = createInfoReporter();

    reporter.onTestCaseResult(
      createTestCase({
        harness: {
          name: "pi-ai",
          run: {
            output: {
              status: "approved",
            },
            session: {
              messages: [
                {
                  role: "assistant",
                  content: "approved",
                  toolCalls: [
                    {
                      id: "call_lookup",
                      name: "lookupInvoice",
                      metadata: {
                        replay: {
                          status: "replayed",
                        },
                      },
                    },
                  ],
                },
                {
                  role: "tool",
                  toolCallId: "call_lookup",
                  name: "lookupInvoice",
                  content: {
                    invoiceId: "inv_123",
                  },
                },
              ],
            },
            usage: {
              totalTokens: 12,
            },
            errors: [],
          },
        },
      }) as any,
    );

    const rendered = logger.log.mock.calls
      .map(([line]) => stripVTControlCharacters(line))
      .join("\n");

    expect(rendered).toContain("tool    lookupInvoice");
    expect(rendered).not.toContain("[cached]");
    expect(rendered).toContain("result  invoiceId=inv_123 [23B]");
  });

  test("shows summarized tool arguments in info report mode", () => {
    const { reporter, logger } = createInfoReporter();

    reporter.onTestCaseResult(
      createTestCase({
        harness: {
          name: "pi-ai",
          run: {
            output: {
              status: "approved",
            },
            session: {
              messages: [
                {
                  role: "assistant",
                  content: "approved",
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
                    invoiceId: "inv_123",
                    refundable: true,
                  },
                },
              ],
            },
            usage: {
              totalTokens: 12,
            },
            errors: [],
          },
        },
      }) as any,
    );

    expect(logger.log).toHaveBeenCalledTimes(5);
    expect(stripVTControlCharacters(logger.log.mock.calls[1][0])).toContain(
      "├─ tool    lookupInvoice",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "args    invoiceId=inv_123",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[3][0])).toContain(
      "result  refundable=true [41B]",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[4][0])).toContain(
      "└─ final   status=approved",
    );
  });

  test("shows raw tool payloads for explicit tool details", () => {
    const { reporter, logger } = createDetailedReporter(4);

    reporter.onTestCaseResult(
      createTestCase({
        harness: {
          name: "pi-ai",
          run: {
            output: {
              status: "approved",
            },
            session: {
              messages: [
                {
                  role: "assistant",
                  content: "approved",
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
                    invoiceId: "inv_123",
                    refundable: true,
                  },
                },
              ],
            },
            usage: {
              totalTokens: 12,
            },
            errors: [],
          },
        },
      }) as any,
    );

    expect(logger.log).toHaveBeenCalledTimes(7);
    expect(stripVTControlCharacters(logger.log.mock.calls[1][0])).toContain(
      "├─ tool    lookupInvoice",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "args    invoiceId=inv_123",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[3][0])).toContain(
      "result  refundable=true [41B]",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[4][0])).toContain(
      'raw in  {"invoiceId":"inv_123"}',
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[5][0])).toContain(
      'raw out {"invoiceId":"inv_123","refundable":true}',
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[6][0])).toContain(
      "└─ final   status=approved",
    );
  });

  test("shows judge sub-results for harness-backed suites", () => {
    const { reporter, logger } = createReporter();

    reporter.onTestCaseResult(
      createTestCase({
        harness: {
          name: "pi-ai",
          run: {
            output: {
              status: "approved",
            },
            session: {
              messages: [
                {
                  role: "assistant",
                  content: "approved",
                },
              ],
            },
            usage: {
              totalTokens: 12,
            },
            errors: [],
          },
        },
        evalMeta: {
          avgScore: 1,
          thresholdFailed: false,
          output: '{"status":"approved"}',
          scores: [
            {
              name: "StructuredOutputJudge",
              score: 1,
            },
            {
              name: "ToolCallJudge",
              score: 1,
            },
          ],
        },
      }) as any,
    );

    expect(logger.log).toHaveBeenCalledTimes(3);
    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).toContain(
      "fixtures/reporter.eval.ts:12:3 > demo pi refund agent > streams eval progress [12 tok] 42ms",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[1][0])).toContain(
      "score   StructuredOutputJudge 1.00",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "score   ToolCallJudge 1.00",
    );
  });
});
