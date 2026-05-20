# Judge Examples

This file keeps concrete examples of reusable evaluation helpers.
For new suites, prefer judges over root-level scorers.

## Factuality Judge

```ts
import { openai } from "@ai-sdk/openai";
import { aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
import { FactualityJudge } from "vitest-evals";

export const judgeHarness = aiSdkJudgeHarness({
  model: openai("gpt-4.1-mini"),
  temperature: 0,
});
export const factualityJudge = FactualityJudge({ judgeHarness });
```

For custom judge providers:

```ts
import {
  createJudgeHarness,
  FactualityJudge,
  type JudgeHarness,
} from "vitest-evals";
import { callJudgeModel } from "./judgeModel";

export const judgeHarness: JudgeHarness = createJudgeHarness({
  name: "factuality-judge-model",
  run: async ({ system, prompt }, { signal }) =>
    callJudgeModel({ system, prompt, signal }),
});

export const factualityJudge = FactualityJudge({ judgeHarness });
```

## Tool Behavior Judge

```ts
import { createJudge } from "vitest-evals";

export const LookupThenRefundJudge = createJudge(
  "LookupThenRefundJudge",
  async ({ toolCalls }) => {
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
  },
);
```

## Explicit Judge Assertion

```ts
import { expect } from "vitest";
import { factualityJudge } from "./judges";

await expect(result).toSatisfyJudge(factualityJudge, {
  expected: "Paris is the capital of France.",
  threshold: 0.6,
});
```

## Deterministic Helper Note

Built-ins such as `StructuredOutputJudge()` and `ToolCallJudge()` still exist
for deterministic contract checks. New docs should use factuality or rubric
judges as the primary examples.

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
