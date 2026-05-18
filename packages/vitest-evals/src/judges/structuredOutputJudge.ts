import type { Judge, JudgeContext } from "./types";
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

/** Matcher context accepted by `StructuredOutputJudge()`. */
export interface StructuredOutputJudgeOptions
  extends JudgeContext<any, any, HarnessMetadata, any>,
    Omit<StructuredOutputScorerOptions, "input" | "output" | "toolCalls"> {
  expected?: StructuredOutputJudgeExpected;
}

/** Configuration for the deterministic structured-output judge. */
export interface StructuredOutputJudgeConfig
  extends StructuredOutputScorerConfig {}

/** Creates a deterministic judge that compares structured output fields. */
export function StructuredOutputJudge(
  config: StructuredOutputJudgeConfig = {},
): Judge<StructuredOutputJudgeOptions> {
  const scorer = StructuredOutputScorer(config);
  return {
    name: "StructuredOutputJudge",
    assess: (opts: StructuredOutputJudgeOptions) => {
      const metadata = opts.metadata as StructuredOutputJudgeMetadata;

      return scorer({
        ...opts,
        input: formatStructuredOutput(opts.input),
        expected: opts.expected ?? metadata.expected,
        output: formatStructuredOutput(opts.output),
      });
    },
  };
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
