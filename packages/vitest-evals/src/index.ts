import { assert, describe, expect, test, type TestAPI } from "vitest";
import "vitest";
import type {
  Harness,
  HarnessContext,
  HarnessMetadata,
  HarnessRun,
  JsonValue,
  NormalizedSession,
  ToolCallRecord,
} from "./harness";
import {
  createFailedHarnessRun,
  ensureRunTrace,
  getHarnessRunFromError,
  isHarnessRun,
  isNormalizedSession,
  latestAssistantMessageContent,
  normalizeContent,
  toolCalls,
  userMessages,
} from "./harness";
import type {
  JudgeContext,
  Judge,
  JudgeAssessFn,
  JudgeAssessWithAssessorFn,
  JudgeAssessor,
  JudgeOptions,
  JudgeResult,
} from "./judges/types";
import type { JudgeHarness } from "./judges/judgeHarness";
import { createRunJudge } from "./judges/judgeHarness";
import { wrapText } from "./wrapText";

type EvalTaskMeta = {
  eval?: {
    scores: (JudgeResult & { name: string })[];
    avgScore: number;
    output?: unknown;
    toolCalls?: ToolCallRecord[];
    thresholdFailed?: boolean;
  };
  harness?: {
    name: string;
    run: HarnessRun;
  };
};

type EvalTaskLike = {
  meta: EvalTaskMeta;
};

type RegisteredJudgeRunContext = {
  harness: Harness<any, any, any>;
  input: unknown;
  judgeHarness?: JudgeHarness;
  metadata: HarnessMetadata;
  run: HarnessRun;
  signal?: AbortSignal;
};

type InternalEvalFixtures = {
  harness: Harness<any, any, any>;
  automaticJudges: Array<Judge<JudgeContext<any, any, any, any>>>;
  judgeHarness?: JudgeHarness;
  judgeThreshold: number | null | undefined;
  explicitJudgeHarness?: JudgeHarness;
  run: EvalRun<any, any, any>;
};

type HarnessInput<THarness extends Harness<any, any, any>> =
  THarness extends Harness<infer TInput, any, any> ? TInput : unknown;

type HarnessMetadataFor<THarness extends Harness<any, any, any>> =
  THarness extends Harness<any, any, infer TMetadata>
    ? TMetadata
    : HarnessMetadata;

type HarnessOutput<THarness extends Harness<any, any, any>> =
  THarness extends Harness<any, infer TOutput, any>
    ? TOutput
    : JsonValue | undefined;

type CreateJudgeConfig<
  TOptions extends JudgeContext<any, any, any, any> = JudgeContext,
> = {
  name: string;
  judgeHarness?: JudgeHarness;
  assess: JudgeAssessFn<TOptions>;
};

declare const evalHarnessRunBrand: unique symbol;

/**
 * Harness run returned by the fixture-backed `run(...)` API.
 *
 * @example
 * ```ts
 * it("approves a refund", async ({ run }) => {
 *   const result = await run("Refund invoice inv_123");
 *
 *   expect(result.output.status).toBe("approved");
 * });
 * ```
 */
export type EvalHarnessRun<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TOutput, TMetadata> = Harness<
    TInput,
    TOutput,
    TMetadata
  >,
> = HarnessRun<TOutput> & {
  readonly [evalHarnessRunBrand]: {
    readonly input: TInput;
    readonly metadata: TMetadata;
    readonly output: TOutput;
    readonly harness: THarness;
  };
};

/**
 * Per-run metadata forwarded to the harness alongside the test input.
 *
 * @example
 * ```ts
 * await run("Refund invoice inv_123", {
 *   metadata: {
 *     expected: { status: "approved" },
 *     expectedTools: ["lookupInvoice", "createRefund"],
 *   },
 * });
 * ```
 */
export interface EvalRunOptions<
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  /** Per-run expectations or configuration forwarded to harnesses and judges. */
  metadata?: TMetadata;
}

/**
 * Explicit harness execution primitive exposed to each eval test.
 *
 * @example
 * ```ts
 * const result = await run("Refund invoice inv_123", {
 *   metadata: { expected: { status: "approved" } },
 * });
 * ```
 */
export type EvalRun<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TOutput, TMetadata> = Harness<
    TInput,
    TOutput,
    TMetadata
  >,
> = (
  input: TInput,
  options?: EvalRunOptions<TMetadata>,
) => Promise<EvalHarnessRun<TInput, TOutput, TMetadata, THarness>>;

/**
 * Fixture-backed Vitest context exposed inside `describeEval(...)` tests.
 *
 * @example
 * ```ts
 * type RefundOutput = { status: "approved" | "denied" };
 *
 * it("approves a refund", async ({ run }: EvalTestContext<string, RefundOutput>) => {
 *   const result = await run("Refund invoice inv_123");
 *
 *   expect(result.output.status).toBe("approved");
 * });
 * ```
 */
export interface EvalTestContext<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TOutput, TMetadata> = Harness<
    TInput,
    TOutput,
    TMetadata
  >,
> {
  run: EvalRun<TInput, TOutput, TMetadata, THarness>;
}

/** Fixture-backed Vitest test API exposed inside `describeEval(...)`. */
export type EvalTestAPI<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TOutput, TMetadata> = Harness<
    TInput,
    TOutput,
    TMetadata
  >,
> = TestAPI<EvalTestContext<TInput, TOutput, TMetadata, THarness>>;

/**
 * Suite-level configuration for a harness-backed eval block.
 *
 * @example
 * ```ts
 * const options: DescribeEvalOptions<
 *   string,
 *   { status: "approved" | "denied" },
 *   { expected: { status: "approved" | "denied" } }
 * > = {
 *   harness: refundHarness,
 *   judges: [ToolCallJudge(), StructuredOutputJudge()],
 *   judgeThreshold: 1,
 * };
 * ```
 */
export interface DescribeEvalOptions<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TOutput, TMetadata> = Harness<
    TInput,
    TOutput,
    TMetadata
  >,
> {
  /** Harness used for every explicit `run(...)` call in the suite. */
  harness: THarness;
  /** Automatic judges applied after each successful `run(...)`. */
  judges?: Array<Judge<JudgeContext<TInput, TOutput, TMetadata, THarness>>>;
  /** Optional judge-side harness used only by judges that call `ctx.runJudge(...)`. */
  judgeHarness?: JudgeHarness;
  /** Passing threshold for automatic suite-level judges. `null` disables fail-on-score. */
  judgeThreshold?: number | null;
  /** Skips the entire eval suite when the predicate returns true. */
  skipIf?: () => boolean;
}

type JudgeAssertionInput<
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = TJudgeOptions extends { input: infer TInput } ? TInput : unknown;

type JudgeAssertionOutput<
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = TJudgeOptions extends { output: infer TOutput }
  ? TOutput
  : JsonValue | undefined;

type JudgeAssertionMetadata<
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = TJudgeOptions extends { metadata: infer TMetadata }
  ? TMetadata
  : HarnessMetadata;

type JudgeAssertionHarness<
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = TJudgeOptions extends { harness: infer THarness }
  ? Exclude<THarness, undefined>
  : Harness<
      JudgeAssertionInput<TJudgeOptions>,
      JudgeAssertionOutput<TJudgeOptions>,
      JudgeAssertionMetadata<TJudgeOptions>
    >;

type JudgeAssertionReservedKey =
  | keyof JudgeContext<any, any, any, any>
  | "judgeHarness"
  | "signal"
  | "threshold";

type JudgeAssertionParams<
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = Omit<TJudgeOptions, JudgeAssertionReservedKey>;

type RequiredKeys<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K;
}[keyof T];

type JudgeAssertionArgs<
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = RequiredKeys<JudgeAssertionParams<TJudgeOptions>> extends never
  ? [options?: JudgeAssertionOptions<TJudgeOptions>]
  : [options: JudgeAssertionOptions<TJudgeOptions>];

type MatcherOutput<TReceived> = TReceived extends EvalHarnessRun<
  any,
  infer TOutput,
  any,
  any
>
  ? TOutput
  : TReceived extends HarnessRun<infer TOutput>
    ? TOutput
    : TReceived extends NormalizedSession
      ? JsonValue | undefined
      : TReceived extends JsonValue
        ? TReceived
        : JsonValue | undefined;

type JudgeForReceived<
  TReceived,
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = MatcherOutput<TReceived> extends JudgeAssertionOutput<TJudgeOptions>
  ? Judge<TJudgeOptions>
  : never;

/**
 * Optional overrides passed to `expect(...).toSatisfyJudge(...)`.
 *
 * @example
 * ```ts
 * await expect(result).toSatisfyJudge(RefundStatusJudge, {
 *   threshold: null,
 * });
 * ```
 */
export type JudgeAssertionOptions<
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
> = JudgeAssertionParams<TJudgeOptions> & {
  /** Override or provide the original eval input for the judge. */
  input?: JudgeAssertionInput<TJudgeOptions>;
  /** Override or provide the app-facing output for the judge. */
  output?: JudgeAssertionOutput<TJudgeOptions>;
  /** Override or provide per-run judge metadata. */
  metadata?: JudgeAssertionMetadata<TJudgeOptions>;
  /** Override or provide flattened tool calls for the judge. */
  toolCalls?: ToolCallRecord[];
  /** Override or provide the complete normalized harness run. */
  run?: HarnessRun<JudgeAssertionOutput<TJudgeOptions>>;
  /** Override or provide the normalized session transcript. */
  session?: HarnessRun["session"];
  /** Override or provide the harness associated with the judge context. */
  harness?: JudgeAssertionHarness<TJudgeOptions>;
  /** Override or provide the judge harness for judges that call `ctx.runJudge(...)`. */
  judgeHarness?: JudgeHarness;
  /** Passing threshold for the explicit matcher. `null` records the score without failing. */
  threshold?: number | null;
};

/** Function type installed as the `toSatisfyJudge(...)` matcher. */
export type ToSatisfyJudge<TReceived = unknown> = <
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
>(
  judge: JudgeForReceived<TReceived, TJudgeOptions>,
  ...args: JudgeAssertionArgs<TJudgeOptions>
) => Promise<TReceived>;

/**
 * Vitest matcher extension surface added by `vitest-evals`.
 *
 * @example
 * ```ts
 * await expect(result).toSatisfyJudge(RefundStatusJudge);
 * ```
 */
export interface EvalMatchers<R = unknown> {
  toSatisfyJudge: ToSatisfyJudge<R>;
}

declare module "vitest" {
  interface Assertion<T = any> extends EvalMatchers<T> {}
  interface AsymmetricMatchersContaining extends EvalMatchers {}

  interface TaskMeta extends EvalTaskMeta {}
}

const judgeRunContextByObject = new WeakMap<
  object,
  RegisteredJudgeRunContext
>();

const evalTest = test
  .extend("harness", async (): Promise<InternalEvalFixtures["harness"]> => {
    throw new Error(
      "describeEval must override the harness fixture before running tests.",
    );
  })
  .extend(
    "automaticJudges",
    [] as Array<Judge<JudgeContext<any, any, any, any>>>,
  )
  .extend("judgeThreshold", undefined as number | null | undefined)
  .extend("judgeHarness", undefined as JudgeHarness | undefined)
  .extend("explicitJudgeHarness", undefined as JudgeHarness | undefined)
  .extend(
    "run",
    async ({
      automaticJudges,
      explicitJudgeHarness,
      harness,
      judgeHarness,
      judgeThreshold,
      signal,
      task,
    }) => {
      return async (input: unknown, options?: EvalRunOptions) => {
        const resolvedHarness = harness as Harness<
          unknown,
          JsonValue | undefined,
          HarnessMetadata
        >;
        const metadata = createMetadata(options?.metadata);
        const artifacts: HarnessContext["artifacts"] = {};
        const context: HarnessContext<HarnessMetadata> = {
          metadata,
          signal,
          artifacts,
          setArtifact: (artifactName, value) => {
            artifacts[artifactName] = value;
          },
        };

        clearRecordedTaskMeta(task);

        let run: HarnessRun;
        const startedAt = new Date();
        try {
          run = await resolvedHarness.run(input, context);
        } catch (error) {
          const finishedAt = new Date();
          const partialRun = getHarnessRunFromError(error);
          if (partialRun) {
            if (Object.keys(artifacts).length > 0 && !partialRun.artifacts) {
              partialRun.artifacts = artifacts;
            }

            ensureRunTrace(partialRun, {
              name: resolvedHarness.name,
              startedAt,
              finishedAt,
            });
            setHarnessMeta(task, resolvedHarness.name, partialRun);
            recordJudgeRunContext(
              partialRun,
              resolvedHarness,
              input,
              explicitJudgeHarness,
              metadata,
              signal,
            );
          }

          if (!partialRun) {
            const failedRun = createFailedHarnessRun(input, error, {
              artifacts,
            });
            ensureRunTrace(failedRun, {
              name: resolvedHarness.name,
              startedAt,
              finishedAt,
            });
            setHarnessMeta(task, resolvedHarness.name, failedRun);
            recordJudgeRunContext(
              failedRun,
              resolvedHarness,
              input,
              explicitJudgeHarness,
              metadata,
              signal,
            );
          }

          throw error;
        }

        if (Object.keys(artifacts).length > 0 && !run.artifacts) {
          run.artifacts = artifacts;
        }

        ensureRunTrace(run, {
          name: resolvedHarness.name,
          startedAt,
          finishedAt: new Date(),
        });
        setHarnessMeta(task, resolvedHarness.name, run);
        recordJudgeRunContext(
          run,
          resolvedHarness,
          input,
          explicitJudgeHarness,
          metadata,
          signal,
        );

        if (automaticJudges.length > 0) {
          await applyAutomaticJudges(
            task,
            automaticJudges,
            judgeThreshold,
            resolvedHarness,
            input,
            judgeHarness,
            metadata,
            run,
            signal,
          );
        }

        return run as EvalHarnessRun<
          unknown,
          JsonValue | undefined,
          HarnessMetadata,
          typeof resolvedHarness
        >;
      };
    },
  ) as TestAPI<InternalEvalFixtures>;

expect.extend({
  toSatisfyJudge: async function toSatisfyJudge<
    TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
  >(
    received: unknown,
    judge: Judge<TJudgeOptions>,
    options?: JudgeAssertionOptions<TJudgeOptions>,
  ) {
    const { threshold = 1.0, ...context } = (options ??
      {}) as JudgeAssertionOptions<TJudgeOptions>;
    const judgeOptions = buildJudgeAssertionOptions(
      received,
      judge,
      context,
      isEvalTaskLike(this.task) ? this.task : undefined,
    );

    const result = await judge.assess(judgeOptions);

    const score = result.score ?? 0;
    const pass = threshold === null ? true : score >= threshold;
    const scoredJudge = {
      ...result,
      name: judge.name || "AnonymousJudge",
    };

    if (isEvalTaskLike(this.task)) {
      appendJudgeScore(this.task, {
        score: scoredJudge,
        output: judgeOptions.output,
        thresholdFailed: threshold !== null && !pass,
        toolCalls: judgeOptions.toolCalls,
      });
    }

    return {
      pass,
      message: () =>
        [
          threshold === null
            ? `Score: ${score.toFixed(2)} recorded without a failure threshold`
            : `Score: ${score.toFixed(2)} below threshold: ${threshold.toFixed(2)}`,
          `Output: ${formatJudgeOutputForMessage(judgeOptions.output)}`,
          formatScores([scoredJudge]),
        ].join("\n\n"),
    };
  },
});

function formatJudgeOutputForMessage(output: JsonValue | undefined) {
  if (typeof output === "string") {
    return wrapText(output);
  }

  if (output === undefined) {
    return "undefined";
  }

  return wrapText(JSON.stringify(output, null, 2));
}

/**
 * Creates a harness-backed eval suite on top of a fixture-backed Vitest test API.
 *
 * @param name - Suite name shown by Vitest and reporters.
 * @param options - Harness, automatic judges, threshold, and suite skip settings.
 * @param define - Callback that receives the eval-aware `it` API.
 *
 * @example
 * ```ts
 * import { piAiHarness } from "@vitest-evals/harness-pi-ai";
 * import { getModel } from "@mariozechner/pi-ai";
 * import { piAiJudgeHarness } from "@vitest-evals/harness-pi-ai";
 * import { expect } from "vitest";
 * import {
 *   describeEval,
 *   FactualityJudge,
 *   ToolCallJudge,
 *   toolCalls,
 * } from "vitest-evals";
 * import { createRefundAgent } from "../src/refundAgent";
 *
 * const judgeHarness = piAiJudgeHarness({
 *   model: getModel("anthropic", "claude-sonnet-4-5"),
 *   temperature: 0,
 * });
 *
 * describeEval("refund agent", {
 *   harness: piAiHarness({
 *     agent: () => createRefundAgent(),
 *   }),
 *   judgeHarness,
 *   judges: [ToolCallJudge()],
 * }, (it) => {
 *   it("approves a refundable invoice", async ({ run }) => {
 *     const result = await run("Refund invoice inv_123", {
 *       metadata: {
 *         expected: "Invoice inv_123 should be refunded.",
 *       },
 *     });
 *
 *     expect(result.output).toMatchObject({ status: "approved" });
 *     expect(toolCalls(result.session)).toHaveLength(2);
 *     await expect(result).toSatisfyJudge(FactualityJudge(), {
 *       threshold: 0.6,
 *     });
 *   });
 * });
 * ```
 */
export function describeEval<THarness extends Harness<any, any, any>>(
  name: string,
  options: DescribeEvalOptions<
    HarnessInput<THarness>,
    HarnessOutput<THarness>,
    HarnessMetadataFor<THarness>,
    THarness
  >,
  define: (
    it: EvalTestAPI<
      HarnessInput<THarness>,
      HarnessOutput<THarness>,
      HarnessMetadataFor<THarness>,
      THarness
    >,
  ) => void,
) {
  const suite = options.skipIf ? describe.skipIf(options.skipIf()) : describe;

  return suite(name, () => {
    const automaticJudges = (options.judges ?? []) as Array<
      Judge<JudgeContext<any, any, any, any>>
    >;
    const explicitJudgeHarness =
      options.judgeHarness ?? resolveDefaultJudgeHarness(automaticJudges);
    const it = evalTest.override({
      harness: options.harness,
      automaticJudges,
      judgeHarness: options.judgeHarness,
      explicitJudgeHarness,
      judgeThreshold: options.judgeThreshold,
    }) as unknown as EvalTestAPI<
      HarnessInput<THarness>,
      HarnessOutput<THarness>,
      HarnessMetadataFor<THarness>,
      THarness
    >;

    define(it);
  });
}

function createMetadata<TMetadata extends HarnessMetadata>(
  metadata: EvalRunOptions<TMetadata>["metadata"],
) {
  return { ...(metadata ?? {}) } as TMetadata;
}

async function applyAutomaticJudges<
  TInput,
  TOutput extends JsonValue | undefined,
  TMetadata extends HarnessMetadata,
  THarness extends Harness<TInput, TOutput, TMetadata>,
>(
  task: EvalTaskLike,
  judges: Array<Judge<JudgeContext<TInput, TOutput, TMetadata, THarness>>>,
  threshold: number | null | undefined,
  harness: THarness,
  input: TInput,
  judgeHarness: JudgeHarness | undefined,
  metadata: TMetadata,
  run: HarnessRun<TOutput>,
  signal?: AbortSignal,
) {
  const runToolCalls = toolCalls(run.session);
  const scores = await Promise.all(
    judges.map((judge) => {
      const runJudge = createRunJudge(
        resolveJudgeHarnessForJudge(judge, judgeHarness),
        signal,
      );
      const judgeOptions = {
        input,
        output: run.output,
        toolCalls: runToolCalls,
        metadata,
        run,
        session: run.session,
        signal,
        harness,
        runJudge,
      } as unknown as JudgeContext<TInput, TOutput, TMetadata, THarness>;

      return Promise.resolve(judge.assess(judgeOptions));
    }),
  );

  const scoresWithName = scores.map((score, index) => ({
    ...score,
    name: judges[index].name,
  }));
  const thresholdValue = threshold === undefined ? 1.0 : threshold;
  const avgScore =
    scores.reduce((acc, score) => acc + (score.score ?? 0), 0) / scores.length;
  const thresholdFailed = thresholdValue !== null && avgScore < thresholdValue;

  task.meta.eval = {
    scores: scoresWithName,
    avgScore,
    output: run.output ?? formatJudgeTextOutput(run),
    toolCalls: runToolCalls,
    thresholdFailed,
  };

  if (thresholdFailed) {
    assert(
      avgScore >= thresholdValue,
      [
        `Score: ${avgScore.toFixed(2)} below threshold: ${thresholdValue.toFixed(2)}`,
        `Output: ${wrapText(formatJudgeTextOutput(run))}`,
        formatScores(scoresWithName),
      ].join("\n\n"),
    );
  }
}

function clearRecordedTaskMeta(task: EvalTaskLike) {
  task.meta.eval = undefined;
  task.meta.harness = undefined;
}

function setHarnessMeta(task: EvalTaskLike, name: string, run: HarnessRun) {
  task.meta.harness = {
    name,
    run,
  };
}

function recordJudgeRunContext<
  TInput,
  TMetadata extends HarnessMetadata,
  TOutput extends JsonValue | undefined,
>(
  run: HarnessRun<TOutput>,
  harness: Harness<TInput, TOutput, TMetadata>,
  input: TInput,
  judgeHarness: JudgeHarness | undefined,
  metadata: TMetadata,
  signal?: AbortSignal,
) {
  const context = {
    harness,
    input,
    judgeHarness,
    metadata,
    run,
    signal,
  };

  recordJudgeRunContextObject(run, context);
  recordJudgeRunContextObject(run.session, context);
  recordJudgeRunContextObject(run.output, context);
}

function recordJudgeRunContextObject(
  value: unknown,
  context: RegisteredJudgeRunContext,
) {
  if (isWeakMapKey(value)) {
    judgeRunContextByObject.set(value, context);
  }
}

function appendJudgeScore(
  task: EvalTaskLike,
  {
    output,
    score,
    thresholdFailed,
    toolCalls: judgeToolCalls,
  }: {
    score: JudgeResult & { name: string };
    output?: unknown;
    thresholdFailed: boolean;
    toolCalls?: ToolCallRecord[];
  },
) {
  const previousScores = task.meta.eval?.scores ?? [];
  const scores = [...previousScores, score];
  const avgScore =
    scores.reduce((acc, item) => acc + (item.score ?? 0), 0) / scores.length;

  task.meta.eval = {
    scores,
    avgScore,
    output,
    toolCalls: judgeToolCalls ?? task.meta.eval?.toolCalls,
    thresholdFailed:
      Boolean(task.meta.eval?.thresholdFailed) || thresholdFailed,
  };
}

function isEvalTaskLike(task: unknown): task is EvalTaskLike {
  if (!task || typeof task !== "object") {
    return false;
  }

  return (
    "meta" in task &&
    typeof (task as { meta?: unknown }).meta === "object" &&
    (task as { meta?: unknown }).meta !== null
  );
}

function formatJudgeOutput(run: HarnessRun) {
  if (typeof run.output === "string") {
    return run.output;
  }

  if (run.output !== undefined) {
    try {
      return JSON.stringify(run.output);
    } catch {
      return String(run.output);
    }
  }

  const assistantOutput = resolveAssistantOutput(run.session);
  if (assistantOutput !== undefined) {
    return typeof assistantOutput === "string"
      ? assistantOutput
      : JSON.stringify(assistantOutput);
  }

  return "";
}

function formatJudgeTextOutput(run: HarnessRun) {
  const assistantOutput = resolveAssistantOutput(run.session);
  if (assistantOutput === undefined) {
    return formatJudgeOutput(run);
  }

  return typeof assistantOutput === "string"
    ? assistantOutput
    : JSON.stringify(assistantOutput);
}

function buildJudgeAssertionOptions<
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
>(
  received: unknown,
  judge: Judge<TJudgeOptions>,
  options: Omit<JudgeAssertionOptions<TJudgeOptions>, "threshold">,
  task?: EvalTaskLike,
): TJudgeOptions {
  const registeredContext = resolveRegisteredJudgeRunContext(
    received,
    options,
    task,
  );
  const harness = options.harness ?? registeredContext?.harness;
  const judgeHarness =
    options.judgeHarness ??
    resolveJudgeHarnessForJudge(judge, registeredContext?.judgeHarness);
  const runJudge = createRunJudge(judgeHarness, registeredContext?.signal);
  const signal = registeredContext?.signal;
  const metadata = (options.metadata ??
    registeredContext?.metadata ??
    {}) as JudgeAssertionMetadata<TJudgeOptions>;
  const input =
    options.input ??
    (registeredContext?.input as
      | JudgeAssertionInput<TJudgeOptions>
      | undefined) ??
    undefined;
  const contextualOptions = {
    ...options,
    ...(input !== undefined ? { input } : {}),
  };
  const run = resolveJudgeRun(
    received,
    contextualOptions,
    registeredContext?.run,
  );
  const resolvedInput =
    input ??
    (userMessages(run.session)[0]?.content as
      | JudgeAssertionInput<TJudgeOptions>
      | undefined) ??
    undefined;
  const output = resolveJudgeAssertionOutput<TJudgeOptions>(
    received,
    run,
    options.output,
  );
  const resolvedToolCalls = options.toolCalls ?? toolCalls(run.session);

  const { judgeHarness: _judgeHarness, ...judgeParams } = options as Record<
    string,
    unknown
  >;

  return {
    ...judgeParams,
    input: resolvedInput,
    output,
    metadata,
    run,
    session: options.session ?? run.session,
    signal,
    toolCalls: resolvedToolCalls,
    harness,
    runJudge,
  } as unknown as TJudgeOptions;
}

function resolveJudgeHarnessForJudge(
  judge: Pick<Judge<any>, "judgeHarness">,
  fallback: JudgeHarness | undefined,
) {
  return judge.judgeHarness ?? fallback;
}

function resolveDefaultJudgeHarness(
  judges: Array<Pick<Judge<any>, "judgeHarness">>,
) {
  const configured = judges
    .map((judge) => judge.judgeHarness)
    .filter((judgeHarness): judgeHarness is JudgeHarness =>
      Boolean(judgeHarness),
    );
  const [first] = configured;

  if (!first || configured.some((judgeHarness) => judgeHarness !== first)) {
    return undefined;
  }

  return first;
}

function resolveRegisteredJudgeRunContext<
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TJudgeOptions>, "threshold">,
  task?: EvalTaskLike,
) {
  if (options.run) {
    return getRegisteredJudgeRunContext(options.run);
  }

  const receivedContext = getRegisteredJudgeRunContext(received);
  if (receivedContext) {
    return receivedContext;
  }

  if (task?.meta.harness?.run) {
    return getRegisteredJudgeRunContext(task.meta.harness.run);
  }

  return undefined;
}

function getRegisteredJudgeRunContext(value: unknown) {
  return isWeakMapKey(value) ? judgeRunContextByObject.get(value) : undefined;
}

function isWeakMapKey(value: unknown): value is object {
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  );
}

function resolveJudgeRun<
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TJudgeOptions>, "threshold">,
  contextualRun?: HarnessRun,
): HarnessRun {
  const explicitRun = options.run as HarnessRun | undefined;
  if (explicitRun) {
    return options.session
      ? {
          ...explicitRun,
          session: options.session,
        }
      : explicitRun;
  }

  if (isHarnessRun(received)) {
    return options.session
      ? {
          ...received,
          session: options.session,
        }
      : received;
  }

  if (contextualRun) {
    return options.session
      ? {
          ...contextualRun,
          session: options.session,
        }
      : contextualRun;
  }

  const session =
    options.session ??
    (isNormalizedSession(received)
      ? received
      : createSyntheticJudgeSession(received, options));

  return {
    session,
    output: inferJudgeOutputValue(received, session),
    usage: {},
    errors: [],
  };
}

function resolveJudgeAssertionOutput<
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
>(
  received: unknown,
  run: HarnessRun,
  explicitOutput?: JudgeAssertionOutput<TJudgeOptions>,
) {
  if (explicitOutput !== undefined) {
    return explicitOutput;
  }

  if (isHarnessRun(received)) {
    return received.output as JudgeAssertionOutput<TJudgeOptions> | undefined;
  }

  if (isNormalizedSession(received)) {
    return inferJudgeOutputValue(received, run.session) as
      | JudgeAssertionOutput<TJudgeOptions>
      | undefined;
  }

  return normalizeJudgeJsonValue(received) as
    | JudgeAssertionOutput<TJudgeOptions>
    | undefined;
}

function createSyntheticJudgeSession<
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TJudgeOptions>, "threshold">,
): NormalizedSession {
  const messages: NormalizedSession["messages"] = [];
  const userContent = normalizeJudgeJsonValue(options.input);
  if (userContent !== undefined) {
    messages.push({
      role: "user",
      content: userContent,
    });
  }

  const assistantContent = normalizeJudgeJsonValue(received);
  if (assistantContent !== undefined) {
    messages.push({
      role: "assistant",
      content: assistantContent,
    });
  }

  return {
    messages,
  };
}

function inferJudgeOutputValue(
  received: unknown,
  session: NormalizedSession,
): JsonValue | undefined {
  if (isHarnessRun(received)) {
    return received.output;
  }

  if (isNormalizedSession(received)) {
    return (
      resolveAssistantOutput(session) ??
      normalizeJudgeJsonValue(received.messages)
    );
  }

  return normalizeJudgeJsonValue(received);
}

function resolveAssistantOutput(session: NormalizedSession) {
  const assistantContent = latestAssistantMessageContent(session);
  return assistantContent !== undefined
    ? normalizeContent(assistantContent)
    : undefined;
}

function normalizeJudgeJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeContent(value);
}

/**
 * Formats judge results for reporter and assertion output.
 *
 * @param scores - Named judge results to sort and format.
 *
 * @example
 * ```ts
 * const message = formatScores([
 *   {
 *     name: "RefundStatusJudge",
 *     score: 0,
 *     metadata: { rationale: "Expected approved, got denied" },
 *   },
 * ]);
 * ```
 */
export function formatScores(scores: (JudgeResult & { name: string })[]) {
  return [...scores]
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .map((s) => {
      const scoreLine = `${s.name || "Unknown"} [${(s.score ?? 0).toFixed(1)}]`;
      if (
        ((s.score ?? 0) < 1.0 && s.metadata?.rationale) ||
        s.metadata?.output
      ) {
        let formattedOutput = "";
        if (s.metadata?.output !== undefined) {
          const output = s.metadata.output;
          if (typeof output === "string") {
            formattedOutput = `\noutput  ${wrapText(output)}`;
          } else {
            formattedOutput = `\noutput  ${wrapText(JSON.stringify(output, null, 2))}`;
          }
        }

        return `${scoreLine}${
          s.metadata?.rationale
            ? `\nreason  ${wrapText(s.metadata.rationale)}`
            : ""
        }${formattedOutput}`;
      }
      return scoreLine;
    })
    .join("\n\n");
}

/**
 * Creates a named judge object from an assessment function.
 *
 * @param name - Stable judge name shown in assertion messages and reports.
 * @param assess - Function that scores one normalized judge context.
 *
 * @example
 * ```ts
 * import { createJudge, type JudgeContext } from "vitest-evals";
 *
 * type RefundOutput = { status: "approved" | "denied" };
 * type RefundMetadata = { expected: { status: RefundOutput["status"] } };
 *
 * export const RefundStatusJudge = createJudge(
 *   "RefundStatusJudge",
 *   async ({ output, metadata }: JudgeContext<string, RefundOutput, RefundMetadata>) => ({
 *     score: output.status === metadata.expected.status ? 1 : 0,
 *     metadata: {
 *       rationale: `Expected ${metadata.expected.status}, got ${output.status}`,
 *     },
 *   }),
 * );
 * ```
 *
 * For LLM-backed judges, prefer the object form with `ctx.runJudge(...)` so
 * provider-specific model configuration stays in the judge harness.
 */
export function createJudge<TOptions extends JudgeContext<any, any, any, any>>(
  name: string,
  assess: JudgeAssessFn<TOptions>,
): Judge<TOptions>;
export function createJudge<TOptions extends JudgeContext<any, any, any, any>>(
  config: CreateJudgeConfig<TOptions>,
): Judge<TOptions>;
/**
 * @deprecated Prefer `createJudge({ name, judgeHarness, assess })` and call
 * `ctx.runJudge(...)` from LLM-backed judges.
 */
export function createJudge<
  TOptions extends JudgeContext<any, any, any, any>,
  TInput,
  TOutput,
>(
  name: string,
  assessor: JudgeAssessor<TInput, TOutput>,
  assess: JudgeAssessWithAssessorFn<TOptions, TInput, TOutput>,
): Judge<TOptions>;
export function createJudge<
  TOptions extends JudgeContext<any, any, any, any>,
  TInput,
  TOutput,
>(
  nameOrConfig: string | CreateJudgeConfig<TOptions>,
  assessOrAssessor?: JudgeAssessFn<TOptions> | JudgeAssessor<TInput, TOutput>,
  assess?: JudgeAssessWithAssessorFn<TOptions, TInput, TOutput>,
): Judge<TOptions> {
  if (typeof nameOrConfig !== "string") {
    return {
      name: nameOrConfig.name,
      judgeHarness: nameOrConfig.judgeHarness,
      assess: nameOrConfig.assess,
    };
  }

  const name = nameOrConfig;

  if (!assess) {
    return {
      name,
      assess: assessOrAssessor as JudgeAssessFn<TOptions>,
    };
  }

  const assessor = assessOrAssessor as JudgeAssessor<TInput, TOutput>;

  return {
    name,
    assess: (opts) =>
      assess(opts, {
        assess: (input) =>
          Promise.resolve(
            assessor.assess(input, {
              signal: (opts as { signal?: AbortSignal }).signal,
            }),
          ),
      }),
  };
}

export { wrapText } from "./wrapText";
export {
  assistantMessages,
  attachHarnessRunToError,
  createFailedHarnessRun,
  createGenAiUsageAttributes,
  createHarness,
  createToolCallSpans,
  ensureRunTrace,
  failedSpans,
  getHarnessRunFromError,
  latestAssistantMessageContent,
  messagesByRole,
  normalizeHarnessRun,
  normalizeSpanAttributes,
  normalizeSpanError,
  spans,
  spansByKind,
  systemMessages,
  toJsonValue,
  toolCalls,
  toolMessages,
  userMessages,
  type CreateToolCallSpansOptions,
  type EnsureRunTraceOptions,
  type CreateHarnessOptions,
  type CreateHarnessRunArgs,
  type Harness,
  type HarnessContext,
  type HarnessMetadata,
  type HarnessResultLike,
  type HarnessRun,
  type HarnessRunError,
  type GenAiOperationName,
  type GenAiOutputType,
  type GenAiProviderName,
  type GenAiSemanticAttributeKey,
  type GenAiSemanticAttributes,
  type GenAiTokenType,
  type GenAiToolType,
  type JsonPrimitive,
  type JsonValue,
  type MaybePromise,
  type NormalizedMessage,
  type NormalizedSession,
  type NormalizedSpan,
  type NormalizedSpanAttributes,
  type NormalizedSpanAttributeKey,
  type NormalizedSpanEvent,
  type NormalizedTrace,
  type OpenTelemetrySemanticAttributeKey,
  type OpenTelemetrySemanticAttributes,
  type SimpleHarnessResult,
  type SimpleSpanEvent,
  type SimpleSpanRecord,
  type SimpleTraceRecord,
  type SimpleToolCallRecord,
  type TimingSummary,
  type ToolCallRecord,
  type UsageSummary,
} from "./harness";

export {
  FactualityJudge,
  type FactualityJudgeChoice,
  type FactualityJudgeConfig,
  type FactualityJudgeExpected,
  type FactualityJudgeOptions,
  type FactualityJudgePrompt,
  type FactualityJudgeVerdict,
  createJudgeHarness,
  runJudgeHarness,
  type CreateJudgeHarnessOptions,
  type CreateJudgeHarnessRunOptions,
  type JudgeHarness,
  type JudgeHarnessInput,
  type JudgeHarnessOutput,
  type RunJudge,
  type RunJudgeOptions,
  StructuredOutputJudge,
  type StructuredOutputJudgeConfig,
  type StructuredOutputJudgeExpected,
  type StructuredOutputJudgeOptions,
  ToolCallJudge,
  type ToolCallJudgeConfig,
  type ToolCallJudgeExpectedTool,
  type ToolCallJudgeOptions,
} from "./judges";
export type {
  BoundJudgeAssessor,
  Judge,
  JudgeAssessFn,
  JudgeAssessWithAssessorFn,
  JudgeAssessor,
  JudgeAssessorOptions,
  JudgeContext,
  JudgeOptions,
  JudgeResult,
} from "./judges/types";
export type {
  BaseMatcherConfig,
  FuzzyMatchOptions,
  MatchStrategy,
} from "./internal/matchers";
