/**
 * Shared utilities for scorer implementations
 */

/**
 * Common configuration options for scorers
 */
export interface BaseMatcherConfig {
  /**
   * Whether all expected items must match for a passing score
   * When false: gives partial credit based on items matched
   * @default true
   */
  requireAll?: boolean;

  /**
   * Whether to allow additional items beyond those expected
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
 * Matching strategy type
 */
export type MatchStrategy<T = any> =
  | "strict"
  | "fuzzy"
  | ((expected: T, actual: T, context?: string) => boolean);

/**
 * Options for fuzzy matching behavior
 */
export interface FuzzyMatchOptions {
  /**
   * Allow case-insensitive string matching
   * @default true
   */
  caseInsensitive?: boolean;

  /**
   * For strings: use substring matching instead of exact match
   * @default false
   */
  substring?: boolean;

  /**
   * For numbers: tolerance for comparison (0.001 = 0.1%)
   * @default 0.001
   */
  numericTolerance?: number;

  /**
   * For arrays: ignore order when comparing
   * @default true
   */
  ignoreArrayOrder?: boolean;

  /**
   * Allow type coercion (e.g., "42" matches 42)
   * @default false
   */
  coerceTypes?: boolean;
}

/**
 * Strict equality comparison (deep equals)
 */
export function strictEquals(expected: any, actual: any): boolean {
  // Handle primitive types and null/undefined
  if (expected === actual) return true;
  if (
    expected === null ||
    expected === undefined ||
    actual === null ||
    actual === undefined
  ) {
    return false;
  }

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
 * Fuzzy matching with flexible comparison logic
 */
export function fuzzyMatch(
  expected: any,
  actual: any,
  options: FuzzyMatchOptions = {},
): boolean {
  const {
    caseInsensitive = true,
    substring = false,
    numericTolerance = 0.001,
    ignoreArrayOrder = true,
    coerceTypes = false,
  } = options;
  // Handle regex patterns
  if (expected instanceof RegExp) {
    return typeof actual === "string" && expected.test(actual);
  }

  // Handle functions (custom validators)
  if (typeof expected === "function") {
    return expected(actual);
  }

  // Null/undefined handling
  if (
    expected === null ||
    expected === undefined ||
    actual === null ||
    actual === undefined
  ) {
    return expected === actual;
  }

  // For objects, check if actual has all expected properties
  if (
    typeof expected === "object" &&
    typeof actual === "object" &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    return Object.entries(expected).every(
      ([k, value]) => k in actual && fuzzyMatch(value, actual[k], options),
    );
  }

  // For strings, apply configured matching rules
  if (typeof expected === "string" && typeof actual === "string") {
    const expectedStr = caseInsensitive ? expected.toLowerCase() : expected;
    const actualStr = caseInsensitive ? actual.toLowerCase() : actual;

    return substring
      ? actualStr.includes(expectedStr)
      : expectedStr === actualStr;
  }

  // For numbers, apply configured tolerance
  if (typeof expected === "number" && typeof actual === "number") {
    const tolerance = Math.max(
      Math.abs(expected) * numericTolerance,
      numericTolerance,
    );
    return Math.abs(expected - actual) <= tolerance;
  }

  // For arrays, apply configured order handling
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (ignoreArrayOrder) {
      // Create a copy of actual to track consumed items
      const actualCopy = [...actual];

      // Try to find a unique match for each expected item
      return expected.every((expItem) => {
        const matchIndex = actualCopy.findIndex((actItem) =>
          fuzzyMatch(expItem, actItem, options),
        );

        if (matchIndex !== -1) {
          // Remove the matched item so it can't be matched again
          actualCopy.splice(matchIndex, 1);
          return true;
        }
        return false;
      });
    }
    return (
      expected.length === actual.length &&
      expected.every((item, i) => fuzzyMatch(item, actual[i], options))
    );
  }

  // Handle type coercion if enabled
  if (coerceTypes) {
    // Boolean coercion
    if (typeof expected === "boolean" && typeof actual === "string") {
      return expected === (actual.toLowerCase() === "true" || actual === "1");
    }

    // Number-string coercion
    if (typeof expected === "string" && typeof actual === "number") {
      return Number.parseFloat(expected) === actual;
    }
    if (typeof expected === "number" && typeof actual === "string") {
      return expected === Number.parseFloat(actual);
    }
  }

  // For all other cases, strict equality
  return expected === actual;
}

/**
 * Create a matcher function based on strategy
 */
export function createMatcher<T = any>(
  strategy: MatchStrategy<T>,
  options?: FuzzyMatchOptions,
): (expected: T, actual: T) => boolean {
  if (typeof strategy === "function") {
    return (expected, actual) => strategy(expected, actual);
  }

  if (strategy === "strict") {
    return strictEquals;
  }

  return (expected, actual) => fuzzyMatch(expected, actual, options || {});
}

/**
 * Format a value for display in error messages
 */
export function formatValue(value: any): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (value instanceof RegExp) return value.toString();
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Calculate partial score based on matches
 */
export function calculatePartialScore(
  matched: number,
  total: number,
  requireAll: boolean,
): number {
  if (requireAll && matched < total) {
    return 0.0;
  }
  return total > 0 ? matched / total : 1.0;
}

/**
 * Helper for debugging matcher results
 */
export function debugLog(
  context: string,
  data: {
    expected: any;
    actual: any;
    matches?: string[];
    mismatches?: Array<{ key: string; expected: any; actual: any }>;
    extras?: string[];
  },
): void {
  console.log(`${context} debug:`);
  console.log("Expected:", data.expected);
  console.log("Actual:", data.actual);
  if (data.matches) console.log("Matches:", data.matches);
  if (data.mismatches) console.log("Mismatches:", data.mismatches);
  if (data.extras) console.log("Extras:", data.extras);
}
