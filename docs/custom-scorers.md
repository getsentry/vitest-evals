# Custom Judges and Legacy Scorers

The root `vitest-evals` API is now judge-first. If you are writing a new
harness-backed suite, prefer a custom judge over a custom scorer.

Use `vitest-evals/legacy` only when you are intentionally maintaining an older
scorer-first suite.

## Custom Judge Example

```ts
import { createJudge } from "vitest-evals";

export const RefundRubricJudge = createJudge(
  "RefundRubricJudge",
  async ({ output }) => {
    const answer = output;
    const verdict = await judgeRefundRubric(answer);

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
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval } from "vitest-evals";
import { createRefundAgent } from "../src/refundAgent";
import { RefundRubricJudge } from "./judges";

describeEval(
  "refund agent",
  {
    harness: piAiHarness({
      agent: () => createRefundAgent(),
    }),
    judges: [RefundRubricJudge],
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
import { expect } from "vitest";
import { RefundRubricJudge } from "./judges";

await expect(result).toSatisfyJudge(RefundRubricJudge);
```

For simple response-level checks, a judge can just score `output`. When a judge
needs normalized run context, type it with `JudgeContext` and read `metadata`,
`toolCalls`, `session`, `harness`, or the curried `runJudge` helper from there.
LLM-backed judges should own their prompt, rubric text, and parser, then call
`ctx.runJudge(...)` for the provider-specific model request. Core curries the
matcher, judge, or suite `judgeHarness` into that function with the current
abort signal. Calling `harness.run(...)` inside a judge executes the app again,
so reserve that for judges that intentionally need a second run.

When rubric criteria are part of the scenario under test, keep them on
`input`. Use per-run `metadata` for expectations or harness configuration
that are not part of the scenario payload.

Explicit matcher calls on the branded result returned by fixture `run(...)`
use the run's typed `output` and reuse registered input, metadata, and harness
context. The matcher requires any custom judge params and rejects judges whose
output type cannot assess the received value. Inside an eval test, matcher
calls on registered output objects or session objects reuse that exact run
context; other raw values fall back to the current test's most recent `run(...)`
context. Matcher calls outside that context, or on manually-created runs,
should pass the context required by the judge in `toSatisfyJudge(...)` options.

## Built-In Root Judges

The root package ships `FactualityJudge()` for factuality grading and
deterministic judge-shaped helpers such as `StructuredOutputJudge()` and
`ToolCallJudge()`. LLM-backed judges use a matcher, judge, or suite
`judgeHarness`, which keeps provider-specific model configuration outside the
root judge.

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
