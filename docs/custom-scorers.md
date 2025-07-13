# Custom Scorer Examples

This document provides examples of custom scorers for various use cases.

## Built-in Scorers

vitest-evals includes these built-in scorers:

### ToolCallScorer

Evaluates tool/function usage:

```javascript
// Import from main package
import { ToolCallScorer } from "vitest-evals";
// Or import individually
import { ToolCallScorer } from "vitest-evals/scorers/toolCallScorer";

// Basic tool checking
scorers: [ToolCallScorer()]

// Strict order and argument validation
scorers: [ToolCallScorer({ 
  ordered: true,
  params: "strict"
})]
```

## Basic Scorers

### Exact Match

```javascript
export const ExactMatch = async ({ output, expected }) => ({
  score: output === expected ? 1.0 : 0.0
});
```

### Contains Text

```javascript
export const ContainsText = async ({ output, expected }) => ({
  score: output.includes(expected) ? 1.0 : 0.0,
  metadata: {
    rationale: `Looking for "${expected}" in output`
  }
});
```

### Length Validator

```javascript
export const LengthValidator = async ({ output }) => {
  const length = output.length;
  const score = length >= 50 && length <= 500 ? 1.0 : 0.0;
  
  return {
    score,
    metadata: {
      rationale: `Output length: ${length} characters (expected 50-500)`
    }
  };
};
```

## TypeScript Scorers

### Typed Scorer with Options

```typescript
import { type ScoreFn, type BaseScorerOptions } from "vitest-evals";

interface RegexOptions extends BaseScorerOptions {
  pattern: string;
  flags?: string;
}

export const RegexScorer: ScoreFn<RegexOptions> = async (opts) => {
  const regex = new RegExp(opts.pattern, opts.flags);
  const matches = regex.test(opts.output);
  
  return {
    score: matches ? 1.0 : 0.0,
    metadata: {
      rationale: `Pattern /${opts.pattern}/${opts.flags || ''} ${matches ? 'matched' : 'did not match'}`
    }
  };
};
```

### JSON Validator

```typescript
interface JSONValidatorOptions extends BaseScorerOptions {
  schema?: object; // JSON schema
  expectedKeys?: string[];
}

export const JSONValidator: ScoreFn<JSONValidatorOptions> = async (opts) => {
  try {
    const parsed = JSON.parse(opts.output);
    
    if (opts.expectedKeys) {
      const hasAllKeys = opts.expectedKeys.every(key => key in parsed);
      if (!hasAllKeys) {
        const missingKeys = opts.expectedKeys.filter(key => !(key in parsed));
        return {
          score: 0.0,
          metadata: {
            rationale: `Missing required keys: ${missingKeys.join(', ')}`
          }
        };
      }
    }
    
    return {
      score: 1.0,
      metadata: { rationale: "Valid JSON with expected structure" }
    };
  } catch (error) {
    return {
      score: 0.0,
      metadata: { rationale: `Invalid JSON: ${error.message}` }
    };
  }
};
```

## Tool Call Scorers

### Tool Error Checker

```typescript
export const NoFailedToolsScorer: ScoreFn = async (opts) => {
  const toolCalls = opts.toolCalls || [];
  const failedCalls = toolCalls.filter(tc => tc.status === 'failed' || tc.error);
  
  if (failedCalls.length > 0) {
    return {
      score: 0.0,
      metadata: {
        rationale: `${failedCalls.length} tool call(s) failed: ${failedCalls.map(tc => 
          `${tc.name} - ${tc.error?.message || 'unknown error'}`
        ).join(', ')}`
      }
    };
  }
  
  return {
    score: 1.0,
    metadata: {
      rationale: "All tool calls completed successfully"
    }
  };
};
```

### Performance Scorer

```typescript
export const PerformanceScorer: ScoreFn = async (opts) => {
  const toolCalls = opts.toolCalls || [];
  const slowCalls = toolCalls.filter(tc => tc.duration_ms && tc.duration_ms > 1000);
  
  if (slowCalls.length > 0) {
    return {
      score: 0.5,
      metadata: {
        rationale: `${slowCalls.length} tool call(s) were slow (>1s): ${slowCalls.map(tc => 
          `${tc.name} took ${tc.duration_ms}ms`
        ).join(', ')}`
      }
    };
  }
  
  const avgDuration = toolCalls
    .filter(tc => tc.duration_ms)
    .reduce((sum, tc) => sum + (tc.duration_ms || 0), 0) / toolCalls.length || 0;
  
  return {
    score: 1.0,
    metadata: {
      rationale: `All tools executed quickly (avg: ${avgDuration.toFixed(0)}ms)`
    }
  };
};
```

### Tool Sequence Validator

```typescript
interface SequenceOptions extends BaseScorerOptions {
  expectedSequence: string[];
}

export const ToolSequenceValidator: ScoreFn<SequenceOptions> = async (opts) => {
  const toolCalls = opts.toolCalls || [];
  const actualSequence = toolCalls.map(tc => tc.name);
  
  const isCorrect = opts.expectedSequence.every((tool, i) => actualSequence[i] === tool);
  
  return {
    score: isCorrect ? 1.0 : 0.0,
    metadata: {
      rationale: isCorrect
        ? "Tools called in expected sequence"
        : `Expected: ${opts.expectedSequence.join(' → ')}, Got: ${actualSequence.join(' → ')}`
    }
  };
};
```

## Composite Scorers

### Weighted Scorer

```typescript
export function createWeightedScorer(scorers: Array<{ scorer: ScoreFn; weight: number }>) {
  return async (opts: any) => {
    const results = await Promise.all(
      scorers.map(async ({ scorer, weight }) => ({
        result: await scorer(opts),
        weight
      }))
    );
    
    const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
    const weightedScore = results.reduce(
      (sum, r) => sum + (r.result.score || 0) * r.weight,
      0
    ) / totalWeight;
    
    return {
      score: weightedScore,
      metadata: {
        rationale: results.map(r => 
          `${r.result.metadata?.rationale || 'No rationale'} (weight: ${r.weight})`
        ).join('; ')
      }
    };
  };
}

// Usage
const scorer = createWeightedScorer([
  { scorer: ExactMatch, weight: 0.3 },
  { scorer: LengthValidator, weight: 0.2 },
  { scorer: ToolCallScorer(), weight: 0.5 }
]);
```

## LLM-as-Judge Scorers

### Custom Criteria Scorer

```typescript
import { generateObject } from "ai";
import { z } from "zod";

export function createCriteriaScorer(criteria: string, model: any) {
  return async ({ input, output }: BaseScorerOptions) => {
    const { object } = await generateObject({
      model,
      prompt: `
        Evaluate if the following output meets this criteria: ${criteria}
        
        Input: ${input}
        Output: ${output}
        
        Score from 0 to 1 based on how well the output meets the criteria.
      `,
      schema: z.object({
        score: z.number().min(0).max(1),
        rationale: z.string()
      })
    });
    
    return {
      score: object.score,
      metadata: { rationale: object.rationale }
    };
  };
}
```