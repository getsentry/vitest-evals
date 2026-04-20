# Custom Judges and Legacy Scorers

The root `vitest-evals` API is now judge-first. If you are writing a new
harness-backed suite, prefer a custom judge over a custom scorer.

Use `vitest-evals/legacy` only when you are intentionally maintaining an older
scorer-first suite.

## Custom Judge Example

```ts
import type { JudgeFn } from "vitest-evals";

type RefundJudgeOptions = {
  expectedStatus: string;
};

export const RefundStatusJudge: JudgeFn<RefundJudgeOptions> = async ({
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
      rationale: `Expected status=${expectedStatus}, got ${actualStatus ?? "missing"}`,
    },
  };
};
```

Use it as an automatic suite-level judge:

```ts
describeEval("refund agent", {
  harness: piAiHarness({
    createAgent: () => createRefundAgent(),
    tools: foobarTools,
  }),
  data: async () => [
    {
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
    },
  ],
  judges: [RefundStatusJudge],
});
```

Or run it explicitly inside a test:

```ts
await expect(run.output).toSatisfyJudge(RefundStatusJudge, {
  rawInput: caseData.input,
  caseData,
  run,
  session,
  expectedStatus: caseData.expectedStatus,
});
```

## Built-In Root Judges

The root package ships judge-shaped helpers for common cases:

```ts
import { StructuredOutputJudge, ToolCallJudge } from "vitest-evals";
```

These operate on normalized harness data instead of raw scorer inputs.

## Legacy Scorer Example

If you are maintaining an older suite, import from `vitest-evals/legacy`:

```ts
import {
  describeEval,
  StructuredOutputScorer,
  ToolCallScorer,
} from "vitest-evals/legacy";

describeEval("legacy refund suite", {
  data: async () => [
    {
      input: "Refund invoice inv_123",
      expected: { status: "approved" },
      expectedTools: [{ name: "lookupInvoice" }],
    },
  ],
  task: async () => ({
    result: JSON.stringify({ status: "approved" }),
    toolCalls: [{ name: "lookupInvoice", arguments: { invoiceId: "inv_123" } }],
  }),
  scorers: [StructuredOutputScorer(), ToolCallScorer()],
});
```

That compatibility path remains supported, but it is no longer the primary
authoring model.
