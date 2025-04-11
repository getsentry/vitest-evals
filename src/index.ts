import { assert, describe, expect, it } from "vitest";
import "vitest";

export type TaskFn = (input: string) => Promise<string>;

export type Score = {
  score: number | null;
  metadata?: {
    rationale: string;
  };
};

export type ScoreFn = (opts: {
  input: string;
  expected: string;
  output: string;
}) => Promise<Score>;

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
  toEval: async function toEval(
    input: string,
    expected: string,
    taskFn: TaskFn,
    scoreFn: ScoreFn,
    threshold = 1.0,
  ) {
    const { isNot } = this;

    const output = await taskFn(input);

    const result = await scoreFn({ input, expected, output });

    return {
      pass: (result.score ?? 0) >= threshold,
      message: () =>
        `Score: ${result.score} ${isNot ? "<" : ">"} ${threshold}\n${
          result.metadata ? `Rationale: ${result.metadata.rationale}` : ""
        }`,
    };
  },
});

export function describeEval(
  name: string,
  {
    data,
    task,
    scorers,
    threshold = 1.0,
    // increase default test timeout as 5s is usually not enough for
    // a single factuality check
    timeout = 10000,
  }: {
    data: () => Promise<{ input: string; expected: string }[]>;
    task: TaskFn;
    scorers: ScoreFn[];
    threshold?: number | null;
    timeout?: number;
  },
) {
  return describe(name, async () => {
    // TODO: should data just be a generator?
    for (const { input, expected } of await data()) {
      it(
        input,
        async () => {
          const output = await task(input);

          const scores = await Promise.all(
            scorers.map((scorer) => scorer({ input, expected, output })),
          );

          const avgScore =
            scores.reduce((acc, s) => acc + (s.score ?? 0), 0) / scores.length;
          if (threshold) {
            assert(
              avgScore >= threshold,
              `Score: ${avgScore} below threshold: ${threshold}\nOutput: ${output}`,
            );
          }
        },
        {
          timeout,
        },
      );
    }
  });
}
