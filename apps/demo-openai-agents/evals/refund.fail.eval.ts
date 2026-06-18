import { expect } from "vitest";
import { describeEval, StructuredOutputJudge } from "vitest-evals";
import { refundHarness } from "./shared";
import type { RefundCase } from "../src/refundAgent";

type AssertionRefundCase = RefundCase;
type ScoredRefundCase = Omit<RefundCase, "expected">;

const skipUnlessRunningFailureExamples = () =>
  !process.env.OPENAI_API_KEY || process.env.VITEST_EVALS_FAIL_MODE !== "1";

describeEval(
  "demo openai agents refund scorer failing example",
  {
    skipIf: skipUnlessRunningFailureExamples,
    harness: refundHarness,
    judges: [StructuredOutputJudge({ expected: { status: "approved" } })],
  },
  (it) => {
    it.for<ScoredRefundCase>([
      {
        name: "judge expects approval for a denied invoice",
        input: "Refund invoice inv_404",
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
      },
    ])("$name", async ({ input }, { run }) => {
      await run(input);
    });
  },
);

describeEval(
  "demo openai agents refund assertion failing example",
  {
    skipIf: skipUnlessRunningFailureExamples,
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
    ])("$name", async ({ input }, { run }) => {
      const result = await run(input);

      expect(result.output).toMatchObject({
        status: "approved",
        invoiceId: "inv_123",
        refundId: "rf_wrong",
      });
    });
  },
);
