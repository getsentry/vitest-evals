/**
 * Temporary compatibility re-exports for legacy scorer utilities.
 *
 * New harness-first code should import matcher helpers from the non-legacy
 * internal modules instead of this legacy path.
 */
export {
  strictEquals,
  fuzzyMatch,
  createMatcher,
  formatValue,
  calculatePartialScore,
  debugLog,
  type BaseMatcherConfig,
  type MatchStrategy,
  type FuzzyMatchOptions,
  type Logger,
} from "../../internal/matchers";
