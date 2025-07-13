# Testing Standards for vitest-evals

## Overview

This document outlines the testing requirements and best practices for the vitest-evals project. All code contributions must meet these standards.

## Testing Requirements

### Mandatory Testing

**Every scorer MUST have comprehensive tests** covering:
- Happy path scenarios
- Edge cases and error conditions
- Async behavior (if applicable)
- Type safety validation
- Integration with the evaluation framework

### Test Organization

```
src/
├── scorers/
│   ├── toolCallScorer.ts
│   └── toolCallScorer.test.ts    # Co-located test file
├── formatScores.test.ts          # Framework utility tests
├── wrapText.test.ts              # Framework utility tests
├── autoevals-compatibility.test.ts # Autoevals integration tests
└── ai-sdk-integration.test.ts    # AI SDK integration examples
```

## Writing Tests

### Basic Scorer Test Template

```typescript
import { describe, test, expect } from 'vitest'
import { YourScorer } from './yourScorer'

describe('YourScorer', () => {
  test('returns perfect score for exact match', async () => {
    expect('test input').toEval(
      'expected output',
      async (input) => 'expected output',
      YourScorer,
      1.0
    )
  })

  test('returns zero for complete mismatch', async () => {
    expect('test input').toEval(
      'expected output', 
      async (input) => 'wrong output',
      YourScorer,
      0.0
    )
  })

  test('handles edge cases gracefully', async () => {
    const result = await YourScorer({ 
      input: '', 
      output: '', 
      expected: '' 
    })
    expect(result.score).toBeDefined()
  })
})
```

### Testing Async Scorers

```typescript
test('handles async scoring', async () => {
  expect('test input').toEval(
    'expected output',
    async (input) => 'actual output',
    AsyncScorer,
    0.8
  )
})

// Or test scorer directly
test('async scorer returns valid score', async () => {
  const result = await AsyncScorer({
    input: 'test input',
    output: 'test output',
    apiKey: 'test-key'
  })
  expect(result.score).toBeGreaterThanOrEqual(0)
  expect(result.score).toBeLessThanOrEqual(1)
})
```

### Testing Error Conditions

```typescript
test('throws on invalid parameters', async () => {
  await expect(async () => {
    await YourScorer({ input: '', output: '' }) // Missing required param
  }).rejects.toThrow('Missing required parameter')
})

test('handles scorer errors gracefully', async () => {
  const result = await FailingScorer({
    input: 'test',
    output: 'test',
    throwError: true
  })
  expect(result.score).toBe(0)
  expect(result.metadata?.error).toBeDefined()
})
```

## Test Coverage Requirements

### Minimum Coverage
- **90% statement coverage** required
- **85% branch coverage** required
- **100% coverage** for public APIs

### Checking Coverage
```bash
pnpm test -- --coverage
```

### Coverage Exceptions
Only allowed for:
- Third-party integration code
- Development utilities
- Must be explicitly documented

## Integration Testing

### AI SDK Integration Tests

When testing with AI SDKs:
1. Mock external API calls
2. Test both successful and error responses
3. Validate type conversions
4. Test timeout handling

Example:
```typescript
import { generateText } from 'ai'
import { vi } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn()
}))

test('evaluates AI SDK output', async () => {
  vi.mocked(generateText).mockResolvedValue({
    text: 'mocked response'
  })
  
  // Test evaluation logic
})
```

### End-to-End Tests

For complete workflows:
1. Set up realistic test scenarios
2. Use fixture data that represents real use cases
3. Test the full evaluation pipeline
4. Verify reporter output

## Best Practices

### 1. Descriptive Test Names
```typescript
// Good
test('returns partial score for partially correct tool calls', ...)

// Bad
test('test scorer', ...)
```

### 2. Isolated Tests
- Each test should be independent
- No shared state between tests
- Use `beforeEach` for setup if needed

### 3. Realistic Test Data
- Use examples from actual AI outputs
- Test with various output formats
- Include unicode and special characters

### 4. Performance Testing
```typescript
test('completes evaluation within timeout', async () => {
  const start = Date.now()
  await evaluate(largeOutput, YourScorer, params)
  expect(Date.now() - start).toBeLessThan(1000)
})
```

## Running Tests

### Commands
```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test tool-call.test.ts

# Watch mode
pnpm test -- --watch

# Debug mode
pnpm test -- --inspect
```

### Pre-commit Checks
Always run before committing:
```bash
pnpm run lint && pnpm run typecheck && pnpm test
```

## Debugging Tests

### Using Vitest UI
```bash
pnpm test -- --ui
```

### Console Debugging
```typescript
test('debug scorer behavior', () => {
  const output = 'test output'
  console.log('Testing with:', output)
  
  const result = evaluate(output, YourScorer, params)
  console.log('Score:', result.score)
  console.log('Metadata:', result.metadata)
})
```

## Test Maintenance

### When to Update Tests
- When changing scorer behavior
- When adding new features
- When fixing bugs (add regression test)
- When improving performance

### Test Review Checklist
- [ ] All new code has tests
- [ ] Tests are readable and maintainable
- [ ] Edge cases are covered
- [ ] Async behavior is properly tested
- [ ] Error conditions are handled
- [ ] Coverage meets requirements