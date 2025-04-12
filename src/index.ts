import { assert, describe, expect, test } from "vitest";
import "vitest";

export type TaskFn = (input: string) => Promise<string>;

export type Score = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: string;
  };
};

export type ScoreFn = (opts: {
  input: string;
  output: string;
  expected?: string;
}) => Promise<Score> | Score;

export type ToEval<R = unknown> = (
  expected: string,
  taskFn: TaskFn,
  scoreFn: ScoreFn,
  threshold?: number,
) => Promise<R>;

export interface EvalMatchers<R = unknown> {
  toEval: ToEval<R>;
}

declare module "vitest" {
  interface Assertion<T = any> extends EvalMatchers<T> {}
  interface AsymmetricMatchersContaining extends EvalMatchers {}
}

expect.extend({
  /**
   * Evaluates a language model output against an expected answer using a scoring function.
   *
   * @param expected - The expected (ground truth) answer
   * @param taskFn - Async function that processes the input and returns the model output
   * @param scoreFn - Function that evaluates the model output against the expected answer
   * @param threshold - Minimum acceptable score (0-1), defaults to 1.0
   *
   * @example
   * ```ts
   * test("checks capital of France", async () => {
   *   expect("What is the capital of France?").toEval(
   *     "Paris",
   *     async (input) => {
   *       // Query LLM here
   *       return "Paris";
   *     },
   *     checkFactuality,
   *     0.8
   *   );
   * });
   * ```
   */
  toEval: async function toEval(
    input: string,
    expected: string,
    taskFn: TaskFn,
    scoreFn: ScoreFn,
    threshold = 1.0,
  ) {
    const { isNot } = this;

    const output = await taskFn(input);

    let result = scoreFn({ input, expected, output });
    if (result instanceof Promise) {
      result = await result;
    }

    return {
      pass: (result.score ?? 0) >= threshold,
      message: () =>
        `Score: ${result.score} ${isNot ? "<" : ">"} ${threshold}\n${
          result.metadata ? `Rationale: ${result.metadata.rationale}` : ""
        }`,
    };
  },
});

/**
 * Creates a test suite for evaluating language model outputs.
 *
 * @param name - The name of the test suite
 * @param options - Configuration options
 * @param options.data - Async function that returns an array of test cases with input and expected values
 * @param options.task - Function that processes the input and returns the model output
 * @param options.skipIf - Optional function that determines if tests should be skipped
 * @param options.scorers - Array of scoring functions that evaluate model outputs
 * @param options.threshold - Minimum acceptable average score (0-1), defaults to 1.0
 * @param options.timeout - Test timeout in milliseconds, defaults to 10000
 *
 * @example
 * ```ts
 * describeEval("capital cities test", {
 *   data: async () => [{
 *     input: "What is the capital of France?",
 *     expected: "Paris"
 *   }],
 *   task: async (input) => {
 *     // Query LLM here
 *     return "Paris";
 *   },
 *   scorers: [checkFactuality],
 *   threshold: 0.8
 * });
 * ```
 */
export function describeEval(
  name: string,
  {
    data,
    task,
    skipIf,
    scorers,
    threshold = 1.0,
    // increase default test timeout as 5s is usually not enough for
    // a single factuality check
    timeout = 10000,
  }: {
    data: () => Promise<{ input: string; expected: string }[]>;
    task: TaskFn;
    skipIf?: () => boolean;
    scorers: ScoreFn[];
    threshold?: number | null;
    timeout?: number;
  },
) {
  return describe(name, async () => {
    const testFn = skipIf ? test.skipIf(skipIf()) : test;
    // TODO: should data just be a generator?
    for (const { input, expected } of await data()) {
      testFn(
        input,
        {
          timeout,
        },
        async () => {
          const output = await task(input);

          const scores = await Promise.all(
            scorers.map((scorer) => {
              const result = scorer({ input, expected, output });
              if (result instanceof Promise) {
                return result;
              }
              return new Promise<Score>((resolve) => resolve(result));
            }),
          );
          const scoresWithName = scores.map((s, i) => ({
            ...s,
            name: scorers[i].name,
          }));

          const avgScore =
            scores.reduce((acc, s) => acc + (s.score ?? 0), 0) / scores.length;
          if (threshold) {
            assert(
              avgScore >= threshold,
              `Score: ${avgScore} below threshold: ${threshold}\nOutput: ${output}\n${formatScores(
                scoresWithName,
              )}`,
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
    .map((s) => {
      const scoreLine = `${s.name || "Unknown"} [${(s.score ?? 0).toFixed(1)}]`;
      if (
        ((s.score ?? 0) < 1.0 && s.metadata?.rationale) ||
        s.metadata?.output
      ) {
        return `${scoreLine}${
          s.metadata.rationale ? `\nRationale: ${s.metadata.rationale}` : ""
        }${s.metadata.output ? `\nOutput: ${s.metadata.output}` : ""}`;
      }
      return scoreLine;
    })
    .join("\n\n");
}
