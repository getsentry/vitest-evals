import type { JudgeContext, JudgeFn } from "./types";
import {
  ToolCallScorer,
  type ToolCallScorerConfig,
  type ToolCallScorerOptions,
} from "../internal/toolCallScorer";
import type { HarnessMetadata } from "../harness";

type ExpectedTool =
  | string
  | {
      name: string;
      arguments?: unknown;
    };

export interface ToolCallJudgeConfig extends ToolCallScorerConfig {}

type ToolCallJudgeMetadata = HarnessMetadata & {
  expectedTools?: ExpectedTool[];
};

export interface ToolCallJudgeOptions
  extends JudgeContext<any, HarnessMetadata, any>,
    Omit<
      ToolCallScorerOptions,
      "input" | "output" | "toolCalls" | "expectedTools"
    > {
  expectedTools?: ExpectedTool[];
}

export function ToolCallJudge(
  config: ToolCallJudgeConfig = {},
): JudgeFn<ToolCallJudgeOptions> {
  const scorer = ToolCallScorer(config);
  const judge = ((opts: ToolCallJudgeOptions) => {
    const metadata = opts.metadata as ToolCallJudgeMetadata;

    return scorer({
      ...opts,
      expectedTools: normalizeExpectedTools(
        opts.expectedTools ?? metadata.expectedTools,
      ),
    });
  }) as JudgeFn<ToolCallJudgeOptions>;

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
