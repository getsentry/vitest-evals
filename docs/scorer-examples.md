# Judge Examples

This file keeps concrete examples of reusable evaluation helpers.
For new suites, prefer judges over root-level scorers.

## Domain Judge

```ts
import type { JudgeFn } from "vitest-evals";

export const RefundApprovalJudge: JudgeFn<{ expectedStatus: string }> = async ({
  run,
  expectedStatus,
}) => {
  const actualStatus =
    run.output && typeof run.output === "object" && "status" in run.output
      ? String(run.output.status)
      : undefined;

  return {
    score: actualStatus === expectedStatus ? 1 : 0,
    metadata: {
      rationale: `Expected ${expectedStatus}, got ${actualStatus ?? "missing"}`,
    },
  };
};
```

## Tool Behavior Judge

```ts
import type { JudgeFn } from "vitest-evals";

export const LookupThenRefundJudge: JudgeFn = async ({ toolCalls }) => {
  const names = toolCalls.map((call) => call.name);
  const passed =
    names.length === 2 &&
    names[0] === "lookupInvoice" &&
    names[1] === "createRefund";

  return {
    score: passed ? 1 : 0,
    metadata: {
      rationale: `Observed tool order: ${names.join(" -> ") || "none"}`,
    },
  };
};
```

## Explicit Judge Assertion

```ts
it("approves refundable invoice", async ({ run }) => {
  const result = await run("Refund invoice inv_123");

  await result.judge(RefundApprovalJudge, {
    expectedStatus: "approved",
  });
});
```

## Built-In Judge Helpers

```ts
import { StructuredOutputJudge, ToolCallJudge } from "vitest-evals";

describeEval(
  "refund agent",
  {
    harness: piAiHarness({
      agent: createRefundAgent,
      tools: foobarTools,
      output: ({ outputText }) => parseRefundDecision(outputText ?? ""),
      judges: [ToolCallJudge()],
    }),
  },
  (it) => {
    it("approves refundable invoice", async ({ run }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          expectedTools: [
            { name: "lookupInvoice" },
            { name: "createRefund" },
          ],
        },
      });

      await expect(result.output).toSatisfyJudge(StructuredOutputJudge(), {
        rawInput: result.input,
        caseData: result.caseData,
        run: result.run,
        session: result.session,
        expected: { status: "approved" },
      });
    });
  },
);
```

## Legacy Scorer Example

Legacy scorer-first suites still work, but they should be imported from
`vitest-evals/legacy`:

```ts
import {
  describeEval,
  StructuredOutputScorer,
  ToolCallScorer,
} from "vitest-evals/legacy";
```
