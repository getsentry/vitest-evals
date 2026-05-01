import type { HarnessRun } from "../harness";
import type { JudgeFn } from "./types";
import {
  StructuredOutputScorer,
  type StructuredOutputScorerConfig,
  type StructuredOutputScorerOptions,
} from "../legacy/scorers/structuredOutputScorer";
import type { HarnessMetadata } from "../harness";

type StructuredOutputJudgeExpected = Record<string, unknown>;

type StructuredOutputJudgeMetadata = HarnessMetadata & {
  expected?: StructuredOutputJudgeExpected;
};

export interface StructuredOutputJudgeOptions
  extends Omit<StructuredOutputScorerOptions, "output"> {
  output: string;
  run: HarnessRun;
  metadata?: StructuredOutputJudgeMetadata;
}

export interface StructuredOutputJudgeConfig
  extends StructuredOutputScorerConfig {}

export function StructuredOutputJudge(
  config: StructuredOutputJudgeConfig = {},
): JudgeFn<StructuredOutputJudgeOptions> {
  const scorer = StructuredOutputScorer(config);
  const judge = ((opts: StructuredOutputJudgeOptions) =>
    scorer({
      ...opts,
      expected: opts.expected ?? opts.metadata?.expected,
      output: formatStructuredOutput(opts.run.output),
    })) as JudgeFn<StructuredOutputJudgeOptions>;

  Object.defineProperty(judge, "name", {
    value: "StructuredOutputJudge",
  });

  return judge;
}

function formatStructuredOutput(output: HarnessRun["output"]) {
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
