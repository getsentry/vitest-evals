import {
  type Harness,
  type HarnessMetadata,
  latestAssistantMessageContent,
} from "../harness";
import type { JsonValue } from "../harness";
import { createRunJudge } from "./judgeHarness";
import type { JudgeHarness } from "./judgeHarness";
import type { Judge, JudgeContext, JudgeResult } from "./types";

/**
 * Rubric choice returned by a factuality judge model call.
 *
 * @example
 * ```ts
 * import type { FactualityJudgeChoice } from "vitest-evals";
 *
 * const choice: FactualityJudgeChoice = "C";
 * ```
 */
export type FactualityJudgeChoice = "A" | "B" | "C" | "D" | "E";

/**
 * Prompt payload sent to the configured judge harness.
 *
 * @example
 * ```ts
 * import type { FactualityJudgePrompt } from "vitest-evals";
 *
 * const payload: FactualityJudgePrompt = {
 *   system: "Grade factual consistency.",
 *   prompt: "Compare these answers.",
 * };
 * ```
 */
export type FactualityJudgePrompt = {
  /** System prompt for the judge model. */
  system: string;
  /** User prompt containing the question, expert answer, submitted answer, and rubric. */
  prompt: string;
};

/**
 * Parsed verdict returned by a factuality judge model call.
 *
 * @example
 * ```ts
 * import type { FactualityJudgeVerdict } from "vitest-evals";
 *
 * const verdict: FactualityJudgeVerdict = {
 *   choice: "C",
 *   rationale: "The submitted answer matches the expert answer.",
 * };
 * ```
 */
export type FactualityJudgeVerdict = {
  /** Rubric choice selected by the judge model. */
  choice: FactualityJudgeChoice;
  /** Human-readable explanation for the selected choice. */
  rationale: string;
};

const FACTUALITY_CHOICE_SCORES: Record<FactualityJudgeChoice, number> = {
  A: 0.4,
  B: 0.6,
  C: 1,
  D: 0,
  E: 1,
};

const FACTUALITY_SYSTEM =
  "You are comparing factual content. Ignore differences in style, grammar, punctuation, and formatting.";

const FACTUALITY_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["choice", "rationale"],
  properties: {
    choice: {
      enum: ["A", "B", "C", "D", "E"],
    },
    rationale: {
      type: "string",
    },
  },
} as const satisfies JsonValue;

/**
 * Expert answer or reference facts accepted by `FactualityJudge()`.
 *
 * @example
 * ```ts
 * import type { FactualityJudgeExpected } from "vitest-evals";
 *
 * const expected: FactualityJudgeExpected =
 *   "Paris is the capital of France.";
 * ```
 */
export type FactualityJudgeExpected = JsonValue;

/**
 * Configuration for the factuality judge.
 *
 * The judge harness can be supplied here, by `describeEval({ judgeHarness })`,
 * or by `expect(...).toSatisfyJudge(..., { judgeHarness })`. Passing it here
 * keeps the judge self-contained while preserving provider neutrality.
 *
 * @example
 * ```ts
 * import { FactualityJudge, type JudgeHarness } from "vitest-evals";
 *
 * declare const judgeHarness: JudgeHarness;
 *
 * const judge = FactualityJudge({ name: "FactJudge", judgeHarness });
 * ```
 */
export type FactualityJudgeConfig = {
  /** Stable judge name used in assertion messages and reports. */
  name?: string;
  /** Default judge-side harness used when matcher options do not provide one. */
  judgeHarness?: JudgeHarness;
};

type FactualityJudgeMetadata = HarnessMetadata & {
  expected?: FactualityJudgeExpected;
};

/**
 * Matcher context accepted by `FactualityJudge()`.
 *
 * @example
 * ```ts
 * import { aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
 * import { openai } from "@ai-sdk/openai";
 * import { expect } from "vitest";
 * import { FactualityJudge } from "vitest-evals";
 *
 * const judgeHarness = aiSdkJudgeHarness({
 *   model: openai("gpt-4.1-mini"),
 * });
 *
 * await expect(result).toSatisfyJudge(FactualityJudge(), {
 *   expected: "Paris is the capital of France.",
 *   judgeHarness,
 * });
 * ```
 */
export type FactualityJudgeOptions<
  TInput = any,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TOutput, TMetadata> | undefined =
    | Harness<TInput, TOutput, TMetadata>
    | undefined,
> = JudgeContext<TInput, TOutput, TMetadata, THarness> & {
  /** Expert answer or reference facts. Defaults to `metadata.expected`. */
  expected?: FactualityJudgeExpected;
};

/**
 * Creates a factuality judge over normalized harness output.
 *
 * `FactualityJudge()` compares `input`, `output`, and `expected` from the
 * current `JudgeContext`, so the same judge can run against any application
 * harness. Configure the LLM used for grading with `judgeHarness` on the
 * judge, suite, or matcher options.
 *
 * @param config - Optional judge name and reusable judge harness default.
 *
 * @example
 * ```ts
 * import { anthropic } from "@ai-sdk/anthropic";
 * import { aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
 * import { describeEval, FactualityJudge } from "vitest-evals";
 * import { qaHarness } from "./qaHarness";
 *
 * const judgeHarness = aiSdkJudgeHarness({
 *   model: anthropic("claude-sonnet-4-5"),
 *   temperature: 0,
 * });
 * const factualityJudge = FactualityJudge({ judgeHarness });
 *
 * describeEval("qa agent", {
 *   harness: qaHarness,
 *   judges: [factualityJudge],
 * }, (it) => {
 *   it("answers a geography question", async ({ run }) => {
 *     await run("What is the capital of France?", {
 *       metadata: {
 *         expected: "Paris is the capital of France.",
 *       },
 *     });
 *   });
 * });
 * ```
 */
export function FactualityJudge(
  config: FactualityJudgeConfig = {},
): Judge<FactualityJudgeOptions> {
  const judgeHarness = config.judgeHarness;

  return {
    name: config.name ?? "FactualityJudge",
    judgeHarness,
    assess: (opts) => assessFactuality(opts, judgeHarness),
  };
}

async function assessFactuality(
  opts: FactualityJudgeOptions,
  configuredJudgeHarness: JudgeHarness | undefined,
) {
  const metadata = opts.metadata as FactualityJudgeMetadata;
  const expected =
    opts.expected === undefined ? metadata.expected : opts.expected;

  if (isMissingExpectedAnswer(expected)) {
    return {
      score: 0,
      metadata: {
        rationale:
          "FactualityJudge requires a non-empty expert answer in `expected` or `metadata.expected`.",
      },
    };
  }

  const runJudge =
    opts.runJudge ??
    createRunJudge(
      configuredJudgeHarness,
      (opts as { signal?: AbortSignal }).signal,
    );

  if (!runJudge) {
    throw new Error(
      "FactualityJudge requires a judgeHarness in FactualityJudge(...) config, describeEval(...) options, toSatisfyJudge(...) options, or JudgeContext.runJudge.",
    );
  }

  const verdict = await runJudge({
    system: FACTUALITY_SYSTEM,
    prompt: formatFactualityPrompt({
      input: opts.input,
      expected,
      output: resolveJudgeOutput(opts),
    }),
    responseFormat: {
      type: "json",
      schema: FACTUALITY_RESPONSE_SCHEMA,
    },
  });

  return formatJudgeResult(parseFactualityJudgeVerdict(verdict));
}

function isMissingExpectedAnswer(value: FactualityJudgeExpected | undefined) {
  return (
    value == null || (typeof value === "string" && value.trim().length === 0)
  );
}

function resolveJudgeOutput(opts: FactualityJudgeOptions) {
  if (opts.output !== undefined) {
    return opts.output;
  }

  return latestAssistantMessageContent(opts.session) ?? "";
}

function parseFactualityJudgeVerdict(value: unknown): FactualityJudgeVerdict {
  const parsed = typeof value === "string" ? parseJsonObject(value) : value;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "FactualityJudge judgeHarness must return an object with `choice` and `rationale`.",
    );
  }

  const verdict = parsed as Record<string, unknown>;
  if (!isFactualityChoice(verdict.choice)) {
    throw new Error(
      "FactualityJudge judgeHarness must return choice A, B, C, D, or E.",
    );
  }

  if (typeof verdict.rationale !== "string") {
    throw new Error(
      "FactualityJudge judgeHarness must return a string `rationale`.",
    );
  }

  return {
    choice: verdict.choice,
    rationale: verdict.rationale,
  };
}

function parseJsonObject(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    const fencedJson = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!fencedJson) {
      throw new Error(
        "FactualityJudge judgeHarness must return JSON with `choice` and `rationale`.",
      );
    }

    return JSON.parse(fencedJson[1]);
  }
}

function isFactualityChoice(value: unknown): value is FactualityJudgeChoice {
  return (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D" ||
    value === "E"
  );
}

function formatFactualityPrompt({
  input,
  expected,
  output,
}: {
  input: unknown;
  expected: unknown;
  output: unknown;
}) {
  const comparison = formatJudgeValue({
    question: input ?? "",
    expert_answer: expected,
    submitted_answer: output ?? "",
  });

  return `Compare the submitted answer with the expert answer.

Comparison payload:
${comparison}

Select exactly one option:
A: The submission is a fully consistent subset of the expert answer.
B: The submission is a fully consistent superset of the expert answer.
C: The submission contains the same factual details as the expert answer.
D: The submission disagrees with the expert answer.
E: The answers differ only in ways that do not affect factuality.

Return JSON with exactly these fields:
{
  "choice": "C",
  "rationale": "Brief explanation for the selected choice"
}

The choice value must be one of A, B, C, D, or E.`;
}

function formatJudgeValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function formatJudgeResult(object: FactualityJudgeVerdict): JudgeResult {
  return {
    score: FACTUALITY_CHOICE_SCORES[object.choice],
    metadata: {
      rationale: object.rationale,
      choice: object.choice,
    },
  };
}
