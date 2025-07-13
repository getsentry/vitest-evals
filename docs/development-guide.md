# Development Guide

## Getting Started

### Prerequisites
- Node.js 18+ 
- pnpm package manager
- TypeScript knowledge
- Familiarity with Vitest

### Initial Setup
```bash
# Clone the repository
git clone <repo-url>
cd vitest-evals

# Install dependencies
pnpm install

# Run tests to verify setup
pnpm test

# Build the project
pnpm run build
```

## Development Workflow

### 1. Before Making Changes

Always start by:
1. Reading the existing codebase
2. Understanding current patterns
3. Checking documentation
4. Running existing tests

### 2. Making Changes

Follow this process:
1. Create/update tests first (TDD)
2. Implement the minimal code to pass tests
3. Refactor for clarity and performance
4. Update documentation
5. Run quality checks

### 3. Quality Checks

Before committing, always run:
```bash
pnpm run lint        # Code style (biome)
pnpm test           # All tests pass
pnpm run build      # Build succeeds (includes TypeScript validation)
```

## Creating a New Scorer

### Step 1: Plan the Scorer

Determine:
- What it will evaluate
- Input parameters needed
- Score calculation logic
- Sync or async operation

### Step 2: Define Types

Add to `src/index.ts` if needed:
```typescript
interface YourScorerOptions extends BaseScorerOptions {
  expected: string
  threshold?: number
  options?: {
    caseSensitive?: boolean
    trimWhitespace?: boolean
  }
}
```

### Step 3: Write Tests First

Create `src/scorers/yourScorer.test.ts`:
```typescript
import { describe, test, expect } from 'vitest'
import { YourScorer } from './yourScorer'

describe('YourScorer', () => {
  test('basic functionality', async () => {
    expect('test input').toEval(
      'expected output',
      async (input) => 'expected output',
      YourScorer,
      1.0
    )
  })
  
  test('direct scorer test', async () => {
    const result = await YourScorer({
      input: 'test input',
      output: 'expected output',
      expected: 'expected output'
    })
    expect(result.score).toBe(1)
  })
})
```

### Step 4: Implement the Scorer

Create `src/scorers/yourScorer.ts`:
```typescript
import type { ScoreFn, BaseScorerOptions } from '../index'
import type { YourScorerOptions } from '../index'

export const YourScorer: ScoreFn<YourScorerOptions> = async (opts) => {
  // Validation
  if (!opts.expected) {
    throw new Error('Expected value is required')
  }

  // Score calculation
  const score = calculateScore(opts.output, opts.expected, opts.options)

  // Return normalized score (0-1)
  return {
    score,
    metadata: {
      rationale: `Comparing "${opts.output}" with "${opts.expected}"`
    }
  }
}

function calculateScore(
  output: string, 
  expected: string, 
  options?: YourScorerOptions['options']
): number {
  // Implementation
  return output === expected ? 1.0 : 0.0
}
```

### Step 5: Export the Scorer

Add to `src/scorers/index.ts`:
```typescript
export { YourScorer } from './yourScorer'
```

And to `src/index.ts`:
```typescript
export { YourScorer } from './scorers'
```

### Step 6: Document Usage

Update README.md with examples:
```typescript
import { describeEval, YourScorer } from 'vitest-evals'

describeEval('custom scoring test', {
  data: async () => [{
    input: 'test input',
    expected: 'Expected output',
    options: { caseSensitive: false }
  }],
  task: async (input) => await yourAIFunction(input),
  scorers: [YourScorer],
  threshold: 0.8
})
```

## Code Style Guidelines

### TypeScript Best Practices

1. **Explicit Types**
```typescript
// Good
const score: number = 0.5
const params: ScorerParams = { expected: 'value' }

// Bad
const score = 0.5  // Missing type
const params = { expected: 'value' }  // Implicit any
```

2. **Const Assertions**
```typescript
// Good
export const SCORE_THRESHOLDS = {
  PERFECT: 1.0,
  GOOD: 0.8,
  FAIR: 0.6,
  POOR: 0.4
} as const

// Bad
export const SCORE_THRESHOLDS = {
  PERFECT: 1.0,
  // ...
}
```

3. **Error Handling**
```typescript
// Good
if (!params.expected) {
  throw new Error('YourScorer: expected parameter is required')
}

// Bad
if (!params.expected) {
  return 0  // Silent failure
}
```

### Naming Conventions

- **Files**: kebab-case (`tool-call.ts`)
- **Scorers**: PascalCase (`ToolCallScorer`)
- **Functions**: camelCase (`calculateScore`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_SCORE`)
- **Types**: PascalCase (`ScorerParams`)

### Documentation Standards

1. **JSDoc for Public APIs**
```typescript
/**
 * Evaluates the similarity between output and expected text
 * @param output - The text to evaluate
 * @param params - Scorer parameters including expected text
 * @returns Score between 0 and 1
 */
export const TextScorer: Scorer<TextScorerParams> = (output, params) => {
  // ...
}
```

2. **Inline Comments**
```typescript
// Normalize scores to 0-1 range
const normalizedScore = Math.max(0, Math.min(1, rawScore))

// Handle special case for empty strings
if (!output && !params.expected) {
  return { score: 1, metadata: { reason: 'both empty' } }
}
```

## Debugging Tips

### 1. Use Test Debugging
```typescript
test.only('debug specific test', () => {
  // Isolate problematic test
})

test('verbose output', () => {
  const result = evaluate(output, YourScorer, params)
  console.log(JSON.stringify(result, null, 2))
})
```

### 2. Add Metadata
```typescript
return {
  score,
  metadata: {
    input: output.substring(0, 50),
    expected: params.expected.substring(0, 50),
    calculations: debugInfo
  }
}
```

### 3. Use Vitest UI
```bash
pnpm test -- --ui
```

## Performance Optimization

### 1. Lazy Loading
```typescript
// Only import heavy dependencies when needed
const calculateScore = async (output: string) => {
  const { heavyFunction } = await import('./heavy-lib')
  return heavyFunction(output)
}
```

### 2. Memoization
```typescript
import { memoize } from '../utils'

const expensiveCalculation = memoize((input: string) => {
  // Expensive operation
})
```

### 3. Batch Operations
```typescript
export const BatchScorer: Scorer<BatchParams> = async (output, params) => {
  const results = await Promise.all(
    params.expectations.map(exp => evaluate(output, exp))
  )
  return aggregateScores(results)
}
```

## Troubleshooting

### Common Issues

1. **TypeScript Errors**
   - Run `pnpm run typecheck` for details
   - Check tsconfig.json settings
   - Ensure all imports have types

2. **Test Failures**
   - Run tests in watch mode: `pnpm test -- --watch`
   - Check test isolation
   - Verify mock setup

3. **Build Errors**
   - Clear build cache: `rm -rf dist`
   - Check for circular dependencies
   - Verify export statements

### Getting Help

1. Check existing documentation
2. Review similar scorers for patterns
3. Run tests with verbose output
4. Use debugger with breakpoints