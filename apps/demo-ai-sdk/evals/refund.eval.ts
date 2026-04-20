import { expect } from "vitest";
import type { RefundCase } from "@demo/foobar";
import {
  describeEval,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
} from "vitest-evals";
import { refundHarness } from "./shared";

const outputJudge = StructuredOutputJudge();

describeEval("demo ai-sdk refund agent", {
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
  harness: refundHarness,
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
    expect(run.usage.provider).toContain("anthropic");
    expect(run.usage.model).toContain("claude");
    expect(run.usage.totalTokens).toBeGreaterThan(0);
  },
});
