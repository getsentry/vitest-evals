import { expect } from "vitest";
import { createRefundAgent, foobarTools, type RefundCase } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, StructuredOutputScorer } from "vitest-evals";

type AssertionRefundCase = RefundCase;
type ScoredRefundCase = RefundCase & {
  expected: Record<string, unknown>;
};

const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  tools: foobarTools,
});

describeEval("demo pi refund scorer failing example", {
  skipIf: () => !process.env.ANTHROPIC_API_KEY,
  data: async (): Promise<ScoredRefundCase[]> => [
    {
      name: "judge expects approval for a denied invoice",
      input: "Refund invoice inv_404",
      expectedStatus: "denied",
      expectedTools: ["lookupInvoice"],
      expected: {
        status: "approved",
      },
    },
  ],
  harness,
  judges: [StructuredOutputScorer()],
});

describeEval("demo pi refund assertion failing example", {
  skipIf: () => !process.env.ANTHROPIC_API_KEY,
  data: async (): Promise<AssertionRefundCase[]> => [
    {
      name: "throws after the agent handles a missing invoice",
      input: "Refund invoice inv_missing",
      expectedStatus: "denied",
      expectedTools: ["lookupInvoice"],
    },
  ],
  harness,
  test: async ({ run }) => {
    expect(run.output).toMatchObject({
      status: "denied",
      invoiceId: "inv_missing",
      reason: "Invoice inv_missing not found",
    });

    throw new Error(
      "Intentional demo eval error after the agent handled a tool failure.",
    );
  },
});
