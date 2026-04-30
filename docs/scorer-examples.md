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
await expect(run.output).toSatisfyJudge(RefundApprovalJudge, {
  rawInput: caseData.input,
  caseData,
  run,
  session,
  expectedStatus: caseData.expectedStatus,
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
    }),
    judges: [ToolCallJudge()],
  },
  (it) => {
    it("approves refundable invoice", {
      input: "Refund invoice inv_123",
      expected: { status: "approved" },
      expectedTools: [
        { name: "lookupInvoice" },
        { name: "createRefund" },
      ],
    }, async ({ run, session, caseData }) => {
      await expect(run.output).toSatisfyJudge(StructuredOutputJudge(), {
        rawInput: caseData.input,
        caseData,
        run,
        session,
        expected: caseData.expected,
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
