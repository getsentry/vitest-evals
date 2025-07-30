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
   * When enabled, either string can contain the other as a substring:
   * - "weather" matches "weath" (expected contains actual)
   * - "weather forecast" matches "weather" (actual contains expected)
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
export function strictEquals(
  expected: any,
  actual: any,
  context?: string,
): boolean {
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
    return expected.every((item, i) => strictEquals(item, actual[i], context));
  }

  // Handle objects
  if (typeof expected === "object") {
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);

    // Must have same number of keys
    if (expectedKeys.length !== actualKeys.length) return false;

    // All expected keys must exist in actual and have matching values
    return expectedKeys.every(
      (key) =>
        key in actual && strictEquals(expected[key], actual[key], context),
    );
  }

  // All other primitive types already handled by line 84
  return false;
}

/**
 * Fuzzy string matching with configurable options
 */
function fuzzyMatchString(
  expected: string,
  actual: string,
  options: FuzzyMatchOptions,
): boolean {
  const { caseInsensitive = true, substring = false } = options;

  const expectedStr = caseInsensitive ? expected.toLowerCase() : expected;
  const actualStr = caseInsensitive ? actual.toLowerCase() : actual;

  return substring
    ? actualStr.includes(expectedStr) || expectedStr.includes(actualStr)
    : expectedStr === actualStr;
}

/**
 * Fuzzy number matching with tolerance
 */
function fuzzyMatchNumber(
  expected: number,
  actual: number,
  options: FuzzyMatchOptions,
): boolean {
  const { numericTolerance = 0.001 } = options;

  const tolerance = Math.max(
    Math.abs(expected) * numericTolerance,
    numericTolerance,
  );
  return Math.abs(expected - actual) <= tolerance;
}

/**
 * Fuzzy array matching with optional order independence
 */
function fuzzyMatchArray(
  expected: any[],
  actual: any[],
  options: FuzzyMatchOptions,
  context?: string,
): boolean {
  const { ignoreArrayOrder = true } = options;

  if (ignoreArrayOrder) {
    // Track which actual items have been consumed
    const actualUsed = actual.map(() => false);

    // Try to find a unique match for each expected item
    return expected.every((expItem) => {
      // Find first unused actual item that matches
      for (let i = 0; i < actual.length; i++) {
        if (actualUsed[i]) continue; // Already used

        if (fuzzyMatch(expItem, actual[i], options, context)) {
          actualUsed[i] = true; // Mark as used
          return true;
        }
      }
      return false; // No match found
    });
  }

  return (
    expected.length === actual.length &&
    expected.every((item, i) => fuzzyMatch(item, actual[i], options, context))
  );
}

/**
 * Fuzzy object matching (subset matching)
 */
function fuzzyMatchObject(
  expected: object,
  actual: object,
  options: FuzzyMatchOptions,
  context?: string,
): boolean {
  return Object.entries(expected).every(
    ([k, value]) =>
      k in actual && fuzzyMatch(value, (actual as any)[k], options, context),
  );
}

/**
 * Type coercion matching
 */
function fuzzyMatchWithCoercion(
  expected: any,
  actual: any,
  options: FuzzyMatchOptions,
): boolean {
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

  return false;
}

/**
 * Fuzzy matching with flexible comparison logic
 */
export function fuzzyMatch(
  expected: any,
  actual: any,
  options: FuzzyMatchOptions = {},
  context?: string,
): boolean {
  const { coerceTypes = false } = options;

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

  // Type-specific matching
  if (typeof expected === "string" && typeof actual === "string") {
    return fuzzyMatchString(expected, actual, options);
  }

  if (typeof expected === "number" && typeof actual === "number") {
    return fuzzyMatchNumber(expected, actual, options);
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return fuzzyMatchArray(expected, actual, options, context);
  }

  if (
    typeof expected === "object" &&
    typeof actual === "object" &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    return fuzzyMatchObject(expected, actual, options, context);
  }

  // Handle type coercion if enabled
  if (coerceTypes) {
    const coercionResult = fuzzyMatchWithCoercion(expected, actual, options);
    if (coercionResult) return true;
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
): (expected: T, actual: T, context?: string) => boolean {
  if (typeof strategy === "function") {
    return (expected, actual, context) => strategy(expected, actual, context);
  }

  if (strategy === "strict") {
    return (expected, actual, context) =>
      strictEquals(expected, actual, context);
  }

  return (expected, actual, context) =>
    fuzzyMatch(expected, actual, options || {}, context);
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
 * Logger interface for debug output
 */
export interface Logger {
  log: (message: string, ...args: any[]) => void;
}

/**
 * Default logger that respects NODE_ENV and can be disabled
 */
const defaultLogger: Logger = {
  log: (message: string, ...args: any[]) => {
    // Only log in development or test environments, or when explicitly enabled
    if (
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test" ||
      process.env.VITEST_EVALS_DEBUG === "true"
    ) {
      console.log(message, ...args);
    }
  },
};

/**
 * Helper for debugging matcher results with configurable logging
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
  logger: Logger = defaultLogger,
): void {
  logger.log(`${context} debug:`);
  logger.log("Expected:", data.expected);
  logger.log("Actual:", data.actual);
  if (data.matches) logger.log("Matches:", data.matches);
  if (data.mismatches) logger.log("Mismatches:", data.mismatches);
  if (data.extras) logger.log("Extras:", data.extras);
}
