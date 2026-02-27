import type { ScoreFn, BaseScorerOptions, Score } from "../index";

/**
 * A model instance compatible with the Vercel AI SDK's `generateObject` function.
 * This is intentionally loose to avoid importing the `ai` package at the type level.
 */
type LanguageModel = Parameters<typeof import("ai").generateObject>[0]["model"];

export interface LLMJudgeConfig {
  /** AI SDK model instance (e.g. `openai("gpt-4o")`) */
  model: LanguageModel;
  /** Evaluation criteria the judge should assess against */
  criteria: string;
}

export interface FactualityConfig {
  /** AI SDK model instance (e.g. `openai("gpt-4o")`) */
  model: LanguageModel;
}

export interface FactualityScorerOptions extends BaseScorerOptions {
  expected?: string;
}

/**
 * LLM-as-a-judge scorer. Evaluates output against arbitrary criteria
 * without requiring an expected answer — the primary scorer for E2E testing.
 *
 * Requires `ai` and `zod` as peer dependencies.
 *
 * @example
 * ```typescript
 * import { LLMJudge } from 'vitest-evals'
 * import { openai } from '@ai-sdk/openai'
 *
 * describeEval("agent responses", {
 *   data: async () => [
 *     { input: "Deploy the latest release" }
 *   ],
 *   task: myAgentTask,
 *   scorers: [
 *     LLMJudge({
 *       model: openai("gpt-4o"),
 *       criteria: "Response should acknowledge the deploy and provide status",
 *     })
 *   ],
 * })
 * ```
 */
export function LLMJudge(config: LLMJudgeConfig): ScoreFn {
  async function llmJudge(opts: BaseScorerOptions): Promise<Score> {
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const { object } = await generateObject({
      model: config.model,
      schema: z.object({
        score: z
          .number()
          .min(0)
          .max(1)
          .describe(
            "Score from 0 to 1 indicating how well the output meets the criteria",
          ),
        rationale: z.string().describe("Brief explanation of the score"),
      }),
      system: `You are an expert evaluator. Score the output based on the given criteria. Return a score from 0 (completely fails) to 1 (perfectly meets criteria).`,
      prompt: `## Input\n${opts.input}\n\n## Output\n${opts.output}\n\n## Criteria\n${config.criteria}`,
    });

    return {
      score: object.score,
      metadata: { rationale: object.rationale },
    };
  }

  return llmJudge;
}

/**
 * Factuality scorer. Compares output against an expected answer using an LLM
 * to classify the factual relationship.
 *
 * Requires `ai` and `zod` as peer dependencies.
 *
 * Classification scores:
 * - Equivalent (C): 1.0
 * - Different but factually correct (E): 1.0
 * - Superset of expected (B): 0.6
 * - Subset of expected (A): 0.4
 * - Contradicts expected (D): 0.0
 *
 * @example
 * ```typescript
 * import { Factuality } from 'vitest-evals'
 * import { openai } from '@ai-sdk/openai'
 *
 * describeEval("factual responses", {
 *   data: async () => [
 *     { input: "What time did the deploy finish?", expected: "The deploy succeeded at 3pm" }
 *   ],
 *   task: myTask,
 *   scorers: [Factuality({ model: openai("gpt-4o") })],
 * })
 * ```
 */
export function Factuality(
  config: FactualityConfig,
): ScoreFn<FactualityScorerOptions> {
  async function factuality(opts: FactualityScorerOptions): Promise<Score> {
    if (!opts.expected) {
      return {
        score: 1.0,
        metadata: { rationale: "No expected answer provided" },
      };
    }

    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const { object } = await generateObject({
      model: config.model,
      schema: z.object({
        answer: z.enum(["A", "B", "C", "D", "E"]).describe(
          `Classification of the relationship:
(A) Subset — submission is a subset of the expert answer
(B) Superset — submission is a superset of the expert answer
(C) Equivalent — submission and expert answer are the same
(D) Contradictory — submission contradicts the expert answer
(E) Different but factual — submission differs but is factually correct`,
        ),
        rationale: z
          .string()
          .describe("Brief explanation of the classification"),
      }),
      system:
        "You are an expert evaluator. Compare the factual content of the submitted answer with the expert answer. Classify their relationship.",
      prompt: `## Question\n${opts.input}\n\n## Expert Answer\n${opts.expected}\n\n## Submitted Answer\n${opts.output}`,
    });

    const scores: Record<string, number> = {
      A: 0.4,
      B: 0.6,
      C: 1.0,
      D: 0.0,
      E: 1.0,
    };

    return {
      score: scores[object.answer],
      metadata: {
        rationale: object.rationale,
        answer: object.answer,
      },
    };
  }

  return factuality;
}
