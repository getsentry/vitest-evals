import { expect } from "vitest";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, StructuredOutputJudge } from "vitest-evals";
import {
  createRefundAgent,
  promptRefundModel,
  type RefundCase,
} from "../src/refundAgent";

type AssertionRefundCase = RefundCase;
type ScoredRefundCase = RefundCase & {
  expected: Record<string, unknown>;
};

const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  prompt: promptRefundModel,
});

describeEval(
  "demo pi refund scorer failing example",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness,
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
  "demo pi refund assertion failing example",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness,
  },
  (it) => {
    it.for<AssertionRefundCase>([
      {
        name: "throws after the agent handles a missing invoice",
        input: "Refund invoice inv_missing",
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
      },
    ])("$name", async ({ input, ...metadata }, { run }) => {
      const result = await run(input, {
        metadata,
      });

      expect(result.output).toMatchObject({
        status: "denied",
        invoiceId: "inv_missing",
        reason: "Invoice inv_missing not found",
      });

      throw new Error(
        "Intentional demo eval error after the agent handled a tool failure.",
      );
    });
  },
);
