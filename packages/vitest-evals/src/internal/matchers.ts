export interface BaseMatcherConfig {
  requireAll?: boolean;
  allowExtras?: boolean;
  debug?: boolean;
}

export type MatchStrategy<T = unknown> =
  | "strict"
  | "fuzzy"
  | ((expected: T, actual: T, context?: string) => boolean);

export interface FuzzyMatchOptions {
  caseInsensitive?: boolean;
  substring?: boolean;
  numericTolerance?: number;
  ignoreArrayOrder?: boolean;
  coerceTypes?: boolean;
}

type Mismatch = {
  key: string;
  expected: unknown;
  actual: unknown;
};

export interface Logger {
  log: (message: string, ...args: unknown[]) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Compares two values with strict deep equality semantics. */
export function strictEquals(
  expected: unknown,
  actual: unknown,
  context?: string,
): boolean {
  void context;

  if (expected === actual) {
    return true;
  }

  if (
    expected === null ||
    expected === undefined ||
    actual === null ||
    actual === undefined
  ) {
    return false;
  }

  if (typeof expected !== typeof actual) {
    return false;
  }

  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((item, index) =>
        strictEquals(item, actual[index], context),
      )
    );
  }

  if (isRecord(expected) && isRecord(actual)) {
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);

    return (
      expectedKeys.length === actualKeys.length &&
      expectedKeys.every(
        (key) =>
          key in actual && strictEquals(expected[key], actual[key], context),
      )
    );
  }

  return false;
}

function fuzzyMatchString(
  expected: string,
  actual: string,
  options: FuzzyMatchOptions,
): boolean {
  const { caseInsensitive = true, substring = false } = options;
  const expectedText = caseInsensitive ? expected.toLowerCase() : expected;
  const actualText = caseInsensitive ? actual.toLowerCase() : actual;

  return substring
    ? actualText.includes(expectedText) || expectedText.includes(actualText)
    : expectedText === actualText;
}

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

function fuzzyMatchArray(
  expected: unknown[],
  actual: unknown[],
  options: FuzzyMatchOptions,
  context?: string,
): boolean {
  const { ignoreArrayOrder = true } = options;

  if (!ignoreArrayOrder) {
    return (
      expected.length === actual.length &&
      expected.every((item, index) =>
        fuzzyMatch(item, actual[index], options, context),
      )
    );
  }

  const actualUsed = actual.map(() => false);
  return expected.every((expectedItem) => {
    for (const [index, actualItem] of actual.entries()) {
      if (actualUsed[index]) {
        continue;
      }

      if (fuzzyMatch(expectedItem, actualItem, options, context)) {
        actualUsed[index] = true;
        return true;
      }
    }

    return false;
  });
}

function fuzzyMatchObject(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  options: FuzzyMatchOptions,
  context?: string,
): boolean {
  return Object.entries(expected).every(
    ([key, value]) =>
      key in actual && fuzzyMatch(value, actual[key], options, context),
  );
}

function fuzzyMatchWithCoercion(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "boolean" && typeof actual === "string") {
    return expected === (actual.toLowerCase() === "true" || actual === "1");
  }

  if (typeof expected === "string" && typeof actual === "number") {
    return Number.parseFloat(expected) === actual;
  }

  if (typeof expected === "number" && typeof actual === "string") {
    return expected === Number.parseFloat(actual);
  }

  return false;
}

/** Compares two values with the configured fuzzy matching rules. */
export function fuzzyMatch(
  expected: unknown,
  actual: unknown,
  options: FuzzyMatchOptions = {},
  context?: string,
): boolean {
  const { coerceTypes = false } = options;

  if (expected instanceof RegExp) {
    return typeof actual === "string" && expected.test(actual);
  }

  if (typeof expected === "function") {
    return Boolean((expected as (value: unknown) => unknown)(actual));
  }

  if (
    expected === null ||
    expected === undefined ||
    actual === null ||
    actual === undefined
  ) {
    return expected === actual;
  }

  if (typeof expected === "string" && typeof actual === "string") {
    return fuzzyMatchString(expected, actual, options);
  }

  if (typeof expected === "number" && typeof actual === "number") {
    return fuzzyMatchNumber(expected, actual, options);
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return fuzzyMatchArray(expected, actual, options, context);
  }

  if (isRecord(expected) && isRecord(actual)) {
    return fuzzyMatchObject(expected, actual, options, context);
  }

  if (coerceTypes && fuzzyMatchWithCoercion(expected, actual)) {
    return true;
  }

  return expected === actual;
}

/** Builds a reusable matcher function from a strict, fuzzy, or custom strategy. */
export function createMatcher<T = unknown>(
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
    fuzzyMatch(expected, actual, options ?? {}, context);
}

/** Formats a value for scorer rationale and debug output. */
export function formatValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/** Returns a normalized partial-credit score for match-based scorers. */
export function calculatePartialScore(
  matched: number,
  total: number,
  requireAll: boolean,
): number {
  if (requireAll && matched < total) {
    return 0;
  }

  return total > 0 ? matched / total : 1;
}

const defaultLogger: Logger = {
  log: (message: string, ...args: unknown[]) => {
    if (
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test" ||
      process.env.VITEST_EVALS_DEBUG === "true"
    ) {
      console.log(message, ...args);
    }
  },
};

/** Emits scorer debug details through the provided logger. */
export function debugLog(
  context: string,
  data: {
    expected: unknown;
    actual: unknown;
    matches?: string[];
    mismatches?: Mismatch[];
    extras?: string[];
  },
  logger: Logger = defaultLogger,
): void {
  logger.log(`${context} debug:`);
  logger.log("Expected:", data.expected);
  logger.log("Actual:", data.actual);
  if (data.matches) {
    logger.log("Matches:", data.matches);
  }
  if (data.mismatches) {
    logger.log("Mismatches:", data.mismatches);
  }
  if (data.extras) {
    logger.log("Extras:", data.extras);
  }
}
