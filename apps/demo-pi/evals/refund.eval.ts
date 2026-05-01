import { createRefundAgent, parseRefundDecision } from "@demo/foobar";
import { assertRefundCase } from "@demo/foobar/testing";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval } from "vitest-evals";

const harness = piAiHarness(createRefundAgent, {
  output: ({ outputText }) => parseRefundDecision(outputText ?? ""),
});

describeEval(
  "demo pi refund agent",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness,
  },
  (it) => {
    it("approves refundable invoice", async ({ run }) => {
      await assertRefundCase(await run("Refund invoice inv_123"), {
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      });
    });

    it("denies non-refundable invoice", async ({ run }) => {
      await assertRefundCase(await run("Refund invoice inv_404"), {
        expectedStatus: "denied",
        expectedTools: ["lookupInvoice"],
      });
    });
  },
);
