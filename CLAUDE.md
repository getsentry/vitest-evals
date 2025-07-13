# vitest-evals Development Guidelines

## 🔴 CRITICAL: Pre-Development Requirements

**MANDATORY READING before ANY code changes:**
- Read existing code structure in `src/` to understand patterns
- Check `src/index.ts` for core framework architecture
- Review test files for testing patterns
- All scorer implementations MUST follow established patterns

### Required Documentation Review
- **Architecture**: MUST read `docs/architecture.md` for system design
- **Testing**: MUST read `docs/testing.md` for test requirements
- **Development**: MUST read `docs/development-guide.md` for workflow
- **Examples**: Check `docs/scorer-examples.md` for implementation patterns

## Repository Overview

vitest-evals is a Vitest-based evaluation framework for testing language model outputs with flexible scoring functions. It provides a structured way to evaluate AI model outputs against expected results.

## Repository Structure

```
vitest-evals/
├── src/
│   ├── index.ts                     # Main entry point, types, and core framework
│   ├── reporter.ts                  # Custom Vitest reporter
│   ├── scorers/                     # Scorer implementations
│   │   ├── index.ts                 # Scorers export file
│   │   ├── toolCallScorer.ts        # Tool call evaluation scorer
│   │   └── toolCallScorer.test.ts   # Tool call scorer tests
│   ├── ai-sdk-integration.test.ts   # AI SDK integration example
│   ├── autoevals-compatibility.test.ts # Autoevals compatibility tests
│   ├── formatScores.test.ts         # Format scores tests
│   └── wrapText.test.ts             # Wrap text tests
├── docs/                           # Project documentation
│   ├── architecture.md             # System architecture overview
│   ├── testing.md                  # Testing standards and requirements
│   ├── development-guide.md        # Development workflow and tips
│   ├── scorer-examples.md          # Example scorer implementations
│   ├── custom-scorers.md           # Custom scorer examples
│   └── provider-transformations.md # Provider tool call transformations
├── scripts/
│   └── craft-pre-release.sh        # Release preparation script
├── tsup.config.ts                  # Build configuration
├── tsconfig.json                   # TypeScript configuration
├── biome.json                      # Code formatter/linter config
└── package.json                    # Project dependencies and scripts
```

## Core Components Impact Analysis

When making changes, consider these areas:

### Framework Core (`src/index.ts`)
- **describeEval()** function: Main evaluation entry point for test suites
- **toEval** matcher: Vitest matcher for individual evaluations
- **TaskResult** handling: Supports string or {result, toolCalls}
- **ScoreFn** interface: All scorers must implement this
- **Async/sync support**: Both scorer types supported
- **Type definitions**: All TypeScript interfaces defined here

### Custom Reporter (`src/reporter.ts`)
- **Score display**: Shows evaluation results
- **Error reporting**: Handles test failures
- **Progress tracking**: Visual feedback during tests

### Scorer System (`src/scorers/`)
- **ToolCallScorer**: Evaluates tool/function call accuracy (only built-in scorer)
- **Flexible parameters**: Support various parameter names
- **Type safety**: Full TypeScript support
- **Autoevals compatibility**: Works with existing scorers

## 🔴 CRITICAL: Code Standards

### TypeScript Requirements
- **Strict mode**: All code must pass strict TypeScript checks
- **Explicit types**: No implicit any types
- **Interface-driven**: Define interfaces before implementation

### Testing Requirements
- **All scorers MUST have tests**: No exceptions
- **Test edge cases**: Error conditions, async behavior
- **Integration tests**: Test with actual AI outputs
- **Run tests**: `pnpm test` must pass before completion

### Code Quality
- **Lint check**: `pnpm run lint` must pass
- **Type check**: `pnpm run typecheck` must pass
- **Format**: `pnpm run format` for consistent style

## Key Commands

```bash
# Development
pnpm test          # Run all tests
pnpm run build     # Build the package
pnpm run lint      # Check code style
pnpm run format    # Auto-format code
pnpm run typecheck # Verify TypeScript types

# Before completing ANY task
pnpm run lint && pnpm run typecheck && pnpm test
```

## Architecture Patterns

### Scorer Implementation
- Implement the `Scorer` interface
- Support both sync and async evaluation
- Handle errors gracefully
- Return normalized scores (0-1 range typical)

### TaskResult Handling
```typescript
type TaskResult = string | { result: string; toolCalls?: any[] }
```
- Always handle both formats
- Extract result string appropriately
- Pass tool calls to specialized scorers

### Parameter Flexibility
- Support multiple parameter names (e.g., `expected` or `expectedTools`)
- Use TypeScript generics for type safety
- Document parameter requirements

## Documentation Requirements

### Code Documentation
- Document all public APIs with JSDoc
- Include usage examples in comments
- Explain complex logic inline

### README Updates
- Keep examples current with API changes
- Document new scorers when added
- Update compatibility notes

## Current Features

### Implemented
- Core evaluation framework
- Custom Vitest reporter
- ToolCallScorer for function evaluation
- Autoevals library compatibility
- Flexible parameter naming

### In Progress
- Additional scorer implementations
- Enhanced error handling
- Performance optimizations

## Documentation Maintenance

**CRITICAL**: Documentation must be kept up-to-date with code changes
- Update relevant docs when modifying code
- Add examples when creating new scorers
- Document breaking changes prominently
- Keep CLAUDE.md synchronized with project state

## Development Process

1. **Review existing code** to understand patterns
2. **Write tests first** for new features
3. **Implement** following established patterns
4. **Verify** with lint, typecheck, and tests
5. **Document** changes in code and README

## Common Patterns

### Creating a New Scorer
1. Define the scorer interface extending `BaseScorerOptions` in `src/index.ts`
2. Implement in `src/scorers/[name].ts` following camelCase naming
3. Write comprehensive tests in `src/scorers/[name].test.ts`
4. Export from `src/scorers/index.ts` and main index
5. Document usage in README

### Testing Scorers
```typescript
import { describe, test, expect } from 'vitest'
import { YourScorer } from '../src/scorers/yourScorer'

test('scorer evaluates correctly', async () => {
  expect('test input').toEval(
    'expected output',
    async (input) => 'test output',
    YourScorer,
    1.0
  )
})
```

## Package Manager

This project uses **pnpm** (not npm). Always use pnpm commands.

## Validation Checklist

Before marking ANY task complete:
- [ ] Code passes `pnpm run lint`
- [ ] Code passes `pnpm run typecheck`  
- [ ] All tests pass with `pnpm test`
- [ ] New features have tests
- [ ] Documentation is updated
- [ ] Examples work correctly