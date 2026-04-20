import type { JudgeFn } from "./types";
import {
  ToolCallScorer,
  type ToolCallScorerConfig,
  type ToolCallScorerOptions,
} from "../legacy/scorers/toolCallScorer";

type ExpectedTool =
  | string
  | {
      name: string;
      arguments?: unknown;
    };

export interface ToolCallJudgeConfig extends ToolCallScorerConfig {}

export interface ToolCallJudgeOptions
  extends Omit<ToolCallScorerOptions, "expectedTools"> {
  expectedTools?: ExpectedTool[];
}

export function ToolCallJudge(
  config: ToolCallJudgeConfig = {},
): JudgeFn<ToolCallJudgeOptions> {
  const scorer = ToolCallScorer(config);
  const judge = ((opts: ToolCallJudgeOptions) =>
    scorer({
      ...opts,
      expectedTools: normalizeExpectedTools(opts.expectedTools),
    })) as JudgeFn<ToolCallJudgeOptions>;

  Object.defineProperty(judge, "name", {
    value: "ToolCallJudge",
  });

  return judge;
}

function normalizeExpectedTools(expectedTools: ExpectedTool[] | undefined) {
  return expectedTools?.map((tool) =>
    typeof tool === "string" ? { name: tool } : tool,
  );
}
