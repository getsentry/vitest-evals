---
title: Runtime Harness
description: Adapt a runtime-specific Q&A app for eval runs.
editUrl: false
---

Open with the runtime model and when this harness is the right choice. Use the
same tiny story as the other harness pages: a real app answers "What is the
capital of France?", the harness normalizes that app run, and a simple judge
scores whether the answer mentions Paris.

## Install

Install the core package plus the runtime harness package.

```bash title="Runtime Harness"
pnpm add -D vitest-evals @vitest-evals/harness-runtime
```

## App Shape

Start with the smallest realistic production app shape. This should be code the
reader would recognize from their app, not eval-only glue.

```ts title="src/questionAgent.ts"
export function createQuestionAgent() {
  return {
    instructions:
      "Answer geography questions directly. Keep answers short.",
    async run(input: string) {
      return answerQuestion(input);
    },
  };
}
```

## Configure Harness

Wrap the production app with the runtime adapter. Keep this section focused on
what the harness owns: calling the app, parsing output, and normalizing details
that judges and reports can read.

```ts title="evals/qaHarness.ts"
import { runtimeHarness } from "@vitest-evals/harness-runtime";
import { createQuestionAgent } from "../src/questionAgent";

export const qaHarness = runtimeHarness({
  agent: () => createQuestionAgent(),
  output: ({ result }) => String(result).trim(),
});
```

## Eval

Run the same simple question through the configured harness. The judge should
score the normalized result from that run; it should not call the app again.

```ts title="evals/capital.eval.ts"
import { expect } from "vitest";
import {
  createJudge,
  describeEval,
  type JudgeContext,
} from "vitest-evals";
import { qaHarness } from "./qaHarness";

const CapitalJudge = createJudge(
  "CapitalJudge",
  async ({ output }: JudgeContext<string, string>) => {
    const passed = output.toLowerCase().includes("paris");

    return {
      score: passed ? 1 : 0,
      metadata: {
        rationale: passed
          ? "The answer names Paris."
          : `Expected Paris, got: ${output}`,
      },
    };
  },
);

describeEval("capital questions", { harness: qaHarness }, (it) => {
  it("knows the capital of France", async ({ run }) => {
    const result = await run("What is the capital of France?");

    expect(result.output).toContain("Paris");
    await expect(result).toSatisfyJudge(CapitalJudge);
  });
});
```
