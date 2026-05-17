import type { Judge, JudgeContext } from "./types";
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
  extends JudgeContext<any, any, HarnessMetadata, any>,
    Omit<
      ToolCallScorerOptions,
      "input" | "output" | "toolCalls" | "expectedTools"
    > {
  expectedTools?: ExpectedTool[];
}

export function ToolCallJudge(
  config: ToolCallJudgeConfig = {},
): Judge<ToolCallJudgeOptions> {
  const scorer = ToolCallScorer(config);
  return {
    name: "ToolCallJudge",
    assess: (opts: ToolCallJudgeOptions) => {
      const metadata = opts.metadata as ToolCallJudgeMetadata;

      return scorer({
        ...opts,
        input: formatJudgeValue(opts.input),
        output: formatJudgeValue(opts.output),
        expectedTools: normalizeExpectedTools(
          opts.expectedTools ?? metadata.expectedTools,
        ),
      });
    },
  };
}

function normalizeExpectedTools(expectedTools: ExpectedTool[] | undefined) {
  return expectedTools?.map((tool) =>
    typeof tool === "string" ? { name: tool } : tool,
  );
}

function formatJudgeValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value !== undefined) {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }

  return "";
}
