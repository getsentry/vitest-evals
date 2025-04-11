import { describe, expect, it } from "vitest";
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

async function toEval(
  input: string,
  expected: string,
  taskFn: TaskFn,
  scoreFn: ScoreFn,
  threshold = 1.0,
) {
  const output = await taskFn(input);

  const result = await scoreFn(input, expected, output);

  return {
    pass: result.score >= threshold,
    message: () =>
      `Score: ${result.score}\nRationale: ${result.metadata.rationale}`,
  };
}

expect.extend({ toEval });

export function describeEval(
  name: string,
  {
    data,
    task,
    scorer,
  }: {
    data: () => Promise<{ input: string; expected: string }[]>;
    task: TaskFn;
    scorer: ScoreFn;
  },
) {
  return describe(name, async () => {
    // TODO: should data just be a generator?
    for (const { input, expected } of await data()) {
      it(input, async () => {
        const result = await task(input);
        expect(result).toEval(expected, task, scorer);
      });
    }
  });
}
