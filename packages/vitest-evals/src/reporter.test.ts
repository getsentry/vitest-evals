import { stripVTControlCharacters } from "node:util";
import { describe, expect, test, vi } from "vitest";
import DefaultEvalReporter from "./reporter";

function createReporter() {
  const logger = {
    log: vi.fn(),
    error: vi.fn(),
    printBanner: vi.fn(),
    printNoTestFound: vi.fn(),
  };

  const reporter = new DefaultEvalReporter({ isTTY: false });
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

function createDetailedReporter(toolDetails: boolean | number = 2) {
  const logger = {
    log: vi.fn(),
    error: vi.fn(),
    printBanner: vi.fn(),
    printNoTestFound: vi.fn(),
  };

  const reporter = new DefaultEvalReporter({
    isTTY: false,
    toolDetails,
  });
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
        messages: Array<{
          role: "assistant" | "user";
          content: string;
          toolCalls?: Array<{
            name: string;
            arguments?: Record<string, unknown>;
            result?: Record<string, unknown>;
            durationMs?: number;
            metadata?: Record<string, unknown>;
          }>;
        }>;
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
              name: "StructuredOutputScorer",
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
      "score   StructuredOutputScorer 0.20",
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
                      name: "lookupInvoice",
                      durationMs: 6,
                      result: {
                        invoiceId: "inv_123",
                        refundable: true,
                      },
                    },
                  ],
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

  test("shows per-tool metrics in verbose tool detail mode", () => {
    const { reporter, logger } = createDetailedReporter(2);

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
                      name: "lookupInvoice",
                      durationMs: 6,
                      result: {
                        invoiceId: "inv_123",
                        refundable: true,
                      },
                    },
                    {
                      name: "createRefund",
                      durationMs: 4,
                      result: {
                        refundId: "rf_inv_123",
                        status: "submitted",
                      },
                    },
                  ],
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
      "├─ lookupInvoice()",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "result  invoiceId=inv_123 refundable=true [41B | 6ms]",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[3][0])).toContain(
      "├─ createRefund()",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[4][0])).toContain(
      "result  status=submitted refundId=rf_inv_123 [46B | 4ms]",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[5][0])).toContain(
      "└─ final   status=approved refundId=rf_inv_123",
    );
  });

  test("prefers token counts over response size when tool usage exists", () => {
    const { reporter, logger } = createDetailedReporter(2);

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
                      name: "lookupInvoice",
                      durationMs: 6,
                      result: {
                        invoiceId: "inv_123",
                      },
                      metadata: {
                        usage: {
                          totalTokens: 7,
                        },
                      },
                    },
                  ],
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
      "result  invoiceId=inv_123 [7 tok | 6ms]",
    );
  });

  test("combines summarized tool arguments into the header at the middle verbose tier", () => {
    const { reporter, logger } = createDetailedReporter(3);

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
                      name: "lookupInvoice",
                      durationMs: 6,
                      arguments: {
                        invoiceId: "inv_123",
                      },
                      result: {
                        invoiceId: "inv_123",
                        refundable: true,
                      },
                    },
                  ],
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

    expect(logger.log).toHaveBeenCalledTimes(4);
    expect(stripVTControlCharacters(logger.log.mock.calls[1][0])).toContain(
      "├─ lookupInvoice(invoiceId=inv_123)",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "result  refundable=true [41B | 6ms]",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[3][0])).toContain(
      "└─ final   status=approved",
    );
  });

  test("shows raw tool payloads at the highest verbose tier", () => {
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
                      name: "lookupInvoice",
                      durationMs: 6,
                      arguments: {
                        invoiceId: "inv_123",
                      },
                      result: {
                        invoiceId: "inv_123",
                        refundable: true,
                      },
                    },
                  ],
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
      "├─ lookupInvoice(invoiceId=inv_123)",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "result  refundable=true [41B | 6ms]",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[3][0])).toContain(
      'raw in  {"invoiceId":"inv_123"}',
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[4][0])).toContain(
      'raw out {"invoiceId":"inv_123","refundable":true}',
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[5][0])).toContain(
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
              name: "StructuredOutputScorer",
              score: 1,
            },
            {
              name: "ToolCallScorer",
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
      "score   StructuredOutputScorer 1.00",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[2][0])).toContain(
      "score   ToolCallScorer 1.00",
    );
  });
});
