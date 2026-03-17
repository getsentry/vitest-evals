import {
  assert,
  beforeEach as vitestBeforeEach,
  afterEach as vitestAfterEach,
  describe,
  expect,
  test,
} from "vitest";
import "vitest";
import {
  type EvalDataInput,
  type EvalMessage,
  type TaskInput,
  type TaskResult,
  type ToolCall,
  formatEvalValue,
  getDefaultTestName,
  getTaskInput,
  normalizeScorerPayload,
} from "./messages";
import { wrapText } from "./wrapText";

/**
 * Task function that processes an input and returns either a string result
 * or a TaskResult object containing response messages and any tool calls made.
 */
export type TaskFn = (input: TaskInput) => Promise<string | TaskResult>;

export type Score = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: any;
  } & Record<string, any>;
};

export interface BaseScorerOptions {
  input: string;
  output: string;
  messages: EvalMessage[];
  inputMessages: EvalMessage[];
  outputMessages: EvalMessage[];
  toolCalls?: ToolCall[];
}

export type ScoreFn<TOptions extends BaseScorerOptions = BaseScorerOptions> = (
  opts: TOptions,
) => Promise<Score> | Score;

/**
 * @deprecated Use describeEval() instead for better test organization and multiple scorers support
 */
export type ToEval<R = unknown> = (
  expected: any,
  taskFn: TaskFn,
  scoreFn: ScoreFn<any>,
  threshold?: number,
) => Promise<R>;

export interface EvalMatchers<R = unknown> {
  toEval: ToEval<R>;
}

declare module "vitest" {
  interface Assertion<T = any> extends EvalMatchers<T> {}
  interface AsymmetricMatchersContaining extends EvalMatchers {}

  interface TaskMeta {
    eval?: {
      scores: (Score & { name: string })[];
      avgScore: number;
      toolCalls?: ToolCall[];
    };
  }
}

function formatEvaluationOutputForDisplay(
  taskOutput: string | TaskResult,
): string {
  if (typeof taskOutput === "string") {
    return formatEvalValue(taskOutput);
  }

  if ("result" in taskOutput && taskOutput.result !== undefined) {
    return formatEvalValue(taskOutput.result);
  }

  return formatEvalValue(taskOutput.messages);
}

expect.extend({
  /**
   * Evaluates a language model output against an expected answer using a scoring function.
   *
   * @deprecated Use describeEval() instead for better test organization and multiple scorers support
   */
  toEval: async function toEval(
    input: TaskInput,
    expected: any,
    taskFn: TaskFn,
    scoreFn: ScoreFn<any>,
    threshold = 1.0,
  ) {
    const taskOutput = await taskFn(input);
    const normalized = normalizeScorerPayload(input, taskOutput);

    let result = scoreFn({ expected, ...normalized });
    if (result instanceof Promise) {
      result = await result;
    }

    return {
      pass: (result.score ?? 0) >= threshold,
      message: () => formatScores([{ ...result, name: scoreFn.name }]),
    };
  },
});

export function describeEval(
  name: string,
  {
    data,
    task,
    skipIf,
    scorers,
    threshold = 1.0,
    timeout = 60000,
    beforeEach: beforeEachHook,
    afterEach: afterEachHook,
  }: {
    data: () => Promise<
      Array<{ name?: string } & EvalDataInput & Record<string, any>>
    >;
    task: TaskFn;
    skipIf?: () => boolean;
    scorers: ScoreFn<any>[];
    threshold?: number | null;
    timeout?: number;
    beforeEach?: () => void | Promise<void>;
    afterEach?: () => void | Promise<void>;
  },
) {
  return describe(name, async () => {
    if (beforeEachHook) {
      vitestBeforeEach(beforeEachHook);
    }
    if (afterEachHook) {
      vitestAfterEach(afterEachHook);
    }

    const testFn = skipIf ? test.skipIf(skipIf()) : test;
    for (const testCase of await data()) {
      const {
        input,
        messages,
        name: testName,
        ...params
      } = testCase as {
        input?: string;
        messages?: EvalMessage[];
        name?: string;
      } & Record<string, any>;

      const taskInput = getTaskInput(input, messages);

      testFn(
        testName ?? getDefaultTestName(taskInput),
        {
          timeout,
        },
        async ({ task: testTask }) => {
          const taskOutput = await task(taskInput);
          const normalized = normalizeScorerPayload(taskInput, taskOutput);

          const scores = await Promise.all(
            scorers.map((scorer) => {
              const result = scorer({ ...params, ...normalized });
              if (result instanceof Promise) {
                return result;
              }
              return Promise.resolve(result);
            }),
          );

          const scoresWithName = scores.map((score, index) => ({
            ...score,
            name: scorers[index].name,
          }));

          const avgScore =
            scores.reduce((acc, score) => acc + (score.score ?? 0), 0) /
            scores.length;

          testTask.meta.eval = {
            scores: scoresWithName,
            avgScore,
            ...(normalized.toolCalls && { toolCalls: normalized.toolCalls }),
          };

          if (threshold) {
            assert(
              avgScore >= threshold,
              `Score: ${avgScore} below threshold: ${threshold}\n\n## Output:\n${formatEvaluationOutputForDisplay(
                taskOutput,
              )}\n\n${formatScores(scoresWithName)}`,
            );
          }
        },
      );
    }
  });
}

export function formatScores(scores: (Score & { name: string })[]) {
  return scores
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .map((score) => {
      const scoreLine = `# ${score.name || "Unknown"} [${(score.score ?? 0).toFixed(1)}]`;
      if (
        ((score.score ?? 0) < 1.0 && score.metadata?.rationale) ||
        score.metadata?.output !== undefined
      ) {
        const formattedOutput =
          score.metadata?.output !== undefined
            ? `\n\n## Response\n\n${formatEvalValue(score.metadata.output)}`
            : "";

        return `${scoreLine}${
          score.metadata?.rationale
            ? `\n\n## Rationale\n\n${wrapText(score.metadata.rationale)}`
            : ""
        }${formattedOutput}`;
      }
      return scoreLine;
    })
    .join("\n\n");
}

export { wrapText } from "./wrapText";
export type {
  EvalDataInput,
  EvalMessage,
  EvalPart,
  TaskInput,
  TaskResult,
  ToolCall,
} from "./messages";

export {
  ToolCallScorer,
  type ToolCallScorerOptions,
  StructuredOutputScorer,
  type StructuredOutputScorerOptions,
} from "./scorers";
