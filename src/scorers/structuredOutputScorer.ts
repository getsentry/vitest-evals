import type { ScoreFn, BaseScorerOptions } from "../index";

export interface StructuredOutputScorerOptions extends BaseScorerOptions {
  // Expected structured output defined in test data
  expected?: Record<string, any>;
}

export interface StructuredOutputScorerConfig {
  /**
   * How to match field values
   * - "strict": Exact equality required (default)
   * - "fuzzy": More flexible matching (case-insensitive strings, numeric tolerance, regex patterns, subset matching)
   * - Custom function: Your own comparison logic
   * @default "strict"
   */
  match?:
    | "strict"
    | "fuzzy"
    | ((expected: any, actual: any, key: string) => boolean);

  /**
   * Whether all expected fields must be present for a passing score
   * When false: gives partial credit based on fields matched
   * @default true
   */
  requireAll?: boolean;

  /**
   * Whether to allow additional fields beyond those expected
   * @default true
   */
  allowExtras?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Default fuzzy matching for field values
 */
function fuzzyMatch(expected: any, actual: any, key: string): boolean {
  // Handle regex patterns
  if (expected instanceof RegExp) {
    return typeof actual === "string" && expected.test(actual);
  }

  // Handle functions (custom validators)
  if (typeof expected === "function") {
    return expected(actual);
  }

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
      ([k, value]) =>
        k in actual && fuzzyMatch(value, actual[k], `${key}.${k}`),
    );
  }

  // For strings, case-insensitive comparison
  if (typeof expected === "string" && typeof actual === "string") {
    return expected.toLowerCase() === actual.toLowerCase();
  }

  // For numbers, allow small differences (0.1% or 0.001, whichever is larger)
  if (typeof expected === "number" && typeof actual === "number") {
    const tolerance = Math.max(Math.abs(expected) * 0.001, 0.001);
    return Math.abs(expected - actual) <= tolerance;
  }

  // For arrays, check if all expected items exist in actual (order doesn't matter in fuzzy mode)
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.every((expItem) =>
      actual.some((actItem) => fuzzyMatch(expItem, actItem, key)),
    );
  }

  // Handle boolean coercion
  if (typeof expected === "boolean" && typeof actual === "string") {
    return expected === (actual.toLowerCase() === "true" || actual === "1");
  }

  // For primitives with type coercion (e.g., "1" matches 1)
  // biome-ignore lint/suspicious/noDoubleEquals: Intentional for fuzzy matching with type coercion
  return expected == actual;
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
  } = config;

  // Determine the field matcher
  const fieldMatcher =
    typeof match === "function"
      ? match
      : match === "strict"
        ? (expected: any, actual: any) => strictEquals(expected, actual)
        : fuzzyMatch;

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
    if (parsed.error && parsed.error !== "" && parsed.error !== null) {
      return {
        score: 0.0,
        metadata: {
          rationale: `Output contains error: ${parsed.error}`,
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

      if (fieldMatcher(expectedValue, actualValue, key)) {
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
      console.log("StructuredOutputScorer debug:");
      console.log("Expected:", expected);
      console.log("Actual:", parsed);
      console.log("Matches:", matches);
      console.log("Mismatches:", mismatches);
      console.log("Extras:", extras);
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

/**
 * Format a value for display in error messages
 */
function formatValue(value: any): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (value instanceof RegExp) return value.toString();
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
