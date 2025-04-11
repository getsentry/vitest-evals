import { expect } from "vitest";
import "vitest";

type TaskFn = (input: string) => Promise<string>;

// We're intentionally matching the API of evalite here
type ScoreFn = (
  input: string,
  expected: string,
  output: string,
) => Promise<{
  score: number;
  metadata: {
    rationale: string;
  };
}>;

interface EvalMatchers<R = unknown> {
  toEval: (expected: string, taskFn: TaskFn, scoreFn: ScoreFn) => Promise<R>;
}

declare module "vitest" {
  interface Assertion<T = any> extends EvalMatchers<T> {}
  interface AsymmetricMatchersContaining extends EvalMatchers {}
}

expect.extend({
  async toEval(received, expected, taskFn, scoreFn) {
    const output = await taskFn(received);

    const result = await scoreFn({
      question: received,
      groundTruth: expected!,
      submission: output,
    });

    return {
      pass: result.score >= 0.8,
      message: () =>
        `Score: ${result.score}\nRationale: ${result.metadata.rationale}`,
    };
  },
});
