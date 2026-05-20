import { getModel } from "@mariozechner/pi-ai";
import { expect } from "vitest";
import { piAiHarness, piAiJudgeHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  FactualityJudge,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
} from "vitest-evals";
import { createRefundAgent, type RefundCase } from "../src/refundAgent";

const outputJudge = StructuredOutputJudge();
const judgeHarness = piAiJudgeHarness({
  model: getModel("anthropic", "claude-sonnet-4-5"),
  temperature: 0,
});
const factualityJudge = FactualityJudge({ judgeHarness });

describeEval(
  "demo pi refund agent",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness: piAiHarness({
      agent: () => createRefundAgent(),
      toolReplay: {
        lookupInvoice: true,
      },
    }),
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

      expect(result.output).toMatchObject({
        status: metadata.expectedStatus,
      });
      await expect(result).toSatisfyJudge(outputJudge, {
        metadata,
        expected: {
          status: metadata.expectedStatus,
        },
      });
      expect(toolCalls(result.session).map((call) => call.name)).toEqual(
        metadata.expectedTools,
      );
      expect(result.usage.provider).toBe("anthropic");
      expect(result.usage.model).toContain("claude");
      expect(result.usage.totalTokens).toBeGreaterThan(0);
    });
  },
);
