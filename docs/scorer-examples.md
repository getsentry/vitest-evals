# Judge Examples

This file keeps concrete examples of reusable evaluation helpers.
For new suites, prefer judges over root-level scorers.

## Domain Judge

```ts
import type { JudgeFn } from "vitest-evals";

export const RefundApprovalJudge: JudgeFn<{
  expectedTools: string[];
}> = async ({ expectedTools, toolCalls }) => {
  const actualTools = toolCalls.map((call) => call.name);
  const passed = expectedTools.every(
    (name, index) => actualTools[index] === name,
  );

  return {
    score: passed ? 1 : 0,
    metadata: {
      rationale: `Expected ${expectedTools.join(" -> ")}, got ${
        actualTools.join(" -> ") || "none"
      }`,
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
    expectedTools: ["lookupInvoice", "createRefund"],
  });
});
```

## Built-In Judge Helpers

```ts
import { ToolCallJudge } from "vitest-evals";

describeEval(
  "refund agent",
  {
    harness: piAiHarness(createRefundAgent),
    judges: [ToolCallJudge()],
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
