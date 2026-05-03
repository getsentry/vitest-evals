import type { JudgeContext, JudgeFn } from "./types";
import {
  StructuredOutputScorer,
  type StructuredOutputScorerConfig,
  type StructuredOutputScorerOptions,
} from "../internal/structuredOutputScorer";
import type { HarnessMetadata } from "../harness";

type StructuredOutputJudgeExpected = Record<string, unknown>;

type StructuredOutputJudgeMetadata = HarnessMetadata & {
  expected?: StructuredOutputJudgeExpected;
};

export interface StructuredOutputJudgeOptions
  extends JudgeContext<any, HarnessMetadata, any>,
    Omit<StructuredOutputScorerOptions, "input" | "output" | "toolCalls"> {
  expected?: StructuredOutputJudgeExpected;
}

export interface StructuredOutputJudgeConfig
  extends StructuredOutputScorerConfig {}

export function StructuredOutputJudge(
  config: StructuredOutputJudgeConfig = {},
): JudgeFn<StructuredOutputJudgeOptions> {
  const scorer = StructuredOutputScorer(config);
  const judge = ((opts: StructuredOutputJudgeOptions) => {
    const metadata = opts.metadata as StructuredOutputJudgeMetadata;

    return scorer({
      ...opts,
      expected: opts.expected ?? metadata.expected,
      output: formatStructuredOutput(opts.run.output),
    });
  }) as JudgeFn<StructuredOutputJudgeOptions>;

  Object.defineProperty(judge, "name", {
    value: "StructuredOutputJudge",
  });

  return judge;
}

function formatStructuredOutput(
  output: StructuredOutputJudgeOptions["run"]["output"],
) {
  if (typeof output === "string") {
    return output;
  }

  if (output !== undefined) {
    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }

  return "";
}
