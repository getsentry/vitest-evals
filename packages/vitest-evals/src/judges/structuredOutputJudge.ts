import type { JudgeFn } from "./types";
import {
  StructuredOutputScorer,
  type StructuredOutputScorerConfig,
  type StructuredOutputScorerOptions,
} from "../scorers/structuredOutputScorer";

export interface StructuredOutputJudgeOptions
  extends StructuredOutputScorerOptions {}

export interface StructuredOutputJudgeConfig
  extends StructuredOutputScorerConfig {}

export function StructuredOutputJudge(
  config: StructuredOutputJudgeConfig = {},
): JudgeFn<StructuredOutputJudgeOptions> {
  const judge = StructuredOutputScorer(
    config,
  ) as JudgeFn<StructuredOutputJudgeOptions>;

  Object.defineProperty(judge, "name", {
    value: "StructuredOutputJudge",
  });

  return judge;
}
