import { expect } from "vitest";
import { describeEval, StructuredOutputJudge } from "vitest-evals";
import { refundHarness } from "./shared";
import type { RefundCase } from "../src/refundAgent";

type AssertionRefundCase = RefundCase;
type ScoredRefundCase = RefundCase & {
  expected: Record<string, unknown>;
};

describeEval(
  "demo openai agents refund scorer failing example",
  {
    skipIf: () => !process.env.OPENAI_API_KEY,
    harness: refundHarness,
    judges: [StructuredOutputJudge()],
  },
  (it) => {
    it.for<ScoredRefundCase>([
      {
        name: "judge expects approval for a denied invoice",
        input: "Refund invoice inv_404",
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
        expected: {
          status: "approved",
        },
      },
    ])("$name", async ({ input, ...metadata }, { run }) => {
      await run(input, {
        metadata,
      });
    });
  },
);

describeEval(
  "demo openai agents refund assertion failing example",
  {
    skipIf: () => !process.env.OPENAI_API_KEY,
    harness: refundHarness,
  },
  (it) => {
    it.for<AssertionRefundCase>([
      {
        name: "asserts the wrong refund id after approval",
        input: "Refund invoice inv_123",
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      },
    ])("$name", async ({ input, ...metadata }, { run }) => {
      const result = await run(input, {
        metadata,
      });

      expect(result.output).toMatchObject({
        status: "approved",
        invoiceId: "inv_123",
        refundId: "rf_wrong",
      });
    });
  },
);
