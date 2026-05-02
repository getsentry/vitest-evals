import type { BaseScorerOptions, ScoredResult } from "./scoring";
import {
  createMatcher,
  debugLog,
  formatValue,
  type BaseMatcherConfig,
  type FuzzyMatchOptions,
  type MatchStrategy,
} from "./matchers";

export interface StructuredOutputScorerOptions extends BaseScorerOptions {
  expected?: Record<string, unknown>;
}

export interface StructuredOutputScorerConfig extends BaseMatcherConfig {
  match?: MatchStrategy;
  errorField?: string | null;
  fuzzyOptions?: FuzzyMatchOptions;
}

function formatMismatchDetails(
  mismatches: Array<{ key: string; expected: unknown; actual: unknown }>,
): string {
  return mismatches
    .map(
      ({ key, expected, actual }) =>
        `${key}: expected ${formatValue(expected)}, got ${formatValue(actual)}`,
    )
    .join("; ");
}

/** Creates a structured-output scorer used by both harness judges and legacy wrappers. */
export function StructuredOutputScorer(
  config: StructuredOutputScorerConfig = {},
) {
  const {
    match = "strict",
    requireAll = true,
    allowExtras = true,
    debug = false,
    errorField = "error",
    fuzzyOptions = {},
  } = config;

  const fieldMatcher =
    typeof match === "function" ? match : createMatcher(match, fuzzyOptions);

  const scorer = async (
    opts: StructuredOutputScorerOptions,
  ): Promise<ScoredResult> => {
    const expected = opts.expected ?? {};
    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(opts.output) as Record<string, unknown>;
    } catch (error) {
      return {
        score: 0,
        metadata: {
          rationale: `Failed to parse output as JSON: ${error}`,
          output: opts.output,
        },
      };
    }

    if (Object.keys(expected).length === 0) {
      return {
        score: 1,
        metadata: {
          rationale: "Valid JSON output (no expected fields specified)",
        },
      };
    }

    const errorValue = errorField !== null ? parsed[errorField] : undefined;
    if (
      errorField !== null &&
      errorValue &&
      errorValue !== "" &&
      errorValue !== null
    ) {
      return {
        score: 0,
        metadata: {
          rationale: `Output contains error: ${String(errorValue)}`,
          output: opts.output,
        },
      };
    }

    const matches: string[] = [];
    const mismatches: Array<{
      key: string;
      expected: unknown;
      actual: unknown;
    }> = [];
    const extras: string[] = [];

    for (const [key, expectedValue] of Object.entries(expected)) {
      const actualValue = parsed[key];
      if (fieldMatcher(expectedValue, actualValue, key)) {
        matches.push(key);
      } else {
        mismatches.push({
          key,
          expected: expectedValue,
          actual: actualValue,
        });
      }
    }

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

    const totalExpected = Object.keys(expected).length;
    const totalMatched = matches.length;

    if (requireAll && mismatches.length > 0) {
      return {
        score: 0,
        metadata: {
          rationale: `Missing required fields: ${mismatches.map((mismatch) => mismatch.key).join(", ")} - ${formatMismatchDetails(mismatches)}`,
        },
      };
    }

    if (!allowExtras && extras.length > 0) {
      return {
        score: 0,
        metadata: {
          rationale: `Unexpected extra fields: ${extras.join(", ")}`,
        },
      };
    }

    const score = totalExpected > 0 ? totalMatched / totalExpected : 1;
    if (score === 1) {
      const extraInfo =
        extras.length > 0 ? ` (plus extra fields: ${extras.join(", ")})` : "";

      return {
        score: 1,
        metadata: {
          rationale: `All expected fields match${extraInfo}`,
        },
      };
    }

    return {
      score,
      metadata: {
        rationale: `Matched ${totalMatched}/${totalExpected} fields - ${formatMismatchDetails(mismatches)}`,
        matched: totalMatched,
        total: totalExpected,
      },
    };
  };

  Object.defineProperty(scorer, "name", {
    value: "StructuredOutputScorer",
  });

  return scorer;
}
