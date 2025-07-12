# vitest-evals

Evaluate LLM outputs using the familiar Vitest testing framework.

## Installation

```shell
npm install -D vitest-evals
```

## Quick Start

```javascript
import { describeEval } from "vitest-evals";

describeEval("capital cities", {
  data: async () => [
    { input: "What is the capital of France?", expected: "Paris" },
    { input: "What is the capital of Japan?", expected: "Tokyo" }
  ],
  task: async (input) => {
    const response = await queryLLM(input);
    return response; // Simple string return
  },
  scorers: [async ({ output, expected }) => ({
    score: output.toLowerCase().includes(expected.toLowerCase()) ? 1.0 : 0.0
  })],
  threshold: 0.8
});
```

## Tasks

Tasks process inputs and return outputs. Two formats are supported:

```javascript
// Simple: just return a string
const task = async (input) => "response";

// With tool tracking: return a TaskResult
const task = async (input) => ({
  result: "response",
  toolCalls: [
    { name: "search", arguments: { query: "..." }, result: {...} }
  ]
});
```

## Scorers

Scorers evaluate outputs and return a score (0-1). Use built-in scorers or create your own:

```javascript
// Built-in scorer
import { ToolCallScorer } from "vitest-evals";
// Or import individually
import { ToolCallScorer } from "vitest-evals/scorers/toolCallScorer";

describeEval("tool usage", {
  data: async () => [
    { input: "Search weather", expectedTools: [{ name: "weather_api" }] }
  ],
  task: weatherTask,
  scorers: [ToolCallScorer()]
});

// Custom scorer
const LengthScorer = async ({ output }) => ({
  score: output.length > 50 ? 1.0 : 0.0
});

// TypeScript scorer with custom options
import { type ScoreFn, type BaseScorerOptions } from "vitest-evals";

interface CustomOptions extends BaseScorerOptions {
  minLength: number;
}

const TypedScorer: ScoreFn<CustomOptions> = async (opts) => ({
  score: opts.output.length >= opts.minLength ? 1.0 : 0.0
});
```

### Built-in Scorers

#### ToolCallScorer
Evaluates if the expected tools were called with correct arguments.

```javascript
// Basic usage - strict matching, any order
describeEval("search test", {
  data: async () => [{
    input: "Find Italian restaurants",
    expectedTools: [
      { name: "search", arguments: { type: "restaurant" } },
      { name: "filter", arguments: { cuisine: "italian" } }
    ]
  }],
  task: myTask,
  scorers: [ToolCallScorer()]
});

// Strict evaluation - exact order and parameters
scorers: [ToolCallScorer({ 
  ordered: true,      // Tools must be in exact order
  params: "strict"    // Parameters must match exactly
})]

// Flexible evaluation
scorers: [ToolCallScorer({
  requireAll: false,   // Partial matches give partial credit
  allowExtras: false   // No additional tools allowed
})]
```

**Default behavior:**
- Strict parameter matching (exact equality required)
- Any order allowed
- Extra tools allowed  
- All expected tools required

## AI SDK Integration

See [`src/ai-sdk-integration.test.ts`](src/ai-sdk-integration.test.ts) for a complete example with the Vercel AI SDK.

Transform provider responses to our format:

```javascript
// Vercel AI SDK
const { text, toolCalls, toolResults } = await generateText(...);
return {
  result: text,
  toolCalls: toolCalls?.map((call, i) => ({
    id: call.toolCallId,
    name: call.toolName,
    arguments: call.args,
    result: toolResults?.[i]?.result,
    status: toolResults?.[i]?.error ? 'failed' : 'completed'
  }))
};
```

## Advanced Usage

### Advanced Scorers

#### Using autoevals

For sophisticated evaluation, use autoevals scorers:

```javascript
import { Factuality, ClosedQA } from "autoevals";

scorers: [
  Factuality, // LLM-based factuality checking
  ClosedQA.partial({
    criteria: "Does the answer mention Paris?"
  })
]
```

#### Custom LLM-based Factuality Scorer

Here's an example of implementing your own LLM-based factuality scorer using the Vercel AI SDK:

```javascript
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const Factuality = (model = openai('gpt-4o')) => async ({ input, output, expected }) => {
  if (!expected) {
    return { score: 1.0, metadata: { rationale: "No expected answer" } };
  }

  const { object } = await generateObject({
    model,
    prompt: `
      Compare the factual content of the submitted answer with the expert answer.
      
      Question: ${input}
      Expert: ${expected}
      Submission: ${output}
      
      Options:
      (A) Subset of expert answer
      (B) Superset of expert answer  
      (C) Same content as expert
      (D) Contradicts expert answer
      (E) Different but factually equivalent
    `,
    schema: z.object({
      answer: z.enum(['A', 'B', 'C', 'D', 'E']),
      rationale: z.string()
    })
  });

  const scores = { A: 0.4, B: 0.6, C: 1, D: 0, E: 1 };
  return {
    score: scores[object.answer],
    metadata: { rationale: object.rationale, answer: object.answer }
  };
};

// Usage
scorers: [Factuality()]
```

### Skip Tests Conditionally

```javascript
describeEval("gpt-4 tests", {
  skipIf: () => !process.env.OPENAI_API_KEY,
  // ...
});
```

### Existing Test Suites

```javascript
import "vitest-evals";

test("capital check", () => {
  const simpleFactuality = async ({ output, expected }) => ({
    score: output.toLowerCase().includes(expected.toLowerCase()) ? 1.0 : 0.0
  });
  
  expect("What is the capital of France?").toEval(
    "Paris",
    answerQuestion,
    simpleFactuality,
    0.8
  );
});
```

## Configuration

### Separate Eval Configuration

Create `vitest.evals.config.ts`:

```javascript
import { defineConfig } from "vitest/config";
import defaultConfig from "./vitest.config";

export default defineConfig({
  ...defaultConfig,
  test: {
    ...defaultConfig.test,
    include: ["src/**/*.eval.{js,ts}"],
  },
});
```

Run evals separately:

```shell
vitest --config=vitest.evals.config.ts
```

## Development

```shell
npm install
npm test
```