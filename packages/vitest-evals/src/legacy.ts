import {
  assert,
  afterEach as vitestAfterEach,
  beforeEach as vitestBeforeEach,
  describe,
  expect,
  test,
} from "vitest";
import "vitest";
import {
  describeEval as describeHarnessEval,
  formatScores,
  wrapText,
  type HarnessCase,
  type HarnessDescribeEvalOptions,
  type JudgeResult,
} from "./index";
export { configure, evaluate } from "./evaluate";
import type {
  BaseScorerOptions,
  Score,
  ScoreFn,
  TaskFn,
} from "./legacy/shared";
export type {
  BaseScorerOptions,
  Score,
  ScoreFn,
  TaskFn,
  TaskResult,
  ToolCall,
} from "./legacy/shared";
export {
  StructuredOutputScorer,
  type StructuredOutputScorerConfig,
  type StructuredOutputScorerOptions,
  ToolCallScorer,
  type ToolCallScorerConfig,
  type ToolCallScorerOptions,
} from "./scorers";

export interface LegacyDescribeEvalOptions {
  data: () => Promise<
    Array<{ input: string; name?: string } & Record<string, any>>
  >;
  task: TaskFn;
  skipIf?: () => boolean;
  scorers: ScoreFn<any>[];
  threshold?: number | null;
  timeout?: number;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

export type ToEval<R = unknown> = (
  expected: any,
  taskFn: TaskFn,
  scoreFn: ScoreFn<any>,
  threshold?: number,
) => Promise<R>;

declare module "vitest" {
  interface Assertion<T = any> {
    toEval: ToEval<T>;
  }

  interface AsymmetricMatchersContaining {
    toEval: ToEval;
  }
}

expect.extend({
  toEval: async function toEval(
    input: string,
    expected: any,
    taskFn: TaskFn,
    scoreFn: ScoreFn<any>,
    threshold = 1.0,
  ) {
    const taskOutput = await taskFn(input);
    const output =
      typeof taskOutput === "string" ? taskOutput : taskOutput.result;
    const toolCalls =
      typeof taskOutput === "object" ? taskOutput.toolCalls : undefined;

    let result = scoreFn({ input, expected, output, toolCalls });
    if (result instanceof Promise) {
      result = await result;
    }

    return {
      pass: (result.score ?? 0) >= threshold,
      message: () => formatScores([{ ...result, name: scoreFn.name }]),
    };
  },
});

export function describeEval<TCase extends HarnessCase>(
  name: string,
  options: HarnessDescribeEvalOptions<TCase>,
): void;
export function describeEval(
  name: string,
  options: LegacyDescribeEvalOptions,
): void;
export function describeEval(
  name: string,
  options: HarnessDescribeEvalOptions<any> | LegacyDescribeEvalOptions,
) {
  if ("harness" in options) {
    return describeHarnessEval(name, options);
  }

  return describe(name, async () => {
    if (options.beforeEach) {
      vitestBeforeEach(options.beforeEach);
    }
    if (options.afterEach) {
      vitestAfterEach(options.afterEach);
    }

    const testFn = options.skipIf ? test.skipIf(options.skipIf()) : test;
    for (const { input, name: testName, ...params } of await options.data()) {
      testFn(
        testName ?? input,
        {
          timeout: options.timeout ?? 60000,
        },
        async ({ task: testTask }) => {
          const taskOutput = await options.task(input);
          const output =
            typeof taskOutput === "string" ? taskOutput : taskOutput.result;
          const toolCalls =
            typeof taskOutput === "object" ? taskOutput.toolCalls : undefined;
          const threshold =
            options.threshold === undefined ? 1.0 : options.threshold;

          const scores = await Promise.all(
            options.scorers.map((scorer) => {
              const result = scorer({ input, ...params, output, toolCalls });
              if (result instanceof Promise) {
                return result;
              }
              return new Promise<Score>((resolve) => resolve(result));
            }),
          );
          const scoresWithName = scores.map((score, index) => ({
            ...score,
            name: options.scorers[index].name,
          }));

          const avgScore =
            scores.reduce((acc, score) => acc + (score.score ?? 0), 0) /
            scores.length;
          const thresholdFailed = threshold !== null && avgScore < threshold;

          testTask.meta.eval = {
            scores: scoresWithName,
            avgScore,
            output,
            ...(toolCalls && { toolCalls }),
            thresholdFailed,
          };

          if (thresholdFailed) {
            assert(
              avgScore >= threshold,
              [
                `Score: ${avgScore.toFixed(2)} below threshold: ${threshold.toFixed(2)}`,
                `Output: ${wrapText(output)}`,
                formatScores(scoresWithName),
              ].join("\n\n"),
            );
          }
        },
      );
    }
  });
}

export * from "./index";
