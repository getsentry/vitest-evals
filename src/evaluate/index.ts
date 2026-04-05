import { generateObject } from "ai";
import { z } from "zod";
import { assert, test } from "vitest";
import {
  type Transcript,
  formatEvalValue,
  normalizeEvaluateOutput,
  toJudgeUserMessage,
} from "../messages";

type LanguageModel = Parameters<typeof generateObject>[0]["model"];

let defaultModel: LanguageModel | undefined;

export function configure(opts: { model: LanguageModel }) {
  defaultModel = opts.model;
}

const EVAL_SYSTEM = `You are assessing a submitted output based on a given criterion. Ignore differences in style, grammar, punctuation, or length. Focus only on whether the criterion is met.`;

const EVAL_PROMPT = (criteria: string) => `<criteria>
${criteria}
</criteria>

Does the conversation transcript meet the criteria? Select one option:
(A) The criteria is fully met with no issues
(B) The criteria is mostly met with minor gaps
(C) The criteria is partially met with notable gaps
(D) The criteria is barely met or only tangentially addressed
(E) The criteria is not met at all`;

const CHOICE_SCORES: Record<string, number> = {
  A: 1.0,
  B: 0.75,
  C: 0.5,
  D: 0.25,
  E: 0.0,
};

interface EvaluateOptions {
  task: () => Promise<string | { transcript: Transcript }>;
  criteria: string;
  threshold?: number;
}

interface TestTaskContext {
  task: { meta: Record<string, any> };
}

/** @internal Core evaluation logic, exported for testing. */
export async function _evaluate(
  ctx: TestTaskContext,
  opts: EvaluateOptions,
): Promise<void> {
  if (!defaultModel) {
    throw new Error(
      "No model configured. Call configure({ model }) before using evaluate.",
    );
  }

  let taskOutput: string | { transcript: Transcript };
  let evaluationOutput: ReturnType<typeof normalizeEvaluateOutput>;
  try {
    taskOutput = await opts.task();
    evaluationOutput = normalizeEvaluateOutput(taskOutput);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.task.meta.eval = {
      scores: [
        {
          score: 0,
          name: "evaluate",
          metadata: { rationale: `Task failed: ${errorMessage}` },
        },
      ],
      avgScore: 0,
    };
    throw error;
  }

  let object: { answer: string; rationale: string };
  try {
    ({ object } = await generateObject({
      model: defaultModel,
      schema: z.object({
        answer: z.enum(["A", "B", "C", "D", "E"]),
        rationale: z.string(),
      }),
      system: EVAL_SYSTEM,
      messages: [
        toJudgeUserMessage(evaluationOutput.transcript),
        {
          role: "user",
          content: EVAL_PROMPT(opts.criteria),
        },
      ],
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.task.meta.eval = {
      scores: [
        {
          score: 0,
          name: "evaluate",
          metadata: { rationale: `Judge failed: ${errorMessage}` },
        },
      ],
      avgScore: 0,
    };
    throw error;
  }

  const score = CHOICE_SCORES[object.answer];
  const threshold = opts.threshold ?? 1.0;

  ctx.task.meta.eval = {
    scores: [
      {
        score,
        name: "evaluate",
        metadata: { rationale: object.rationale, answer: object.answer },
      },
    ],
    avgScore: score,
  };

  if (score < threshold) {
    assert(
      false,
      `Score: ${score} (${object.answer}) below threshold: ${threshold}\n\n## Output:\n${formatEvalValue(
        typeof taskOutput === "string" ? taskOutput : taskOutput.transcript,
      )}\n\n## Rationale:\n${formatEvalValue(object.rationale)}`,
    );
  }
}

export function evaluate(
  name: string,
  opts: EvaluateOptions & { timeout?: number },
) {
  test(name, { timeout: opts.timeout ?? 60000 }, async ({ task: testTask }) => {
    await _evaluate({ task: testTask }, opts);
  });
}
