import type { BaseScorerOptions, ScoreFn } from "../shared";
import { StructuredOutputScorer as createStructuredOutputScorer } from "../../internal/structuredOutputScorer";
import type {
  BaseMatcherConfig,
  FuzzyMatchOptions,
  MatchStrategy,
} from "./utils";

/** Options passed to the legacy structured-output scorer. */
export interface StructuredOutputScorerOptions extends BaseScorerOptions {
  expected?: Record<string, unknown>;
}

/** Configuration for the legacy structured-output scorer factory. */
export interface StructuredOutputScorerConfig extends BaseMatcherConfig {
  match?: MatchStrategy<any>;
  errorField?: string | null;
  fuzzyOptions?: FuzzyMatchOptions;
}

/**
 * Temporary scorer-first compatibility wrapper.
 *
 * Keep new harness-first code on the non-legacy scorer implementation so this
 * wrapper can be deleted without preserving legacy-specific seams.
 */
export function StructuredOutputScorer(
  config: StructuredOutputScorerConfig = {},
): ScoreFn<StructuredOutputScorerOptions> {
  return createStructuredOutputScorer(
    config,
  ) as ScoreFn<StructuredOutputScorerOptions>;
}
