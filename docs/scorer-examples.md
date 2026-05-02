# Judge Examples

This file keeps concrete examples of reusable evaluation helpers.
For new suites, prefer judges over root-level scorers.

## Factuality Judge

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
await expect(result).toSatisfyJudge(FactualityJudge);
```

## Built-In Judge Helpers

```ts
import { StructuredOutputJudge, ToolCallJudge } from "vitest-evals";

describeEval(
  "refund agent",
  {
    harness: piAiHarness({
      createAgent: () => createRefundAgent(),
    }),
    judges: [ToolCallJudge()],
  },
  (it) => {
    it("approves a refund", async ({ run }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          expected: { status: "approved" },
          expectedTools: [
            { name: "lookupInvoice" },
            { name: "createRefund" },
          ],
        },
      });

      await expect(result).toSatisfyJudge(StructuredOutputJudge(), {
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
