import type { BaseScorerOptions, ScoreFn } from "../shared";
import { ToolCallScorer as createToolCallScorer } from "../../internal/toolCallScorer";
import type {
  BaseMatcherConfig,
  FuzzyMatchOptions,
  MatchStrategy,
} from "./utils";

export interface ToolCallScorerOptions extends BaseScorerOptions {
  expectedTools?: Array<{
    name: string;
    arguments?: unknown;
  }>;
}

export interface ToolCallScorerConfig extends BaseMatcherConfig {
  ordered?: boolean;
  params?: MatchStrategy<any>;
  fuzzyOptions?: FuzzyMatchOptions;
}

/**
 * Temporary scorer-first compatibility wrapper.
 *
 * Keep new harness-first code on the non-legacy scorer implementation so this
 * wrapper can be deleted without preserving legacy-specific seams.
 */
export function ToolCallScorer(
  config: ToolCallScorerConfig = {},
): ScoreFn<ToolCallScorerOptions> {
  return createToolCallScorer(config) as ScoreFn<ToolCallScorerOptions>;
}
