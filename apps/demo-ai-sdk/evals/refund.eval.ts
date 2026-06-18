import { anthropic } from "@ai-sdk/anthropic";
import { aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
import { expect } from "vitest";
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
  },
  (it) => {
    it("approves refundable invoice", async ({ run }) => {
      const expected: Omit<RefundCase, "input"> = {
        expected:
          "Invoice inv_123 should be approved and refunded for the full 4200 cents.",
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      };
      const result = await run("Refund invoice inv_123");

      await assertRefundCase(result, expected);
      await expect(result).toSatisfyJudge(factualityJudge, {
        expected: expected.expected,
        threshold: 0.6,
      });
    });

    it("denies non-refundable invoice", async ({ run }) => {
      const expected: Omit<RefundCase, "input"> = {
        expected:
          "Invoice inv_404 should be denied because it is not refundable.",
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
      };
      const result = await run("Refund invoice inv_404");

      await assertRefundCase(result, expected);
      await expect(result).toSatisfyJudge(factualityJudge, {
        expected: expected.expected,
        threshold: 0.6,
      });
    });
  },
);
