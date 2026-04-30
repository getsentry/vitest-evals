import { expect } from "vitest";
import { createRefundAgent, foobarTools } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, StructuredOutputJudge } from "vitest-evals";

const harness = piAiHarness({
  agent: createRefundAgent,
  tools: foobarTools,
});

describeEval(
  "demo pi refund scorer failing example",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness,
    judges: [StructuredOutputJudge()],
  },
  (it) => {
    it("judge expects approval for a denied invoice", async ({ run }) => {
      await run("Refund invoice inv_404", {
        metadata: {
          expected: {
            status: "approved",
          },
        },
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
    it("throws after the agent handles a missing invoice", async ({ run }) => {
      const result = await run("Refund invoice inv_missing");

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
