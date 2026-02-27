# vitest-evals

End-to-end evaluation framework for AI agents, built on Vitest.

## Installation

```shell
npm install -D vitest-evals
```

For LLM-as-a-judge scorers (`LLMJudge`, `Factuality`), also install:

```shell
npm install -D ai zod @ai-sdk/openai
```

## Quick Start

```javascript
import { describeEval, LLMJudge } from "vitest-evals";
import { openai } from "@ai-sdk/openai";

describeEval("deploy agent", {
  data: async () => [
    { input: "Deploy the latest release to production" },
    { input: "Roll back the last deploy" },
  ],
  task: async (input) => {
    const response = await myAgent.run(input);
    return response;
  },
  scorers: [
    LLMJudge({
      model: openai("gpt-4o"),
      criteria: "Response should acknowledge the request and provide a clear status update",
    }),
  ],
  threshold: 0.8,
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

## Test Data

Each test case requires an `input` field. Use `name` to give tests a descriptive label:

```javascript
data: async () => [
  { name: "simple deploy", input: "Deploy to staging" },
  { name: "deploy with rollback", input: "Deploy to prod, roll back if errors" },
],
```

Additional fields (like `expected`, `expectedTools`) are passed through to scorers.

## Lifecycle Hooks

Use `beforeEach` and `afterEach` for setup and teardown:

```javascript
describeEval("agent with database", {
  beforeEach: async () => {
    await db.seed();
  },
  afterEach: async () => {
    await db.clean();
  },
  data: async () => [{ input: "Find recent errors" }],
  task: myAgentTask,
  scorers: [LLMJudge({ model, criteria: "Returns relevant errors" })],
});
```

## Scorers

Scorers evaluate outputs and return a score (0-1). Use built-in scorers or create your own.

### LLMJudge

Scores output against arbitrary criteria using an LLM. No expected answer needed — the primary scorer for E2E agent testing.

```javascript
import { LLMJudge } from "vitest-evals";
import { openai } from "@ai-sdk/openai";

scorers: [
  LLMJudge({
    model: openai("gpt-4o"),
    criteria: "Response should be helpful, accurate, and mention specific error codes",
  }),
];
```

Requires `ai` and `zod` as peer dependencies.

### Factuality

Compares output against an expected answer using an LLM to classify the factual relationship.

```javascript
import { Factuality } from "vitest-evals";
import { openai } from "@ai-sdk/openai";

describeEval("factual responses", {
  data: async () => [
    { input: "When did the deploy finish?", expected: "The deploy succeeded at 3pm" },
  ],
  task: myTask,
  scorers: [Factuality({ model: openai("gpt-4o") })],
});
```

Scores: equivalent (1.0), different-but-factual (1.0), superset (0.6), subset (0.4), contradictory (0.0).

Requires `ai` and `zod` as peer dependencies.

### ToolCallScorer

Evaluates if the expected tools were called with correct arguments.

```javascript
import { ToolCallScorer } from "vitest-evals";

describeEval("tool usage", {
  data: async () => [
    {
      input: "Find Italian restaurants",
      expectedTools: [
        { name: "search", arguments: { type: "restaurant" } },
        { name: "filter", arguments: { cuisine: "italian" } },
      ],
    },
  ],
  task: myTask,
  scorers: [ToolCallScorer()],
});

// Strict order and parameters
scorers: [ToolCallScorer({ ordered: true, params: "strict" })];

// Flexible evaluation
scorers: [ToolCallScorer({ requireAll: false, allowExtras: false })];
```

**Default behavior:**

- Strict parameter matching (exact equality required)
- Any order allowed
- Extra tools allowed
- All expected tools required

### StructuredOutputScorer

Evaluates if the output matches expected structured data (JSON).

```javascript
import { StructuredOutputScorer } from "vitest-evals";

describeEval("query generation", {
  data: async () => [
    {
      input: "Show me errors from today",
      expected: {
        dataset: "errors",
        query: "",
        sort: "-timestamp",
        timeRange: { statsPeriod: "24h" },
      },
    },
  ],
  task: myTask,
  scorers: [StructuredOutputScorer()],
});

// Fuzzy matching
scorers: [StructuredOutputScorer({ match: "fuzzy" })];

// Custom validation
scorers: [
  StructuredOutputScorer({
    match: (expected, actual, key) => {
      if (key === "age") return actual >= 18 && actual <= 100;
      return expected === actual;
    },
  }),
];
```

### Custom Scorers

```javascript
// Inline scorer
const LengthScorer = async ({ output }) => ({
  score: output.length > 50 ? 1.0 : 0.0,
});

// TypeScript scorer with custom options
import { type ScoreFn, type BaseScorerOptions } from "vitest-evals";

interface CustomOptions extends BaseScorerOptions {
  minLength: number;
}

const TypedScorer: ScoreFn<CustomOptions> = async (opts) => ({
  score: opts.output.length >= opts.minLength ? 1.0 : 0.0,
});
```

## AI SDK Integration

See [`src/ai-sdk-integration.test.ts`](src/ai-sdk-integration.test.ts) for a complete example with the Vercel AI SDK.

Transform provider responses to our format:

```javascript
const { text, steps } = await generateText({
  model: openai("gpt-4o"),
  prompt: input,
  tools: { myTool: myToolDefinition },
});

return {
  result: text,
  toolCalls: steps
    .flatMap((step) => step.toolCalls)
    .map((call) => ({
      name: call.toolName,
      arguments: call.args,
    })),
};
```

## Advanced Usage

### Using autoevals

For evaluation using the autoevals library:

```javascript
import { Factuality, ClosedQA } from "autoevals";

scorers: [
  Factuality,
  ClosedQA.partial({
    criteria: "Does the answer mention Paris?",
  }),
];
```

### Skip Tests Conditionally

```javascript
describeEval("gpt-4 tests", {
  skipIf: () => !process.env.OPENAI_API_KEY,
  // ...
});
```

### Existing Test Suites

For integration with existing Vitest test suites, you can use the `.toEval()` matcher:

> **Deprecated**: The `.toEval()` helper is deprecated. Use `describeEval()` instead for better test organization and multiple scorers support.

```javascript
import "vitest-evals";

test("capital check", () => {
  const simpleFactuality = async ({ output, expected }) => ({
    score: output.toLowerCase().includes(expected.toLowerCase()) ? 1.0 : 0.0,
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
pnpm install
pnpm test
```
