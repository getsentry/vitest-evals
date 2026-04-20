import { expect } from "vitest";
import { createRefundAgent, foobarTools, type RefundCase } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  StructuredOutputScorer,
  ToolCallScorer,
  toolCalls,
  type HarnessJudgeOptions,
} from "vitest-evals";

const toolCallJudge = ToolCallScorer();
const outputJudge = StructuredOutputScorer();
const expectedToolJudge = async (opts: HarnessJudgeOptions<RefundCase>) =>
  toolCallJudge({
    ...opts,
    expectedTools: (opts.expectedTools as string[]).map((name) => ({
      name,
    })),
  });

Object.defineProperty(expectedToolJudge, "name", {
  value: "ToolCallScorer",
});

describeEval("demo pi refund agent", {
  skipIf: () => !process.env.ANTHROPIC_API_KEY,
  data: async (): Promise<RefundCase[]> => [
    {
      name: "approves refundable invoice",
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
      expectedTools: ["lookupInvoice", "createRefund"],
    },
    {
      name: "denies non-refundable invoice",
      input: "Refund invoice inv_404",
      expectedStatus: "denied",
      expectedTools: ["lookupInvoice"],
    },
  ],
  harness: piAiHarness({
    createAgent: () => createRefundAgent(),
    tools: foobarTools,
  }),
  judges: [expectedToolJudge],
  test: async ({ run, session, caseData }) => {
    expect(run.output).toMatchObject({
      status: caseData.expectedStatus,
    });
    await expect(run.output).toSatisfyJudge(outputJudge, {
      rawInput: caseData.input,
      caseData,
      run,
      session,
      expected: {
        status: caseData.expectedStatus,
      },
    });
    expect(toolCalls(session).map((call) => call.name)).toEqual(
      caseData.expectedTools,
    );
    expect(run.usage.provider).toBe("anthropic");
    expect(run.usage.model).toContain("claude");
    expect(run.usage.totalTokens).toBeGreaterThan(0);
  },
});
