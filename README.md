# vitest-evals

This project is a prototype of extending vitest to support basic _Evals_ functionality. Evals are a type of testing that is most commonly deployed to _evaluate_ the results of calls to language models. This allows you to utilize them with a pattern of testing you're familiar with, working well with your existing continuous integration toolchain.

This is heavily inspired by [Evalite](https://www.evalite.dev/), but opts for a vitest-native approach to maximize the compatibility of the existing ecosystem. This means you can use it with your existing toolchain, including reporting such as code coverage and xunit.

## Use

```shell
npm install -D vitest-evals
```

You've likely already got a mechanism for passing the user input into your model, for example:

```javascript
async function answerQuestion(prompt: string) {
  const model = openai("gpt-4o");
  const { text } = await generateText({
    model,
    prompt,
  });
  return text;
}
```

You'll use this as the `task` within your evals, and then you simply need to define a set of scenarios
and a way to validate if the LLM is responding as you desire:

```javascript
import { describeEval } from "vitest-evals";
import { Factuality } from "autoevals";

describeEval("my evals", {
  data: async () => {
    // The scenarios you wish to evaluate
    return [
      input: "What is the capital of France?",
      expected: "Paris",
    ];
  },

  task: answerQuestion,

  // Scorers determine if the response was acceptable - in this case we're using
  // a secondary LLM prompt to judge the response of the first.
  scorers: [Factuality],

  // The threshold required for the average score for this eval to pass. This will be
  // based on the scorers you've provided, and in the case of Factuality, we might be
  // ok with a 60% score (see the implementation for why).
  threshold: 0.6,

  // The timeout for each test. Defaults to 10s. You may need to increase this if your model
  // provider has high latency or you're using a large number of scorers.
  // timeout: 60000,

  // A check to determine if these tests should run. This is helpful to control tests so they only
  // in certain situations, for example if a model providers API key is defined.
  // skipIf: () => !process.env.OPENAI_API_KEY
})
```

### Existing Test Suites

```javascript
// import `vitest-evals` to expose `expect().toEval()`
// This can also be done via `setupFiles` pattern in `vitest`.
import "vitest-evals";
import { Factuality } from "autoevals";

describe("my test suite", () => {
  it("kind of works", () => {
    expect("What is the capital of France?").toEval(
      "Paris",
      answerQuestion,
      Factuality,
      0.8
    );
  });
});
```

### Scoring

Scorers are compatible with the `autoevals` interface, but are also simple to implement on your own:

```javascript
export const Contains = async (opts: {
  input: string,
  expected: string,
  output: string,
}) => {
  return {
    score: output.indexOf(expected) !== -1 ? 1.0 : 0.0,
  };
};
```

For something more realistic, here's a reimplementation of the Factuality scorer from `autoevals`, with some flexibility
on the model, enabling you to evaluate against multiple models:

````javascript
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

/**
 * A Factuality checker utilizing the `ai` SDK based on the implementation in `autoevals`.
 *
 * @param model - The language model to utilize (via `ai`).
 *
 * @example
 * ```javascript
 * import { openai } from "@ai-sdk/openai";
 *
 * scorers: [Factuality(openai("gpt-4o"))]
 * ```
 */
export function Factuality(model: LanguageModel) {
  return async Factuality(opts: {
    input: string;
    output: string;
    expected?: string;
  }) => {
    const { object } = await generateObject({
      model,
      /**
       * Prompt implementation from `autoevals`:
       *
       * {@link https://github.com/braintrustdata/autoevals/blob/5aa20a0a9eb8fc9e07e9e5722ebf71c68d082f32/templates/factuality.yaml}
       */
      prompt: `
        You are comparing a submitted answer to an expert answer on a given question. Here is the data:
        [BEGIN DATA]
        ************
        [Question]: ${opts.input}
        ************
        [Expert]: ${opts.expected}
        ************
        [Submission]: ${opts.output}
        ************
        [END DATA]

        Compare the factual content of the submitted answer with the expert answer. Ignore any differences in style, grammar, or punctuation.
        The submitted answer may either be a subset or superset of the expert answer, or it may conflict with it. Determine which case applies. Answer the question by selecting one of the following options:
        (A) The submitted answer is a subset of the expert answer and is fully consistent with it.
        (B) The submitted answer is a superset of the expert answer and is fully consistent with it.
        (C) The submitted answer contains all the same details as the expert answer.
        (D) There is a disagreement between the submitted answer and the expert answer.
        (E) The answers differ, but these differences don't matter from the perspective of factuality.
      `,
      schema: z.object({
        answer: z.enum(["A", "B", "C", "D", "E"]).describe("Your selection."),
        rationale: z
          .string()
          .describe("Why you chose this answer. Be very detailed."),
      }),
    });

    const scores = {
      A: 0.4,
      B: 0.6,
      C: 1,
      D: 0,
      E: 1,
    };

    return {
      score: scores[object.answer],
      metadata: {
        rationale: object.rationale,
      },
    };
  };
}
````

### Separating Evals

An alternative to `skipIf` for controlling if evals run is creating an separate `vitest` configuration for them. This gives a lot of advantages, particularly allowing you to maintain two completely separate test suites. A good pattern you can enable with this is a filename-based-test selector:

```javascript
// vitest.evals.config.ts
/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import defaultConfig from "./vitest.config";

export default defineConfig({
  ...defaultConfig,
  test: {
    ...defaultConfig.test,
    // run `eval` files rather than typical `test` files
    include: ["src/**/*.eval.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
});
```

In the above, we're telling it to only match only `*.eval.*` files (vs the typical `*.test.*` or `*.spec.*`). We're also inheriting from our default `vitest.config.ts`. This gives us a clean way to run only tests, or run only evals:

```shell
vitest --config=vitest.evals.config.ts
```

Its recommended to add this to your `package.json`, such as under an `eval` helper:

```javascript
// package.json
{
  // ...
  "scripts": {
    // ...
    "eval": "vitest --config=vitest.evals.config.ts",
  }
}
```

You can then run your evals using `npm run eval`.

## Development

Nothing fancy here.

```javascript
pnpm install
```

```javascript
pnpm test
```
