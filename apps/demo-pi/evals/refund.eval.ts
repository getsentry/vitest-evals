import { expect } from "vitest";
import { createRefundAgent, foobarTools, type RefundCase } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, type HarnessEvalContext, toolCalls } from "vitest-evals";

const harness = piAiHarness({
  agent: createRefundAgent,
  tools: foobarTools,
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

async function assertRefundCase(
  { run, session }: HarnessEvalContext<RefundCase>,
  expected: Pick<RefundCase, "expectedStatus" | "expectedTools">,
) {
  expect(run.output).toMatchObject({
    status: expected.expectedStatus,
  });
  expect(toolCalls(session).map((call) => call.name)).toEqual(
    expected.expectedTools,
  );
  expect(run.usage.provider).toBe("anthropic");
  expect(run.usage.model).toContain("claude");
  expect(run.usage.totalTokens).toBeGreaterThan(0);
}
