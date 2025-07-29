import type { ScoreFn, BaseScorerOptions } from "../index";
import {
  type BaseMatcherConfig,
  type MatchStrategy,
  type FuzzyMatchOptions,
  createMatcher,
  formatValue,
  debugLog,
} from "./utils";

export interface StructuredOutputScorerOptions extends BaseScorerOptions {
  // Expected structured output defined in test data
  expected?: Record<string, any>;
}

export interface StructuredOutputScorerConfig extends BaseMatcherConfig {
  /**
   * How to match field values
   * - "strict": Exact equality required (default)
   * - "fuzzy": More flexible matching (case-insensitive strings, numeric tolerance, regex patterns, subset matching)
   * - Custom function: Your own comparison logic
   * @default "strict"
   */
  match?: MatchStrategy;

  /**
   * Field name to check for errors in the output
   * Set to null to disable error checking
   * @default "error"
   */
  errorField?: string | null;

  /**
   * Options for fuzzy matching when match="fuzzy"
   * @default {} for structured output (no substring matching by default)
   */
  fuzzyOptions?: FuzzyMatchOptions;
}

/**
 * A configurable scorer for evaluating structured outputs (e.g., JSON) from LLM responses.
 *
 * Similar to ToolCallScorer but for validating structured data outputs like API queries,
 * configuration objects, or any JSON-serializable data structure.
 *
 * @param config - Configuration options for the scorer
 * @param config.match - How to match field values: "strict", "fuzzy", or custom function
 * @param config.requireAll - Require all expected fields (vs partial credit)
 * @param config.allowExtras - Allow additional fields in output
 * @param config.debug - Enable debug logging
 *
 * @example
 * // Default: strict matching
 * describeEval("query generation", {
 *   data: async () => [{
 *     input: "Show me errors from today",
 *     expected: {
 *       dataset: "errors",
 *       query: "",
 *       sort: "-timestamp",
 *       timeRange: { statsPeriod: "24h" }
 *     }
 *   }],
 *   task: myTask,
 *   scorers: [StructuredOutputScorer()]
 * });
 *
 * @example
 * // Fuzzy matching with regex patterns
 * describeEval("flexible query matching", {
 *   data: async () => [{
 *     input: "Find slow API calls",
 *     expected: {
 *       dataset: "spans",
 *       query: /span\.duration:>1000|span\.duration:>1s/,
 *       sort: "-span.duration"
 *     }
 *   }],
 *   task: myTask,
 *   scorers: [StructuredOutputScorer({ match: "fuzzy" })]
 * });
 *
 * @example
 * // Custom field matching
 * describeEval("custom validation", {
 *   data: async () => [{
 *     input: "Create user config",
 *     expected: {
 *       name: "test",
 *       age: 25,
 *       tags: ["user", "active"]
 *     }
 *   }],
 *   task: myTask,
 *   scorers: [StructuredOutputScorer({
 *     match: (expected, actual, key) => {
 *       if (key === "age") return actual >= 18 && actual <= 100;
 *       return strictEquals(expected, actual);
 *     }
 *   })]
 * });
 */
export function StructuredOutputScorer(
  config: StructuredOutputScorerConfig = {},
): ScoreFn<StructuredOutputScorerOptions> {
  const {
    match = "strict",
    requireAll = true,
    allowExtras = true,
    debug = false,
    errorField = "error",
    fuzzyOptions = {}, // Default: no special fuzzy options for structured output
  } = config;

  // Determine the field matcher - handle 3-parameter custom functions for structured output
  const fieldMatcher =
    typeof match === "function"
      ? match // Use custom function directly with its original signature
      : createMatcher(match, fuzzyOptions);

  return async (opts) => {
    const expected = opts.expected || {};
    const output = opts.output;

    // Parse the output as JSON
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(output);
    } catch (error) {
      return {
        score: 0.0,
        metadata: {
          rationale: `Failed to parse output as JSON: ${error}`,
          output,
        },
      };
    }

    // No expectations means we just check for valid JSON
    if (Object.keys(expected).length === 0) {
      return {
        score: 1.0,
        metadata: {
          rationale: "Valid JSON output (no expected fields specified)",
        },
      };
    }

    // Check for error field in output (common pattern for API responses)
    if (
      errorField !== null &&
      parsed[errorField] &&
      parsed[errorField] !== "" &&
      parsed[errorField] !== null
    ) {
      return {
        score: 0.0,
        metadata: {
          rationale: `Output contains error: ${parsed[errorField]}`,
          output,
        },
      };
    }

    // Compare expected vs actual fields
    const matches: string[] = [];
    const mismatches: Array<{ key: string; expected: any; actual: any }> = [];
    const extras: string[] = [];

    // Check each expected field
    for (const [key, expectedValue] of Object.entries(expected)) {
      const actualValue = parsed[key];

      // Handle both 2-parameter (shared utilities) and 3-parameter (custom) functions
      const isMatch =
        typeof match === "function"
          ? fieldMatcher(expectedValue, actualValue, key)
          : fieldMatcher(expectedValue, actualValue);

      if (isMatch) {
        matches.push(key);
      } else {
        mismatches.push({ key, expected: expectedValue, actual: actualValue });
      }
    }

    // Find extra fields
    const expectedKeys = new Set(Object.keys(expected));
    for (const key of Object.keys(parsed)) {
      if (!expectedKeys.has(key)) {
        extras.push(key);
      }
    }

    if (debug) {
      debugLog("StructuredOutputScorer", {
        expected,
        actual: parsed,
        matches,
        mismatches,
        extras,
      });
    }

    // Calculate score and rationale
    const totalExpected = Object.keys(expected).length;
    const totalMatched = matches.length;

    // Handle various failure conditions
    if (requireAll && mismatches.length > 0) {
      const mismatchDetails = mismatches
        .map(
          (m) =>
            `${m.key}: expected ${formatValue(m.expected)}, got ${formatValue(m.actual)}`,
        )
        .join("; ");
      return {
        score: 0.0,
        metadata: {
          rationale: `Missing required fields: ${mismatches.map((m) => m.key).join(", ")} - ${mismatchDetails}`,
        },
      };
    }

    if (!allowExtras && extras.length > 0) {
      return {
        score: 0.0,
        metadata: {
          rationale: `Unexpected extra fields: ${extras.join(", ")}`,
        },
      };
    }

    // Calculate partial credit score
    const score = totalExpected > 0 ? totalMatched / totalExpected : 1.0;

    if (score === 1.0) {
      const extraInfo =
        extras.length > 0 ? ` (plus extra fields: ${extras.join(", ")})` : "";
      return {
        score: 1.0,
        metadata: {
          rationale: `All expected fields match${extraInfo}`,
        },
      };
    }

    // Partial match
    const mismatchDetails = mismatches
      .map(
        (m) =>
          `${m.key}: expected ${formatValue(m.expected)}, got ${formatValue(m.actual)}`,
      )
      .join("; ");

    return {
      score,
      metadata: {
        rationale: `Matched ${totalMatched}/${totalExpected} fields - ${mismatchDetails}`,
        matched: totalMatched,
        total: totalExpected,
      },
    };
  };
}
