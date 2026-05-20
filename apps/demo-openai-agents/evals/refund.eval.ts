import { openaiAgentsJudgeHarness } from "@vitest-evals/harness-openai-agents";
import {
  describeEval,
  FactualityJudge,
  StructuredOutputJudge,
  ToolCallJudge,
} from "vitest-evals";
import { expect } from "vitest";
import { assertRefundCase, refundHarness } from "./shared";
import { DEFAULT_REFUND_MODEL, type RefundCase } from "../src/refundAgent";

const outputJudge = StructuredOutputJudge();
const judgeHarness = openaiAgentsJudgeHarness({
  model: DEFAULT_REFUND_MODEL,
  temperature: 0,
});
const factualityJudge = FactualityJudge({ judgeHarness });

describeEval(
  "demo openai agents refund agent",
  {
    skipIf: () => !process.env.OPENAI_API_KEY,
    harness: refundHarness,
    judges: [ToolCallJudge(), factualityJudge],
    judgeThreshold: 0.6,
  },
  (it) => {
    it.for<RefundCase>([
      {
        name: "approves refundable invoice",
        input: "Refund invoice inv_123",
        expected:
          "Invoice inv_123 should be approved and refunded for the full 4200 cents.",
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      },
      {
        name: "denies non-refundable invoice",
        input: "Refund invoice inv_404",
        expected:
          "Invoice inv_404 should be denied because it is not refundable.",
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
      },
    ])("$name", async ({ input, ...metadata }, { run }) => {
      const result = await run(input, {
        metadata,
      });

      await assertRefundCase(result, metadata);
      await expect(result).toSatisfyJudge(outputJudge, {
        metadata,
        expected: {
          status: metadata.expectedStatus,
        },
      });
    });
  },
);
