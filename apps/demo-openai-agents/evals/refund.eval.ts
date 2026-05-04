import {
  describeEval,
  StructuredOutputJudge,
  ToolCallJudge,
} from "vitest-evals";
import { expect } from "vitest";
import { assertRefundCase, refundHarness } from "./shared";
import type { RefundCase } from "../src/refundAgent";

const outputJudge = StructuredOutputJudge();

describeEval(
  "demo openai agents refund agent",
  {
    skipIf: () => !process.env.OPENAI_API_KEY,
    harness: refundHarness,
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
