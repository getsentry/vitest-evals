import { expect } from "vitest";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
} from "vitest-evals";
import { createRefundAgent, type RefundCase } from "../src/refundAgent";

const outputJudge = StructuredOutputJudge();

describeEval(
  "demo pi refund agent",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness: piAiHarness({
      createAgent: () => createRefundAgent(),
    }),
    judges: [ToolCallJudge()],
  },
  (it) => {
    it.for<RefundCase>([
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
