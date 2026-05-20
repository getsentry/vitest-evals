import { anthropic } from "@ai-sdk/anthropic";
import { aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
import { describeEval, FactualityJudge } from "vitest-evals";
import {
  assertRefundCase,
  REFUND_MODEL,
  refundHarness,
  type RefundCase,
} from "./shared";

const judgeHarness = aiSdkJudgeHarness({
  model: anthropic(REFUND_MODEL),
  temperature: 0,
});
const factualityJudge = FactualityJudge({ judgeHarness });

describeEval(
  "demo ai-sdk refund agent",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness: refundHarness,
    judges: [factualityJudge],
    judgeThreshold: 0.6,
  },
  (it) => {
    it("approves refundable invoice", async ({ run }) => {
      const metadata: Omit<RefundCase, "input"> = {
        expected:
          "Invoice inv_123 should be approved and refunded for the full 4200 cents.",
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      };

      await assertRefundCase(
        await run("Refund invoice inv_123", { metadata }),
        metadata,
      );
    });

    it("denies non-refundable invoice", async ({ run }) => {
      const metadata: Omit<RefundCase, "input"> = {
        expected:
          "Invoice inv_404 should be denied because it is not refundable.",
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
      };

      await assertRefundCase(
        await run("Refund invoice inv_404", { metadata }),
        metadata,
      );
    });
  },
);
