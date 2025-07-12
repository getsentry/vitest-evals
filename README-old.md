# vitest-evals

This project is a prototype of extending vitest to support basic _Evals_ functionality. Evals are a type of testing that is most commonly deployed to _evaluate_ the results of calls to language models. This allows you to utilize them with a pattern of testing you're familiar with, working well with your existing continuous integration toolchain.

This is heavily inspired by [Evalite](https://www.evalite.dev/), but opts for a vitest-native approach to maximize the compatibility of the existing ecosystem. This means you can use it with your existing toolchain, including reporting such as code coverage and xunit.

## Use

```shell
npm install -D vitest-evals
```

### AI SDK Integration

For a complete example of using vitest-evals with the Vercel AI SDK, including tool call tracking and evaluation, see [`src/ai-sdk-integration.test.ts`](src/ai-sdk-integration.test.ts). This demonstrates:

- Setting up tasks that use AI SDK tools
- Transforming AI SDK responses to TaskResult format
- Using the built-in ToolCallScorer
- Writing custom scorers for tool validation

You've likely already got a mechanism for passing the user input into your model, for example:

```javascript
async function answerQuestion(prompt: string) {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    prompt,
  });
  return text; // Simple string return is perfectly fine
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
      {
        input: "What is the capital of France?",
        expected: "Paris",
      }
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

### Task Functions with Tool Calls

While simple tasks can return strings directly, tasks that use tools or need to track their execution process can return a `TaskResult` object. This enables comprehensive evaluation of both the output and the process used to generate it.

```javascript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// Example: Vercel AI SDK integration
async function answerWithTools(input: string) {
  const { text, toolCalls, toolResults } = await generateText({
    model: openai("gpt-4"),
    prompt: input,
    tools: {
      getWeather: {
        description: "Get the current weather for a location",
        parameters: z.object({
          location: z.string().describe("The location to get weather for"),
          units: z.enum(["celsius", "fahrenheit"]).optional()
        }),
        execute: async ({ location, units = "fahrenheit" }) => {
          // Call your weather API here
          const weather = await fetchWeather(location, units);
          return weather;
        }
      }
    },
    maxSteps: 3, // Allow multiple tool calls
  });
  
  // Transform AI SDK format to TaskResult format
  const formattedToolCalls = toolCalls?.map((call, i) => ({
    name: call.toolName,
    arguments: call.args,
    result: toolResults?.[i]?.result,
  })) || [];
  
  return {
    result: text,
    toolCalls: formattedToolCalls
  };
}

// See src/ai-sdk-integration.test.ts for a complete working example

// Simple tasks without tools can just return strings
async function answerSimple(input: string) {
  const { text } = await generateText({
    model: openai("gpt-4"),
    prompt: input,
  });
  return text; // Perfectly valid for tasks that don't use tools
}
```

This enables scorers to evaluate not just the final output, but also verify that the model used appropriate tools and reasoning steps.

#### Transforming Provider-Specific Tool Formats

Different LLM providers return tool calls in different formats. Here's how to transform them to our `ToolCall` format:

```javascript
// OpenAI format (with function calling)
function transformOpenAITools(response) {
  const toolCalls = response.choices[0].message.tool_calls?.map(call => ({
    id: call.id,
    name: call.function.name,
    arguments: JSON.parse(call.function.arguments),
    type: 'function',
    status: 'completed',
    // Results come from separate tool call submissions
  })) || [];
  
  return {
    result: response.choices[0].message.content,
    toolCalls,
  };
}

// Anthropic/Claude format
function transformClaudeTools(response) {
  const toolCalls = response.content
    .filter(block => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      arguments: block.input,
      type: 'function',
      status: 'completed',
      // Results come in separate tool_result blocks
    }));
  
  const textContent = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');
  
  return {
    result: textContent,
    toolCalls,
  };
}

// Vercel AI SDK format with error handling
function transformAISDKTools(response) {
  const toolCalls = response.toolCalls?.map((call, i) => {
    const toolResult = response.toolResults?.[i];
    return {
      id: call.toolCallId,
      name: call.toolName,
      arguments: call.args,
      result: toolResult?.result,
      error: toolResult?.error ? {
        message: toolResult.error.message || 'Tool execution failed',
        details: toolResult.error
      } : undefined,
      status: toolResult?.error ? 'failed' : 'completed',
      type: 'function'
    };
  }) || [];
  
  return {
    result: response.text,
    toolCalls,
  };
}

// Example with streaming and partial results
async function handleStreamingTools(stream) {
  const toolCalls = new Map();
  
  for await (const chunk of stream) {
    if (chunk.toolCall) {
      const existing = toolCalls.get(chunk.toolCall.id) || {
        id: chunk.toolCall.id,
        name: chunk.toolCall.toolName,
        arguments: {},
        status: 'executing',
        timestamp: Date.now()
      };
      
      // Merge partial arguments
      Object.assign(existing.arguments, chunk.toolCall.args);
      toolCalls.set(chunk.toolCall.id, existing);
    }
    
    if (chunk.toolResult) {
      const call = toolCalls.get(chunk.toolResult.toolCallId);
      if (call) {
        call.result = chunk.toolResult.result;
        call.status = 'completed';
        call.duration_ms = Date.now() - call.timestamp;
      }
    }
  }
  
  return Array.from(toolCalls.values());
}
```

### Scoring

Scorers evaluate the model's output and return a score between 0 and 1. They can be as simple or as sophisticated as you need.

#### Simple Scorers

For basic evaluations, you can write simple scorers without any TypeScript complexity:

```javascript
// Check if output contains a specific word
export const ContainsWord = async (opts) => {
  return {
    score: opts.output.includes("Paris") ? 1.0 : 0.0,
  };
};

// Check if output matches expected exactly
export const ExactMatch = async (opts) => {
  return {
    score: opts.output === opts.expected ? 1.0 : 0.0,
  };
};

// Check output length
export const LengthCheck = async (opts) => {
  const isValid = opts.output.length > 10 && opts.output.length < 100;
  return {
    score: isValid ? 1.0 : 0.0,
    metadata: {
      rationale: `Output length: ${opts.output.length} characters`,
    },
  };
};

```

#### Advanced Scorers with TypeScript

For more complex evaluations with custom parameters, you can use TypeScript to ensure type safety:

```typescript
import { type ScoreFn, type BaseScorerOptions } from "vitest-evals";

// Define what additional fields your scorer expects
interface ContainsOptions extends BaseScorerOptions {
  searchTerm: string;
  caseSensitive?: boolean;
}

// Create a typed scorer
export const ContainsScorer: ScoreFn<ContainsOptions> = async (opts) => {
  const searchIn = opts.caseSensitive ? opts.output : opts.output.toLowerCase();
  const searchFor = opts.caseSensitive ? opts.searchTerm : opts.searchTerm.toLowerCase();
  
  return {
    score: searchIn.includes(searchFor) ? 1.0 : 0.0,
    metadata: {
      rationale: `Searching for "${opts.searchTerm}" (case ${opts.caseSensitive ? 'sensitive' : 'insensitive'})`,
    },
  };
};

// Usage in your eval:
describeEval("search test", {
  data: async () => [{
    input: "What is the capital of France?",
    searchTerm: "Paris",
    caseSensitive: false,
  }],
  task: async (input) => "The capital is PARIS",
  scorers: [ContainsScorer],
});
```

#### Built-in Tool Usage Scorer

vitest-evals includes a built-in `ToolCallScorer` for evaluating tool usage:

```typescript
import { ToolCallScorer } from "vitest-evals";

// Basic usage - check if expected tools were called
describeEval("tool usage test", {
  data: async () => [{
    input: "Search for weather in Seattle",
    expectedTools: ["search", "weather_api"]
  }],
  task: myTask,
  scorers: [ToolCallScorer()]
});

// Advanced usage - check order and arguments
describeEval("strict tool test", {
  data: async () => [{
    input: "Search for weather in Seattle",
    expectedTools: ["search", "weather_api"],
    expectedArguments: [
      { query: "weather Seattle" },
      { location: "Seattle" }
    ]
  }],
  task: myTask,
  scorers: [ToolCallScorer({ 
    requireExactOrder: true,
    checkArguments: true 
  })]
});

// Custom argument matching
describeEval("custom matching", {
  data: async () => [{
    input: "Calculate something",
    expectedTools: ["calculator"],
    expectedArguments: [{ value: 42 }]
  }],
  task: myTask,
  scorers: [ToolCallScorer({ 
    checkArguments: true,
    argumentMatcher: (expected, actual) => {
      // Custom logic for comparing arguments
      return actual.value === expected.value;
    }
  })]
});
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

#### Compatibility with `autoevals`

We maintain compatibility with the [autoevals package](https://github.com/braintrustdata/autoevals) from Braintrust. To use it you'll typically need to use te `partial` helper provided on the scorers. For example, with the `ClosedQA` scorer:

```javascript
import { describeEval } from "vitest-evals";
import { ClosedQA } from "autoevals";

describeEval("my evals", {
  data: async () => {
    // The scenarios you wish to evaluate
    return [
      {
        input: "What is the capital of France?",
        expected: "Paris",
      }
    ];
  },
  task: answerQuestion,
  scorers: [ClosedQA.partial({
    criteria: "Does the submission indicate that the question is out of scope?",
  })],
  threshold: 0.6,
})
```

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
