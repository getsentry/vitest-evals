import { expect } from "vitest";
import type { RefundCase } from "@demo/foobar";
import { describeEval, StructuredOutputJudge } from "vitest-evals";
import { refundHarness } from "./shared";

type AssertionRefundCase = RefundCase;
type ScoredRefundCase = RefundCase & {
  expected: Record<string, unknown>;
};

describeEval("demo ai-sdk refund scorer failing example", {
  skipIf: () => !process.env.ANTHROPIC_API_KEY,
  data: async (): Promise<ScoredRefundCase[]> => [
    {
      name: "judge expects approval for a denied invoice",
      input: "Refund invoice inv_404",
      expectedStatus: "denied",
      expectedTools: ["lookupInvoice"],
      expected: {
        status: "approved",
      },
    },
  ],
  harness: refundHarness,
  judges: [StructuredOutputJudge()],
});

describeEval("demo ai-sdk refund assertion failing example", {
  skipIf: () => !process.env.ANTHROPIC_API_KEY,
  data: async (): Promise<AssertionRefundCase[]> => [
    {
      name: "asserts the wrong refund id after approval",
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
      expectedTools: ["lookupInvoice", "createRefund"],
    },
  ],
  harness: refundHarness,
  test: async ({ run }) => {
    expect(run.output).toMatchObject({
      status: "approved",
      invoiceId: "inv_123",
      refundId: "rf_wrong",
    });
  },
});
