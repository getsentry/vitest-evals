# Scorer Examples

This document provides examples of different scorer implementations to help you create your own.

## Basic String Matching Scorer

```typescript
import type { ScoreFn, BaseScorerOptions } from '../index'

interface ExactMatchOptions extends BaseScorerOptions {
  expected: string
  caseSensitive?: boolean
}

export const ExactMatchScorer: ScoreFn<ExactMatchOptions> = async (opts) => {
  const { output, expected, caseSensitive = true } = opts
  
  const normalize = (str: string) => 
    caseSensitive ? str : str.toLowerCase()
  
  const score = normalize(output) === normalize(expected) ? 1 : 0
  
  return { 
    score,
    metadata: {
      rationale: `${score ? 'Exact match' : 'No match'} (case ${caseSensitive ? 'sensitive' : 'insensitive'})`
    }
  }
}
```

## Fuzzy Matching Scorer

```typescript
import type { ScoreFn, BaseScorerOptions } from '../index'

interface FuzzyMatchOptions extends BaseScorerOptions {
  expected: string
  threshold?: number
}

export const FuzzyMatchScorer: ScoreFn<FuzzyMatchOptions> = async (opts) => {
  const { output, expected, threshold = 0.8 } = opts
  
  // Simple character-based similarity
  const maxLen = Math.max(output.length, expected.length)
  if (maxLen === 0) return { 
    score: 1, 
    metadata: { 
      rationale: 'Both strings are empty, resulting in a perfect match'
    } 
  }
  
  let matches = 0
  for (let i = 0; i < maxLen; i++) {
    if (output[i] === expected[i]) matches++
  }
  
  const similarity = matches / maxLen
  const score = similarity >= threshold ? 1 : similarity
  
  return {
    score,
    metadata: { 
      rationale: `Similarity: ${similarity.toFixed(2)} (threshold: ${threshold})`,
      similarity 
    }
  }
}
```

## Async API-Based Scorer

```typescript
import type { ScoreFn, BaseScorerOptions } from '../index'

interface SemanticSimilarityOptions extends BaseScorerOptions {
  expected: string
  apiKey: string
  model?: string
}

export const SemanticSimilarityScorer: ScoreFn<SemanticSimilarityOptions> = async (opts) => {
  const { output, expected, apiKey, model = 'text-embedding-ada-002' } = opts
  
  try {
    // Pseudo-code for API call
    const [outputEmbedding, expectedEmbedding] = await Promise.all([
      getEmbedding(output, apiKey, model),
      getEmbedding(expected, apiKey, model)
    ])
    
    const score = cosineSimilarity(outputEmbedding, expectedEmbedding)
    
    return {
      score,
      metadata: { 
        rationale: `Semantic similarity: ${score.toFixed(2)}`,
        model, 
        method: 'cosine_similarity' 
      }
    }
  } catch (error) {
    return {
      score: 0,
      metadata: {
        rationale: `API error: ${error.message}`
      }
    }
  }
}
```

## JSON Structure Scorer

```typescript
import type { ScoreFn, BaseScorerOptions } from '../index'

interface JSONStructureOptions extends BaseScorerOptions {
  expectedKeys: string[]
  requiredKeys?: string[]
  allowExtraKeys?: boolean
}

export const JSONStructureScorer: ScoreFn<JSONStructureOptions> = async (opts) => {
  const { output, expectedKeys, requiredKeys = [], allowExtraKeys = false } = opts
  
  try {
    const parsed = JSON.parse(output)
    const actualKeys = Object.keys(parsed)
    
    // Check required keys
    const missingRequired = requiredKeys.filter(key => !actualKeys.includes(key))
    if (missingRequired.length > 0) {
      return {
        score: 0,
        metadata: { 
          rationale: `Missing required keys: ${missingRequired.join(', ')}` 
        }
      }
    }
    
    // Check expected keys
    const matchingKeys = expectedKeys.filter(key => actualKeys.includes(key))
    const extraKeys = actualKeys.filter(key => !expectedKeys.includes(key))
    
    let score = matchingKeys.length / expectedKeys.length
    
    if (!allowExtraKeys && extraKeys.length > 0) {
      score *= 0.8 // Penalty for extra keys
    }
    
    return {
      score,
      metadata: {
        rationale: `Matched ${matchingKeys.length}/${expectedKeys.length} keys${extraKeys.length > 0 ? `, ${extraKeys.length} extra` : ''}`,
        matched: matchingKeys,
        extra: extraKeys,
        missing: expectedKeys.filter(key => !actualKeys.includes(key))
      }
    }
  } catch (error) {
    return {
      score: 0,
      metadata: {
        rationale: 'Invalid JSON'
      }
    }
  }
}
```

## Composite Scorer

```typescript
import type { ScoreFn, BaseScorerOptions } from '../index'

interface CompositeOptions extends BaseScorerOptions {
  scorers: Array<{
    scorer: ScoreFn<any>
    params: any
    weight?: number
  }>
}

export const CompositeScorer: ScoreFn<CompositeOptions> = async (opts) => {
  const { input, output, toolCalls, scorers } = opts
  
  const results = await Promise.all(
    scorers.map(async ({ scorer, params, weight = 1 }) => {
      const result = await scorer({ input, output, toolCalls, ...params })
      const score = typeof result === 'number' ? result : result.score
      return { score, weight, result }
    })
  )
  
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0)
  const weightedScore = results.reduce(
    (sum, r) => sum + ((r.score || 0) * r.weight), 
    0
  ) / totalWeight
  
  return {
    score: weightedScore,
    metadata: { 
      rationale: `Composite score from ${results.length} scorers`,
      components: results.map(r => ({
        score: r.score,
        weight: r.weight,
        rationale: r.result.metadata?.rationale
      }))
    }
  }
}
```

## Regex Pattern Scorer

```typescript
import type { ScoreFn, BaseScorerOptions } from '../index'

interface RegexPatternOptions extends BaseScorerOptions {
  patterns: Array<{
    pattern: string
    flags?: string
    required?: boolean
    weight?: number
  }>
}

export const RegexPatternScorer: ScoreFn<RegexPatternOptions> = async (opts) => {
  const { output, patterns } = opts
  
  const results = patterns.map(({ pattern, flags = '', required = false, weight = 1 }) => {
    const regex = new RegExp(pattern, flags)
    const matches = output.match(regex)
    const found = matches !== null
    
    return {
      pattern,
      found,
      required,
      weight,
      matches: matches?.length || 0
    }
  })
  
  // Check required patterns
  const missingRequired = results.filter(r => r.required && !r.found)
  if (missingRequired.length > 0) {
    return {
      score: 0,
      metadata: { 
        rationale: `Missing required patterns: ${missingRequired.map(r => r.pattern).join(', ')}` 
      }
    }
  }
  
  // Calculate weighted score
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0)
  const score = results.reduce(
    (sum, r) => sum + (r.found ? r.weight : 0), 
    0
  ) / totalWeight
  
  return {
    score,
    metadata: {
      rationale: `Matched ${results.filter(r => r.found).length}/${results.length} patterns`,
      patterns: results
    }
  }
}
```

## Using Scorers in Tests

```typescript
import { describe, test, expect } from 'vitest'
import { describeEval } from 'vitest-evals'
import { 
  ExactMatchScorer,
  FuzzyMatchScorer,
  JSONStructureScorer,
  CompositeScorer 
} from './scorers'

describe('AI Output Evaluation', () => {
  test('exact match scoring with toEval', async () => {
    expect('test input').toEval(
      'Hello World',
      async (input) => 'Hello World',
      ExactMatchScorer,
      1.0
    )
  })
  
  test('direct scorer test', async () => {
    const result = await ExactMatchScorer({
      input: 'test input',
      output: 'Hello World',
      expected: 'Hello World'
    })
    expect(result.score).toBe(1)
  })
})

describeEval('composite scoring evaluation', {
  data: async () => [{
    input: 'Generate JSON with name and value',
    expectedKeys: ['name', 'value'],
    patterns: [{ pattern: '"name":\\s*"\\w+"', required: true }]
  }],
  task: async (input) => {
    // Mock AI response
    return JSON.stringify({ name: 'Test', value: 42 })
  },
  scorers: [
    JSONStructureScorer,
    RegexPatternScorer
  ],
  threshold: 0.8
})
```