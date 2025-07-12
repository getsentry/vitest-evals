import type { ScoreFn, BaseScorerOptions, ToolCall } from "../index";

export interface ToolCallScorerOptions extends BaseScorerOptions {
  // Expected tools are now defined in the test data
  expectedTools?: Array<{
    name: string;
    arguments?: any;
  }>;
}

export interface ToolCallScorerConfig {
  /**
   * Whether tools must be called in the exact order specified
   * @default false
   */
  ordered?: boolean;

  /**
   * Whether all expected tools must be called for a passing score
   * When false: gives partial credit based on tools matched
   * @default true
   */
  requireAll?: boolean;

  /**
   * Whether to allow additional tool calls beyond those expected
   * @default true
   */
  allowExtras?: boolean;

  /**
   * How to match tool arguments/parameters
   * - "strict": Exact equality required (default)
   * - "fuzzy": Case-insensitive, subset matching, numeric tolerance
   * - Custom function: Your own comparison logic
   * @default "strict"
   */
  params?: "strict" | "fuzzy" | ((expected: any, actual: any) => boolean);
}

/**
 * Default fuzzy matching for arguments
 */
function fuzzyMatch(expected: any, actual: any): boolean {
  // Null/undefined handling
  if (expected == null || actual == null) {
    return expected === actual;
  }

  // For objects, check if actual has all expected properties
  if (
    typeof expected === "object" &&
    typeof actual === "object" &&
    !Array.isArray(expected)
  ) {
    return Object.entries(expected).every(
      ([key, value]) => key in actual && fuzzyMatch(value, actual[key]),
    );
  }

  // For strings, case-insensitive substring match
  if (typeof expected === "string" && typeof actual === "string") {
    return actual.toLowerCase().includes(expected.toLowerCase());
  }

  // For numbers, allow small differences (0.1% or 0.001, whichever is larger)
  if (typeof expected === "number" && typeof actual === "number") {
    const tolerance = Math.max(Math.abs(expected) * 0.001, 0.001);
    return Math.abs(expected - actual) <= tolerance;
  }

  // For arrays, check if all expected items exist in actual (order doesn't matter in fuzzy mode)
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.every((expItem) =>
      actual.some((actItem) => fuzzyMatch(expItem, actItem)),
    );
  }

  // Otherwise strict equality
  return expected === actual;
}

/**
 * Strict equality comparison (deep equals)
 */
function strictEquals(expected: any, actual: any): boolean {
  // Handle primitive types and null/undefined
  if (expected === actual) return true;
  if (expected == null || actual == null) return false;

  // Must be same type
  if (typeof expected !== typeof actual) return false;

  // Handle arrays
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (expected.length !== actual.length) return false;
    return expected.every((item, i) => strictEquals(item, actual[i]));
  }

  // Handle objects
  if (typeof expected === "object") {
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();

    // Must have same keys
    if (expectedKeys.length !== actualKeys.length) return false;
    if (!expectedKeys.every((key, i) => key === actualKeys[i])) return false;

    // All values must match
    return expectedKeys.every((key) =>
      strictEquals(expected[key], actual[key]),
    );
  }

  // Primitive types
  return expected === actual;
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
  } = config;

  // Determine the argument matcher
  const argMatcher =
    typeof params === "function"
      ? params
      : params === "strict"
        ? strictEquals
        : fuzzyMatch;

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
    return {
      score: 0.0,
      metadata: {
        rationale: `Missing required tools in sequence: ${missing.join(", ")}`,
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
