import { expect } from "vitest";
import { describeEval, StructuredOutputJudge } from "vitest-evals";
import { refundHarness } from "./shared";

describeEval(
  "demo ai-sdk refund scorer failing example",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness: refundHarness,
    judges: [StructuredOutputJudge()],
  },
  (it) => {
    it("judge expects approval for a denied invoice", async ({ run }) => {
      await run("Refund invoice inv_404", {
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
        expected: {
          status: "approved",
        },
      });
    });
  },
);

describeEval(
  "demo ai-sdk refund assertion failing example",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness: refundHarness,
  },
  (it) => {
    it("asserts the wrong refund id after approval", async ({ run }) => {
      const result = await run("Refund invoice inv_123", {
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      });

      expect(result.output).toMatchObject({
        status: "approved",
        invoiceId: "inv_123",
        refundId: "rf_wrong",
      });
    });
  },
);
