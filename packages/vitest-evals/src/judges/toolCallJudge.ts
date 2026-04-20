import type { JudgeFn } from "./types";
import {
  ToolCallScorer,
  type ToolCallScorerConfig,
  type ToolCallScorerOptions,
} from "../scorers/toolCallScorer";

export interface ToolCallJudgeOptions extends ToolCallScorerOptions {}

export interface ToolCallJudgeConfig extends ToolCallScorerConfig {}

export function ToolCallJudge(
  config: ToolCallJudgeConfig = {},
): JudgeFn<ToolCallJudgeOptions> {
  const judge = ToolCallScorer(config) as JudgeFn<ToolCallJudgeOptions>;

  Object.defineProperty(judge, "name", {
    value: "ToolCallJudge",
  });

  return judge;
}
