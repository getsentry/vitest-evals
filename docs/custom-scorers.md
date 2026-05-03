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
      prompt: judgePrompt,
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

For simple response-level checks, a judge can just score `output`. When a judge
needs normalized run context, type it with `JudgeContext` and read `metadata`,
`toolCalls`, `session`, or `harness` from there. `harness.prompt(...)` gives
LLM-backed rubric judges a shared provider/model seam without duplicating
app-level model setup. Calling `harness.run(...)`
inside a judge executes the app again, so reserve that for judges that
intentionally need a second run.

Explicit matcher calls on the branded result returned by fixture `run(...)`
use the run's canonical text output and reuse registered input, metadata,
harness, and harness prompt. Inside an eval test, matcher calls on registered
raw output or session objects reuse that exact run context; raw output values
are serialized as the judge `output`, and other raw values fall back to the
current test's most recent `run(...)` context. Matcher calls outside that
context, or on manually-created runs, should pass the context required by the
judge in `toSatisfyJudge(...)` options.

## Built-In Root Judges

The root package still ships deterministic judge-shaped helpers such as
`StructuredOutputJudge()` and `ToolCallJudge()`. They operate on normalized
harness data instead of raw scorer inputs, but new docs should keep factuality
or rubric judges as the primary examples.

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
