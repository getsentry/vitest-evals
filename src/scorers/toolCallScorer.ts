import type { ScoreFn, BaseScorerOptions, ToolCall } from "../index";
import {
  type BaseMatcherConfig,
  type MatchStrategy,
  type FuzzyMatchOptions,
  createMatcher,
} from "./utils";

export interface ToolCallScorerOptions extends BaseScorerOptions {
  // Expected tools are now defined in the test data
  expectedTools?: Array<{
    name: string;
    arguments?: any;
  }>;
}

export interface ToolCallScorerConfig extends BaseMatcherConfig {
  /**
   * Whether tools must be called in the exact order specified
   * @default false
   */
  ordered?: boolean;

  /**
   * How to match tool arguments/parameters
   * - "strict": Exact equality required (default)
   * - "fuzzy": Case-insensitive, subset matching, numeric tolerance
   * - Custom function: Your own comparison logic
   * @default "strict"
   */
  params?: MatchStrategy;

  /**
   * Options for fuzzy matching when params="fuzzy"
   * @default { substring: true } for tool calls
   */
  fuzzyOptions?: FuzzyMatchOptions;
}

/**
 * A configurable scorer for evaluating tool usage in LLM responses.
 *
 * The test data defines WHAT tools/arguments are expected,
 * while this scorer defines HOW to evaluate them.
 *
 * @param config - Configuration options for the scorer
 * @param config.ordered - Require exact order of tool calls
 * @param config.requireAll - Require all expected tools (vs partial credit)
 * @param config.allowExtras - Allow additional tool calls
 * @param config.params - How to match parameters: "strict", "fuzzy", or custom function
 *
 * @example
 * // Default: strict params, any order
 * describeEval("search test", {
 *   data: async () => [{
 *     input: "Find restaurants",
 *     expectedTools: [
 *       { name: "search", arguments: { type: "restaurant" } },
 *       { name: "filter" }
 *     ]
 *   }],
 *   task: myTask,
 *   scorers: [ToolCallScorer()]
 * });
 *
 * @example
 * // Strict order and parameters
 * describeEval("payment flow", {
 *   data: async () => [{
 *     input: "Process payment",
 *     expectedTools: [
 *       { name: "validate", arguments: { amount: 100 } },
 *       { name: "charge", arguments: { amount: 100, method: "card" } }
 *     ]
 *   }],
 *   task: myTask,
 *   scorers: [ToolCallScorer({ ordered: true, params: "strict" })]
 * });
 */
export function ToolCallScorer(
  config: ToolCallScorerConfig = {},
): ScoreFn<ToolCallScorerOptions> {
  const {
    ordered = false,
    requireAll = true,
    allowExtras = true,
    params = "strict",
    fuzzyOptions = { substring: true }, // Default: substring matching for tools
  } = config;

  // Determine the argument matcher
  const argMatcher = createMatcher(params, fuzzyOptions);

  return async (opts) => {
    const expectedTools = opts.expectedTools || [];
    const actualCalls = opts.toolCalls || [];

    // No expectations means pass
    if (expectedTools.length === 0) {
      return {
        score: 1.0,
        metadata: {
          rationale: "No tool calls expected",
        },
      };
    }

    // No actual calls when we expected some
    if (actualCalls.length === 0) {
      return {
        score: 0.0,
        metadata: {
          rationale: `Expected ${expectedTools.length} tool(s) but none were called`,
        },
      };
    }

    if (ordered) {
      return evaluateOrderedTools(expectedTools, actualCalls, {
        argMatcher,
        allowExtras,
        requireAllTools: requireAll,
      });
    }

    return evaluateUnorderedTools(expectedTools, actualCalls, {
      argMatcher,
      requireAllTools: requireAll,
      allowExtras,
    });
  };
}

/**
 * Evaluate tools that must be called in a specific order
 */
function evaluateOrderedTools(
  expected: Array<{ name: string; arguments?: any }>,
  actual: ToolCall[],
  options: {
    argMatcher: (expected: any, actual: any) => boolean;
    allowExtras: boolean;
    requireAllTools: boolean;
  },
) {
  let expectedIndex = 0;
  let actualIndex = 0;

  // Match expected tools in order
  while (expectedIndex < expected.length && actualIndex < actual.length) {
    const exp = expected[expectedIndex];
    const act = actual[actualIndex];

    if (exp.name === act.name) {
      // Check arguments if specified
      if (exp.arguments !== undefined) {
        const argsMatch = options.argMatcher(
          exp.arguments,
          act.arguments || {},
        );
        if (!argsMatch) {
          return {
            score: 0.5,
            metadata: {
              rationale: `Tool '${exp.name}' called with incorrect arguments at position ${expectedIndex + 1}`,
              expected: exp.arguments,
              actual: act.arguments,
            },
          };
        }
      }
      expectedIndex++;
      actualIndex++;
    } else if (options.allowExtras) {
      // Skip extra tool
      actualIndex++;
    } else {
      // Wrong tool in sequence when extra tools not allowed
      return {
        score: 0.0,
        metadata: {
          rationale: `Expected '${exp.name}' at position ${expectedIndex + 1} but found '${act.name}'`,
        },
      };
    }
  }

  // Check if all expected tools were matched
  if (expectedIndex < expected.length) {
    const missing = expected.slice(expectedIndex).map((t) => t.name);

    if (options.requireAllTools) {
      return {
        score: 0.0,
        metadata: {
          rationale: `Missing required tools in sequence: ${missing.join(", ")}`,
        },
      };
    }

    // Partial credit when requireAllTools is false
    const matchedCount = expectedIndex;
    const totalCount = expected.length;
    const score = totalCount > 0 ? matchedCount / totalCount : 1.0;

    return {
      score,
      metadata: {
        rationale: `Partial match: ${matchedCount}/${totalCount} tools called in order (missing: ${missing.join(", ")})`,
        matched: matchedCount,
        total: totalCount,
      },
    };
  }

  // Check for extra tools at the end if not allowed
  if (!options.allowExtras && actualIndex < actual.length) {
    const extra = actual.slice(actualIndex).map((t) => t.name);
    return {
      score: 0.0,
      metadata: {
        rationale: `Unexpected extra tools: ${extra.join(", ")}`,
      },
    };
  }

  return {
    score: 1.0,
    metadata: {
      rationale: "All tools called in expected order with correct arguments",
    },
  };
}

/**
 * Evaluate tools that can be called in any order
 */
function evaluateUnorderedTools(
  expected: Array<{ name: string; arguments?: any }>,
  actual: ToolCall[],
  options: {
    argMatcher: (expected: any, actual: any) => boolean;
    requireAllTools: boolean;
    allowExtras: boolean;
  },
) {
  const matchedExpected = new Set<number>();
  const matchedActual = new Set<number>();
  const issues: string[] = [];

  // Try to match each expected tool
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    let found = false;

    // Look for a matching actual tool call
    for (let j = 0; j < actual.length; j++) {
      if (matchedActual.has(j)) continue;

      const act = actual[j];
      if (exp.name === act.name) {
        // Check arguments if specified
        if (exp.arguments !== undefined) {
          const argsMatch = options.argMatcher(
            exp.arguments,
            act.arguments || {},
          );
          if (!argsMatch) {
            continue; // Try to find another call with matching args
          }
        }

        // Found a match
        matchedExpected.add(i);
        matchedActual.add(j);
        found = true;
        break;
      }
    }

    if (!found) {
      if (exp.arguments !== undefined) {
        // Check if tool was called but with wrong args
        const wrongArgsCalls = actual.filter((a) => a.name === exp.name);
        if (wrongArgsCalls.length > 0) {
          issues.push(`Tool '${exp.name}' called but with incorrect arguments`);
        } else {
          issues.push(`Missing required tool: ${exp.name}`);
        }
      } else {
        issues.push(`Missing required tool: ${exp.name}`);
      }
    }
  }

  // Check for extra tools
  const extraTools = actual
    .filter((_, i) => !matchedActual.has(i))
    .map((t) => t.name);

  if (!options.allowExtras && extraTools.length > 0) {
    issues.push(`Unexpected extra tools: ${extraTools.join(", ")}`);
  }

  // Calculate score
  const expectedMatched = matchedExpected.size;
  const expectedTotal = expected.length;

  // If we have any critical issues (wrong tools, missing tools when required, or extra tools when not allowed)
  if (issues.length > 0 && (options.requireAllTools || !options.allowExtras)) {
    return {
      score: 0.0,
      metadata: {
        rationale: issues.join("; "),
      },
    };
  }

  // Partial credit when not all required
  const score = expectedTotal > 0 ? expectedMatched / expectedTotal : 1.0;

  if (score === 1.0) {
    const extraInfo =
      extraTools.length > 0 ? ` (plus extra: ${extraTools.join(", ")})` : "";
    return {
      score: 1.0,
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
      total: expectedTotal,
    },
  };
}
