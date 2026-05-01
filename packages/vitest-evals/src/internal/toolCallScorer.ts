import type { BaseScorerOptions, ScoredResult, ToolCallLike } from "./scoring";
import {
  createMatcher,
  type BaseMatcherConfig,
  type FuzzyMatchOptions,
  type MatchStrategy,
} from "./matchers";

export type ExpectedTool = {
  name: string;
  arguments?: unknown;
};

export interface ToolCallScorerOptions extends BaseScorerOptions {
  expectedTools?: ExpectedTool[];
}

export interface ToolCallScorerConfig extends BaseMatcherConfig {
  ordered?: boolean;
  params?: MatchStrategy;
  fuzzyOptions?: FuzzyMatchOptions;
}

/** Creates a tool-call scorer used by both harness judges and legacy wrappers. */
export function ToolCallScorer(config: ToolCallScorerConfig = {}) {
  const {
    ordered = false,
    requireAll = true,
    allowExtras = true,
    params = "strict",
    fuzzyOptions: userFuzzyOptions,
  } = config;

  const fuzzyOptions: FuzzyMatchOptions = {
    substring: true,
    caseInsensitive: true,
    ignoreArrayOrder: true,
    numericTolerance: 0.001,
    coerceTypes: false,
    ...userFuzzyOptions,
  };
  const argMatcher = createMatcher(params, fuzzyOptions);

  const scorer = async (opts: ToolCallScorerOptions): Promise<ScoredResult> => {
    const expectedTools = opts.expectedTools ?? [];
    const actualCalls = opts.toolCalls ?? [];

    if (expectedTools.length === 0) {
      return {
        score: 1,
        metadata: {
          rationale: "No tool calls expected",
        },
      };
    }

    if (actualCalls.length === 0) {
      return {
        score: 0,
        metadata: {
          rationale: `Expected ${expectedTools.length} tool(s) but none were called`,
        },
      };
    }

    return ordered
      ? evaluateOrderedTools(expectedTools, actualCalls, {
          argMatcher,
          allowExtras,
          requireAllTools: requireAll,
        })
      : evaluateUnorderedTools(expectedTools, actualCalls, {
          argMatcher,
          requireAllTools: requireAll,
          allowExtras,
        });
  };

  Object.defineProperty(scorer, "name", {
    value: "ToolCallScorer",
  });

  return scorer;
}

function evaluateOrderedTools(
  expected: ExpectedTool[],
  actual: ToolCallLike[],
  options: {
    argMatcher: (expected: unknown, actual: unknown) => boolean;
    allowExtras: boolean;
    requireAllTools: boolean;
  },
): ScoredResult {
  let expectedIndex = 0;
  let actualIndex = 0;

  while (expectedIndex < expected.length && actualIndex < actual.length) {
    const expectedTool = expected[expectedIndex];
    const actualTool = actual[actualIndex];

    if (expectedTool.name === actualTool.name) {
      if (
        expectedTool.arguments !== undefined &&
        !options.argMatcher(expectedTool.arguments, actualTool.arguments ?? {})
      ) {
        return {
          score: expectedIndex / expected.length,
          metadata: {
            rationale: `Tool '${expectedTool.name}' called with incorrect arguments at position ${expectedIndex + 1} (${expectedIndex}/${expected.length} tools matched correctly)`,
            expected: expectedTool.arguments,
            actual: actualTool.arguments,
            matched: expectedIndex,
            total: expected.length,
          },
        };
      }

      expectedIndex++;
      actualIndex++;
      continue;
    }

    if (options.allowExtras) {
      actualIndex++;
      continue;
    }

    return {
      score: 0,
      metadata: {
        rationale: `Expected '${expectedTool.name}' at position ${expectedIndex + 1} but found '${actualTool.name}'`,
      },
    };
  }

  if (expectedIndex < expected.length) {
    const missing = expected.slice(expectedIndex).map((tool) => tool.name);
    if (options.requireAllTools) {
      return {
        score: 0,
        metadata: {
          rationale: `Missing required tools in sequence: ${missing.join(", ")}`,
        },
      };
    }

    const matchedCount = expectedIndex;
    const totalCount = expected.length;
    return {
      score: totalCount > 0 ? matchedCount / totalCount : 1,
      metadata: {
        rationale: `Partial match: ${matchedCount}/${totalCount} tools called in order (missing: ${missing.join(", ")})`,
        matched: matchedCount,
        total: totalCount,
      },
    };
  }

  if (!options.allowExtras && actualIndex < actual.length) {
    const extra = actual.slice(actualIndex).map((tool) => tool.name);
    return {
      score: 0,
      metadata: {
        rationale: `Unexpected extra tools: ${extra.join(", ")}`,
      },
    };
  }

  return {
    score: 1,
    metadata: {
      rationale: "All tools called in expected order with correct arguments",
    },
  };
}

function evaluateUnorderedTools(
  expected: ExpectedTool[],
  actual: ToolCallLike[],
  options: {
    argMatcher: (expected: unknown, actual: unknown) => boolean;
    requireAllTools: boolean;
    allowExtras: boolean;
  },
): ScoredResult {
  const remainingExpected = [...expected];
  const remainingActual = [...actual];
  const issues: string[] = [];

  for (let index = remainingExpected.length - 1; index >= 0; index--) {
    const expectedTool = remainingExpected[index];
    const matchIndex = remainingActual.findIndex((actualTool) => {
      if (expectedTool.name !== actualTool.name) {
        return false;
      }

      return expectedTool.arguments === undefined
        ? true
        : options.argMatcher(
            expectedTool.arguments,
            actualTool.arguments ?? {},
          );
    });

    if (matchIndex !== -1) {
      remainingExpected.splice(index, 1);
      remainingActual.splice(matchIndex, 1);
    }
  }

  for (const missingTool of remainingExpected) {
    if (missingTool.arguments !== undefined) {
      const wrongArgsCalls = actual.filter(
        (call) => call.name === missingTool.name,
      );
      issues.push(
        wrongArgsCalls.length > 0
          ? `Tool '${missingTool.name}' called but with incorrect arguments`
          : `Missing required tool: ${missingTool.name}`,
      );
    } else {
      issues.push(`Missing required tool: ${missingTool.name}`);
    }
  }

  const extraTools = remainingActual.map((tool) => tool.name);
  if (!options.allowExtras && extraTools.length > 0) {
    issues.push(`Unexpected extra tools: ${extraTools.join(", ")}`);
  }

  const expectedMatched = expected.length - remainingExpected.length;
  const score = expected.length > 0 ? expectedMatched / expected.length : 1;
  if (issues.length > 0 && (options.requireAllTools || !options.allowExtras)) {
    return {
      score: 0,
      metadata: {
        rationale: issues.join("; "),
      },
    };
  }

  if (score === 1) {
    const extraInfo =
      extraTools.length > 0 ? ` (plus extra: ${extraTools.join(", ")})` : "";

    return {
      score: 1,
      metadata: {
        rationale: `All expected tools were called${extraInfo}`,
      },
    };
  }

  return {
    score,
    metadata: {
      rationale: issues.join("; "),
      matched: expectedMatched,
      total: expected.length,
    },
  };
}
