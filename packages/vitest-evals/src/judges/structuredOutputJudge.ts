import type { Judge, JudgeContext } from "./types";
import {
  StructuredOutputScorer,
  type StructuredOutputScorerConfig,
  type StructuredOutputScorerOptions,
} from "../internal/structuredOutputScorer";

/**
 * Expected structured fields accepted by `StructuredOutputJudge()`.
 *
 * @example
 * ```ts
 * const expected: StructuredOutputJudgeExpected = {
 *   status: "approved",
 *   risk: "low",
 * };
 * ```
 */
export type StructuredOutputJudgeExpected = Record<string, unknown>;

/**
 * Matcher context accepted by `StructuredOutputJudge()`.
 *
 * @example
 * ```ts
 * await expect(result).toSatisfyJudge(StructuredOutputJudge(), {
 *   expected: { status: "approved" },
 * });
 * ```
 */
export interface StructuredOutputJudgeOptions
  extends JudgeContext<any, any, any>,
    Omit<StructuredOutputScorerOptions, "input" | "output" | "toolCalls"> {
  expected?: StructuredOutputJudgeExpected;
}

/**
 * Configuration for the deterministic structured-output judge.
 *
 * @example
 * ```ts
 * const judge = StructuredOutputJudge({
 *   match: "fuzzy",
 *   fuzzyOptions: { caseInsensitive: true },
 * });
 * ```
 */
export interface StructuredOutputJudgeConfig
  extends StructuredOutputScorerConfig {
  /** Expected structured fields used by this judge instance. */
  expected?: StructuredOutputJudgeExpected;
}

/**
 * Creates a deterministic judge that compares structured output fields.
 *
 * @param config - Matching behavior shared by every assessment from this judge.
 *
 * @example
 * ```ts
 * describeEval("refund agent", {
 *   harness: refundHarness,
 *   judges: [StructuredOutputJudge({ expected: { status: "approved" } })],
 * }, (it) => {
 *   it("returns the expected decision", async ({ run }) => {
 *     await run("Refund invoice inv_123");
 *   });
 * });
 * ```
 */
export function StructuredOutputJudge(
  config: StructuredOutputJudgeConfig = {},
): Judge<StructuredOutputJudgeOptions> {
  const { expected, ...scorerConfig } = config;
  const scorer = StructuredOutputScorer(scorerConfig);
  return {
    name: "StructuredOutputJudge",
    assess: (opts: StructuredOutputJudgeOptions) => {
      return scorer({
        ...opts,
        input: formatStructuredOutput(opts.input),
        expected: opts.expected ?? expected,
        output: formatStructuredOutput(opts.output),
      });
    },
  };
}

function formatStructuredOutput(output: unknown) {
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
