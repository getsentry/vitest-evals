import { expect } from "vitest";
import "vitest";

export type TaskFn = (input: string) => Promise<string>;

// We're intentionally matching the API of evalite here
export type ScoreFn = (
  input: string,
  expected: string,
  output: string,
) => Promise<{
  score: number;
  metadata: {
    rationale: string;
  };
}>;

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
  async toEval(received, expected, taskFn, scoreFn, threshold = 1.0) {
    const output = await taskFn(received);

    const result = await scoreFn({
      question: received,
      groundTruth: expected!,
      submission: output,
    });

    return {
      pass: result.score >= threshold,
      message: () =>
        `Score: ${result.score}\nRationale: ${result.metadata.rationale}`,
    };
  },
});
