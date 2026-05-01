# Custom Judges and Legacy Scorers

The root `vitest-evals` API is now judge-first. If you are writing a new
harness-backed suite, prefer a custom judge over a custom scorer.

Use `vitest-evals/legacy` only when you are intentionally maintaining an older
scorer-first suite.

## Custom Judge Example

```ts
import { namedJudge } from "vitest-evals";

export const FactualityJudge = namedJudge(
  "FactualityJudge",
  async ({ output }) => {
    const answer = output;
    const verdict = await judgeFactuality(answer);

    return {
      score: verdict.score,
      metadata: {
        rationale: verdict.rationale,
      },
    };
  },
);
```

Use it as an automatic suite-level judge:

```ts
describeEval(
  "refund agent",
  {
    harness: piAiHarness({
      createAgent: () => createRefundAgent(),
    }),
    judges: [FactualityJudge],
  },
  (it) => {
    it("approves the refundable invoice", async ({ run }) => {
      await run("Refund invoice inv_123");
    });
  },
);
```

Or run it explicitly inside a test:

```ts
await expect(result).toSatisfyJudge(FactualityJudge);
```

For simple response-level checks, a judge can just score `output`. When a
judge needs richer context, type it with `JudgeContext` and read `metadata`,
`toolCalls`, or `session` from there.

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
