# vitest-evals Architecture

## Overview

vitest-evals is built on top of Vitest to provide a specialized testing framework for evaluating AI/LLM outputs. It extends Vitest's capabilities with custom scoring functions and reporting.

## Core Components

### 1. Evaluation Framework (`src/index.ts`)

The heart of the system provides two main APIs:

**describeEval()** - Creates test suites for batch evaluation:
- Accepts data function, task function, and scorers
- Runs multiple test cases automatically
- Integrates with Vitest's test runner

**toEval matcher** - Individual evaluation within tests:
- Extends Vitest's expect API
- Evaluates single input/output pairs
- Returns pass/fail based on score threshold

```typescript
export function describeEval(
  name: string,
  options: {
    data: () => Promise<Array<{ input: string } & Record<string, any>>>;
    task: TaskFn;
    scorers: ScoreFn<any>[];
    threshold?: number;
  }
)
```

### 2. Scorer System

Scorers are the pluggable evaluation functions that determine output quality.

#### Scorer Interface

```typescript
type ScoreFn<TOptions extends BaseScorerOptions = BaseScorerOptions> = (
  opts: TOptions,
) => Promise<Score> | Score;

interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCall[];
}

type Score = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: string;
  };
};
```

#### Built-in Scorers
- **ToolCallScorer** (`src/scorers/toolCallScorer.ts`): Evaluates function/tool call accuracy
- More scorers can be added by implementing the ScoreFn interface

### 3. Type System (`src/index.ts`)

Defines the core types:
- `TaskResult`: Flexible output format supporting plain strings or structured results
- `ScoreFn`: Function signature for evaluation logic
- `Score`: Standardized scoring output
- `ToolCall`: Comprehensive tool call structure supporting multiple providers

### 4. Custom Reporter (`src/reporter.ts`)

A Vitest reporter that:
- Displays evaluation scores alongside test results
- Provides visual feedback for score ranges
- Integrates seamlessly with Vitest's output

## Data Flow

1. **Test Execution**: Vitest runs evaluation tests via `describeEval()` or `toEval` matcher
2. **Task Execution**: Task function processes input and returns output (string or TaskResult)
3. **Scorer Application**: Each scorer evaluates the output against test data
4. **Score Aggregation**: Multiple scorer results are averaged
5. **Threshold Check**: Average score compared against threshold
6. **Reporting**: Custom reporter displays results with scores and metadata

## Extension Points

### Adding New Scorers

1. Create scorer file in `src/scorers/` using camelCase naming
2. Implement the `ScoreFn` interface
3. Export from `src/scorers/index.ts` and main index
4. Write comprehensive tests in `src/scorers/[name].test.ts`

### Integration with AI SDKs

The framework is designed to work with various AI SDKs:
- Vercel AI SDK (see `ai-sdk-integration.test.ts`)
- OpenAI SDK
- Anthropic SDK
- Any system producing text/structured output

## Design Principles

1. **Flexibility**: Support multiple output formats and scoring approaches
2. **Type Safety**: Full TypeScript support with strict typing
3. **Testability**: Scorers themselves are easily testable
4. **Compatibility**: Works with existing Vitest ecosystem
5. **Extensibility**: Easy to add new scorers and integrations

## Performance Considerations

- Scorers can be sync or async to handle API calls
- Batch evaluation support for efficiency
- Minimal overhead on top of Vitest
- Lazy loading of scorers when needed

## Error Handling

- Graceful degradation when scorers fail
- Clear error messages for debugging
- Type-safe error boundaries
- Preserves Vitest error reporting