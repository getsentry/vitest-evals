import { expect } from "vitest";
import { createRefundAgent, foobarTools, type RefundCase } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
} from "vitest-evals";

const outputJudge = StructuredOutputJudge();

describeEval("demo pi refund agent", {
  skipIf: () => !process.env.ANTHROPIC_API_KEY,
  data: [
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
  judges: [ToolCallJudge()],
  test: async ({ run, session, caseData, judge }) => {
    expect(run.output).toMatchObject({
      status: caseData.expectedStatus,
    });
    await judge(outputJudge, {
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
