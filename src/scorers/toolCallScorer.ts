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
   * - "fuzzy": Flexible matching with tolerance for differences
   *   - Case-insensitive string matching
   *   - Numeric tolerance for small differences
   *   - Unordered array comparison
   *   - Subset matching for objects (actual can have extra properties)
   * - Custom function: Your own comparison logic
   *
   * NOTE: Each expected tool call requires a unique actual tool call to match.
   * Multiple identical expected tools need separate actual tool calls.
   *
   * @default "strict"
   */
  params?: MatchStrategy;

  /**
   * Options for fuzzy matching when params="fuzzy"
   * These options are MERGED with defaults, not replaced.
   *
   * Default fuzzy options for tool calls:
   * - substring: true (allow substring matching for strings)
   * - caseInsensitive: true (ignore case differences)
   * - ignoreArrayOrder: true (arrays can be in different orders)
   * - numericTolerance: 0.001 (0.1% tolerance for numbers)
   * - coerceTypes: false (no automatic type conversion)
   *
   * @default { substring: true, caseInsensitive: true, ignoreArrayOrder: true }
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
    fuzzyOptions: userFuzzyOptions,
  } = config;

  // Merge user fuzzyOptions with defaults for tool calls
  const defaultFuzzyOptions: FuzzyMatchOptions = {
    substring: true,
    caseInsensitive: true,
    ignoreArrayOrder: true,
    numericTolerance: 0.001,
    coerceTypes: false,
  };
  const fuzzyOptions: FuzzyMatchOptions = {
    ...defaultFuzzyOptions,
    ...userFuzzyOptions,
  };

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
          // Give partial credit for tools matched up to this point
          const partialScore = expectedIndex / expected.length;
          return {
            score: partialScore,
            metadata: {
              rationale: `Tool '${exp.name}' called with incorrect arguments at position ${expectedIndex + 1} (${expectedIndex}/${expected.length} tools matched correctly)`,
              expected: exp.arguments,
              actual: act.arguments,
              matched: expectedIndex,
              total: expected.length,
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
 *
 * Simple logic:
 * 1. Start with copies of expected and actual tool arrays
 * 2. For each expected tool, find and remove a matching actual tool
 * 3. Remaining expected = missing, remaining actual = extras
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
  // Work with copies so we can remove items
  const remainingExpected = [...expected];
  const remainingActual = [...actual];
  const issues: string[] = [];

  // For each expected tool, find and remove a matching actual tool
  for (let i = remainingExpected.length - 1; i >= 0; i--) {
    const expectedTool = remainingExpected[i];

    // Find a matching actual tool
    const matchIndex = remainingActual.findIndex((actualTool) => {
      // Check if this actual tool matches the expected tool
      if (expectedTool.name !== actualTool.name) {
        return false;
      }

      // Check arguments if specified
      if (expectedTool.arguments !== undefined) {
        return options.argMatcher(
          expectedTool.arguments,
          actualTool.arguments || {},
        );
      }

      return true;
    });

    if (matchIndex !== -1) {
      // Found a match - remove both
      remainingExpected.splice(i, 1);
      remainingActual.splice(matchIndex, 1);
    }
  }

  // Generate issues for missing tools
  for (const missingTool of remainingExpected) {
    if (missingTool.arguments !== undefined) {
      // Check if tool was called but with wrong args
      const wrongArgsCalls = actual.filter((a) => a.name === missingTool.name);
      if (wrongArgsCalls.length > 0) {
        issues.push(
          `Tool '${missingTool.name}' called but with incorrect arguments`,
        );
      } else {
        issues.push(`Missing required tool: ${missingTool.name}`);
      }
    } else {
      issues.push(`Missing required tool: ${missingTool.name}`);
    }
  }

  // Extra tools = remaining actual tools
  const extraTools = remainingActual.map((tool) => tool.name);

  if (!options.allowExtras && extraTools.length > 0) {
    issues.push(`Unexpected extra tools: ${extraTools.join(", ")}`);
  }

  // Calculate score
  const expectedMatched = expected.length - remainingExpected.length;
  const score = expected.length > 0 ? expectedMatched / expected.length : 1.0;

  // If we have any critical issues (wrong tools, missing tools when required, or extra tools when not allowed)
  if (issues.length > 0 && (options.requireAllTools || !options.allowExtras)) {
    return {
      score: 0.0,
      metadata: {
        rationale: issues.join("; "),
      },
    };
  }

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
      total: expected.length,
    },
  };
}
