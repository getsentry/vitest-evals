import { assertRefundCase } from "@demo/refund-agent/testing";
import { describeEval } from "vitest-evals";
import { refundHarness } from "./shared";

describeEval(
  "demo ai-sdk refund agent",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness: refundHarness,
  },
  (it) => {
    it("approves refundable invoice", async ({ run }) => {
      await assertRefundCase(await run("Refund invoice inv_123"), {
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      });
    });

    it("denies non-refundable invoice", async ({ run }) => {
      await assertRefundCase(await run("Refund invoice inv_404"), {
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
      });
    });
  },
);
