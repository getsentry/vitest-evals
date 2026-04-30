# Custom Judges and Legacy Scorers

The root `vitest-evals` API is now judge-first. If you are writing a new
harness-backed suite, prefer a custom judge over a custom scorer.

Use `vitest-evals/legacy` only when you are intentionally maintaining an older
scorer-first suite.

## Custom Judge Example

```ts
import type { JudgeFn } from "vitest-evals";

type RefundJudgeOptions = {
  expectedTools: string[];
};

export const RefundToolJudge: JudgeFn<RefundJudgeOptions> = async ({
  expectedTools,
  toolCalls,
}) => {
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

Use it from an eval test:

```ts
const harness = piAiHarness(createRefundAgent);

describeEval(
  "refund agent",
  {
    harness,
  },
  (it) => {
    it("approves refundable invoice", async ({ run }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          expectedTools: ["lookupInvoice", "createRefund"],
        },
      });

      await expect(result).toBeJudged(RefundToolJudge);
    });
  },
);
```

If the harness provides a prompt runtime, custom judges can call
`harness.prompt(...)` for LLM-as-judge rubrics without owning provider setup.
The judge still consumes the normalized result shape, so it is not tied to a
specific provider:

```ts
import { judge, type HarnessJudgeOptions } from "vitest-evals";

const RefundQualityJudge = judge(
  "RefundQualityJudge",
  async ({ harness, assistantOutput, toolCalls }: HarnessJudgeOptions) => {
    const verdict = JSON.parse(
      await harness.prompt(
        JSON.stringify({ assistantOutput, toolCalls }, null, 2),
        {
          system: "Grade whether the refund decision follows policy.",
        },
      ),
    );

    return {
      score: verdict.score,
      metadata: {
        rationale: verdict.rationale,
      },
    };
  },
);
```

Or run it explicitly inside a test:

```ts
it("approves refundable invoice", async ({ run }) => {
  const result = await run("Refund invoice inv_123");

  await expect(result).toBeJudged(RefundToolJudge, {
    expectedTools: ["lookupInvoice", "createRefund"],
  });
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
