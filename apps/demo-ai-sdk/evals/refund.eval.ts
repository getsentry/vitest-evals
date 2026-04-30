import { expect } from "vitest";
import type { RefundCase } from "@demo/foobar";
import { describeEval, type HarnessEvalContext, toolCalls } from "vitest-evals";
import { refundHarness } from "./shared";

describeEval(
  "demo ai-sdk refund agent",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness: refundHarness,
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
  expect(run.usage.provider).toContain("anthropic");
  expect(run.usage.model).toContain("claude");
  expect(run.usage.totalTokens).toBeGreaterThan(0);
}
