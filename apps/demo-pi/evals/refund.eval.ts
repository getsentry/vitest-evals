import { expect } from "vitest";
import { createRefundAgent, foobarTools, type RefundCase } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  type HarnessEvalContext,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
} from "vitest-evals";

const outputJudge = StructuredOutputJudge();
const harness = piAiHarness({
  agent: createRefundAgent,
  tools: foobarTools,
});

describeEval(
  "demo pi refund agent",
  {
    skipIf: () => !process.env.ANTHROPIC_API_KEY,
    harness,
    judges: [ToolCallJudge()],
  },
  (it) => {
    it("approves refundable invoice", async ({ run }) => {
      await assertRefundCase(
        await run("Refund invoice inv_123", {
          expectedStatus: "approved",
          expectedTools: ["lookupInvoice", "createRefund"],
        }),
      );
    });

    it("denies non-refundable invoice", async ({ run }) => {
      await assertRefundCase(
        await run("Refund invoice inv_404", {
          expectedStatus: "denied",
          expectedTools: ["lookupInvoice"],
        }),
      );
    });
  },
);

async function assertRefundCase({
  run,
  session,
  caseData,
  judge,
}: HarnessEvalContext<RefundCase>) {
  expect(run.output).toMatchObject({
    status: caseData.expectedStatus,
  });
  await judge(outputJudge, {
    expected: {
      status: caseData.expectedStatus,
    },
  });
  expect(toolCalls(session).map((call) => call.name)).toEqual(
    caseData.expectedTools,
  );
  expect(run.usage.provider).toBe("anthropic");
  expect(run.usage.model).toContain("claude");
  expect(run.usage.totalTokens).toBeGreaterThan(0);
}
