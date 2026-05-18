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
  assistantMessages,
  getHarnessRunFromError,
  isHarnessRun,
  isNormalizedSession,
  normalizeContent,
  toolCalls,
  userMessages,
} from "./harness";
import type {
  JudgeContext,
  Judge,
  JudgeAssessFn,
  JudgeAssessWithHarnessFn,
  JudgeHarness,
  JudgeOptions,
  JudgeResult,
} from "./judges/types";
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
  metadata: HarnessMetadata;
  run: HarnessRun;
  signal?: AbortSignal;
};

type InternalEvalFixtures = {
  harness: Harness<any, any, any>;
  automaticJudges: Array<Judge<JudgeContext<any, any, any, any>>>;
  judgeThreshold: number | null | undefined;
  run: EvalRun<any, any, any>;
};

type HarnessInput<THarness extends Harness<any, any, any>> =
  THarness extends Harness<infer TInput, any, any> ? TInput : unknown;

type HarnessMetadataFor<THarness extends Harness<any, any, any>> =
  THarness extends Harness<any, infer TMetadata, any>
    ? TMetadata
    : HarnessMetadata;

type HarnessOutput<THarness extends Harness<any, any, any>> =
  THarness extends Harness<any, any, infer TOutput> ? TOutput : JsonValue;

declare const evalHarnessRunBrand: unique symbol;

/** Harness run returned by the fixture-backed `run(...)` API. */
export type EvalHarnessRun<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  THarness extends Harness<TInput, TMetadata, TOutput> = Harness<
    TInput,
    TMetadata,
    TOutput
  >,
> = HarnessRun<TOutput> & {
  readonly [evalHarnessRunBrand]: {
    readonly input: TInput;
    readonly metadata: TMetadata;
    readonly output: TOutput;
    readonly harness: THarness;
  };
};

/** Per-run metadata forwarded to the harness alongside the test input. */
export interface EvalRunOptions<
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  metadata?: TMetadata;
}

/** Explicit harness execution primitive exposed to each eval test. */
export type EvalRun<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  THarness extends Harness<TInput, TMetadata, TOutput> = Harness<
    TInput,
    TMetadata,
    TOutput
  >,
> = (
  input: TInput,
  options?: EvalRunOptions<TMetadata>,
) => Promise<EvalHarnessRun<TInput, TMetadata, TOutput, THarness>>;

/** Fixture-backed Vitest context exposed inside `describeEval(...)` tests. */
export interface EvalTestContext<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  THarness extends Harness<TInput, TMetadata, TOutput> = Harness<
    TInput,
    TMetadata,
    TOutput
  >,
> {
  run: EvalRun<TInput, TMetadata, TOutput, THarness>;
}

export type EvalTestAPI<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  THarness extends Harness<TInput, TMetadata, TOutput> = Harness<
    TInput,
    TMetadata,
    TOutput
  >,
> = TestAPI<EvalTestContext<TInput, TMetadata, TOutput, THarness>>;

/** Suite-level configuration for a harness-backed eval block. */
export interface DescribeEvalOptions<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  THarness extends Harness<TInput, TMetadata, TOutput> = Harness<
    TInput,
    TMetadata,
    TOutput
  >,
> {
  /** Harness used for every explicit `run(...)` call in the suite. */
  harness: THarness;
  /** Automatic judges applied after each successful `run(...)`. */
  judges?: Array<Judge<JudgeContext<TInput, TOutput, TMetadata, THarness>>>;
  /** Passing threshold for automatic suite-level judges. `null` disables fail-on-score. */
  judgeThreshold?: number | null;
  skipIf?: () => boolean;
}

type JudgeAssertionInput<
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = TJudgeOptions extends { input: infer TInput } ? TInput : unknown;

type JudgeAssertionOutput<
  TJudgeOptions extends JudgeContext<any, any, any, any>,
> = TJudgeOptions extends { output: infer TOutput }
  ? Exclude<TOutput, undefined>
  : JsonValue;

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
      JudgeAssertionMetadata<TJudgeOptions>,
      JudgeAssertionOutput<TJudgeOptions>
    >;

/** Optional overrides passed to `expect(...).toSatisfyJudge(...)`. */
export type JudgeAssertionOptions<
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
> = Partial<
  Omit<
    TJudgeOptions,
    | "input"
    | "output"
    | "metadata"
    | "toolCalls"
    | "run"
    | "session"
    | "harness"
  >
> & {
  input?: JudgeAssertionInput<TJudgeOptions>;
  output?: JudgeAssertionOutput<TJudgeOptions>;
  metadata?: JudgeAssertionMetadata<TJudgeOptions>;
  toolCalls?: ToolCallRecord[];
  run?: HarnessRun;
  session?: HarnessRun["session"];
  harness?: JudgeAssertionHarness<TJudgeOptions>;
  /** Passing threshold for the explicit matcher. `null` records the score without failing. */
  threshold?: number | null;
};

export type ToSatisfyJudge<TReceived = unknown> = <
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
>(
  judge: Judge<TJudgeOptions>,
  options?: JudgeAssertionOptions<TJudgeOptions>,
) => Promise<TReceived>;

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
  .extend(
    "run",
    async ({ automaticJudges, harness, judgeThreshold, signal, task }) => {
      return async (input: unknown, options?: EvalRunOptions) => {
        const resolvedHarness = harness as Harness<
          unknown,
          HarnessMetadata,
          JsonValue | undefined
        >;
        const metadata = createMetadata(options?.metadata);
        const artifacts: HarnessContext["artifacts"] = {};
        const context: HarnessContext<HarnessMetadata> = {
          metadata,
          task: {
            meta: task.meta as Record<string, unknown>,
          },
          signal,
          artifacts,
          setArtifact: (artifactName, value) => {
            artifacts[artifactName] = value;
          },
        };

        clearRecordedTaskMeta(task);

        let run: HarnessRun;
        try {
          run = await resolvedHarness.run(input, context);
        } catch (error) {
          const partialRun = getHarnessRunFromError(error);
          if (partialRun) {
            if (Object.keys(artifacts).length > 0 && !partialRun.artifacts) {
              partialRun.artifacts = artifacts;
            }

            setHarnessMeta(task, resolvedHarness.name, partialRun);
            recordJudgeRunContext(
              partialRun,
              resolvedHarness,
              input,
              metadata,
              signal,
            );
          }

          throw error;
        }

        if (Object.keys(artifacts).length > 0 && !run.artifacts) {
          run.artifacts = artifacts;
        }

        setHarnessMeta(task, resolvedHarness.name, run);
        recordJudgeRunContext(run, resolvedHarness, input, metadata, signal);

        if (automaticJudges.length > 0) {
          await applyAutomaticJudges(
            task,
            automaticJudges,
            judgeThreshold,
            resolvedHarness,
            input,
            metadata,
            run,
            signal,
          );
        }

        return run as EvalHarnessRun<
          unknown,
          HarnessMetadata,
          JsonValue | undefined,
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
    options: JudgeAssertionOptions<TJudgeOptions> = {},
  ) {
    const { threshold = 1.0, ...context } = options;
    const judgeOptions = buildJudgeAssertionOptions(
      received,
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
          `Output: ${wrapText(judgeOptions.output)}`,
          formatScores([scoredJudge]),
        ].join("\n\n"),
    };
  },
});

/**
 * Creates a harness-backed eval suite on top of a fixture-backed Vitest test API.
 *
 * @example
 * ```ts
 * describeEval("refund agent", {
 *   harness: piAiHarness({
 *     agent: () => createRefundAgent(),
 *   }),
 *   judges: [ToolCallJudge()],
 * }, (it) => {
 *   it("approves a refundable invoice", async ({ run }) => {
 *     const result = await run("Refund invoice inv_123");
 *
 *     expect(result.output).toMatchObject({ status: "approved" });
 *     expect(toolCalls(result.session)).toHaveLength(2);
 *     await expect(result).toSatisfyJudge(FactualityJudge);
 *   });
 * });
 * ```
 */
export function describeEval<THarness extends Harness<any, any, any>>(
  name: string,
  options: DescribeEvalOptions<
    HarnessInput<THarness>,
    HarnessMetadataFor<THarness>,
    HarnessOutput<THarness>,
    THarness
  >,
  define: (
    it: EvalTestAPI<
      HarnessInput<THarness>,
      HarnessMetadataFor<THarness>,
      HarnessOutput<THarness>,
      THarness
    >,
  ) => void,
) {
  const suite = options.skipIf ? describe.skipIf(options.skipIf()) : describe;

  return suite(name, () => {
    const it = evalTest.override({
      harness: options.harness,
      automaticJudges: (options.judges ?? []) as Array<
        Judge<JudgeContext<any, any, any, any>>
      >,
      judgeThreshold: options.judgeThreshold,
    }) as unknown as EvalTestAPI<
      HarnessInput<THarness>,
      HarnessMetadataFor<THarness>,
      HarnessOutput<THarness>,
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
  TMetadata extends HarnessMetadata,
  TOutput extends JsonValue | undefined,
  THarness extends Harness<TInput, TMetadata, TOutput>,
>(
  task: EvalTaskLike,
  judges: Array<Judge<JudgeContext<TInput, TOutput, TMetadata, THarness>>>,
  threshold: number | null | undefined,
  harness: THarness,
  input: TInput,
  metadata: TMetadata,
  run: HarnessRun<TOutput>,
  signal?: AbortSignal,
) {
  const runToolCalls = toolCalls(run.session);
  const scores = await Promise.all(
    judges.map((judge) => {
      const judgeOptions = {
        input,
        output: run.output,
        toolCalls: runToolCalls,
        metadata,
        run,
        session: run.session,
        signal,
        harness,
      } as JudgeContext<TInput, TOutput, TMetadata, THarness>;

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
  harness: Harness<TInput, TMetadata, TOutput>,
  input: TInput,
  metadata: TMetadata,
  signal?: AbortSignal,
) {
  const context = {
    harness,
    input,
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

function hasMeaningfulText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

  return run.session.outputText ?? "";
}

function formatJudgeTextOutput(run: HarnessRun) {
  if (hasMeaningfulText(run.session.outputText)) {
    return run.session.outputText;
  }

  return resolveAssistantOutput(run.session) ?? formatJudgeOutput(run);
}

function buildJudgeAssertionOptions<
  TJudgeOptions extends JudgeContext<any, any, any, any> = JudgeContext,
>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TJudgeOptions>, "threshold">,
  task?: EvalTaskLike,
): TJudgeOptions {
  const registeredContext = resolveRegisteredJudgeRunContext(
    received,
    options,
    task,
  );
  const harness = options.harness ?? registeredContext?.harness;
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

  return {
    ...(options as Record<string, unknown>),
    input: resolvedInput,
    output,
    metadata,
    run,
    session: options.session ?? run.session,
    signal,
    toolCalls: resolvedToolCalls,
    harness,
  } as unknown as TJudgeOptions;
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
  if (options.run) {
    return options.session
      ? {
          ...options.run,
          session: options.session,
        }
      : options.run;
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
    outputText: typeof received === "string" ? received : undefined,
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
      (hasMeaningfulText(session.outputText)
        ? session.outputText
        : undefined) ??
      resolveAssistantOutput(session) ??
      normalizeJudgeJsonValue(received.messages)
    );
  }

  return normalizeJudgeJsonValue(received);
}

function resolveAssistantOutput(session: NormalizedSession) {
  const assistantContent = [...assistantMessages(session)]
    .reverse()
    .find((message) => hasMeaningfulText(message.content));
  return hasMeaningfulText(assistantContent?.content)
    ? assistantContent.content
    : undefined;
}

function normalizeJudgeJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeContent(value);
}

/** Formats judge results for reporter and assertion output. */
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

/** Creates a named judge object from an assessment function. */
export function createJudge<TOptions extends JudgeContext<any, any, any, any>>(
  name: string,
  assess: JudgeAssessFn<TOptions>,
): Judge<TOptions>;
export function createJudge<
  TOptions extends JudgeContext<any, any, any, any>,
  TInput,
  TOutput,
>(
  name: string,
  harness: JudgeHarness<TInput, TOutput>,
  assess: JudgeAssessWithHarnessFn<TOptions, TInput, TOutput>,
): Judge<TOptions>;
export function createJudge<
  TOptions extends JudgeContext<any, any, any, any>,
  TInput,
  TOutput,
>(
  name: string,
  assessOrHarness: JudgeAssessFn<TOptions> | JudgeHarness<TInput, TOutput>,
  assess?: JudgeAssessWithHarnessFn<TOptions, TInput, TOutput>,
): Judge<TOptions> {
  if (!assess) {
    return {
      name,
      assess: assessOrHarness as JudgeAssessFn<TOptions>,
    };
  }

  const harness = assessOrHarness as JudgeHarness<TInput, TOutput>;

  return {
    name,
    assess: (opts) =>
      assess(opts, {
        assess: (input) =>
          Promise.resolve(
            harness.assess(input, {
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
  createHarness,
  getHarnessRunFromError,
  messagesByRole,
  normalizeHarnessRun,
  systemMessages,
  toolCalls,
  toolMessages,
  userMessages,
  type CreateHarnessOptions,
  type CreateHarnessRunArgs,
  type Harness,
  type HarnessContext,
  type HarnessMetadata,
  type HarnessResultLike,
  type HarnessRun,
  type HarnessRunError,
  type JsonPrimitive,
  type JsonValue,
  type MaybePromise,
  type NormalizedMessage,
  type NormalizedSession,
  type SimpleHarnessResult,
  type SimpleToolCallRecord,
  type TimingSummary,
  type ToolCallRecord,
  type UsageSummary,
} from "./harness";

export {
  StructuredOutputJudge,
  type StructuredOutputJudgeConfig,
  type StructuredOutputJudgeOptions,
  ToolCallJudge,
  type ToolCallJudgeConfig,
  type ToolCallJudgeOptions,
} from "./judges";
export type {
  BoundJudgeHarness,
  Judge,
  JudgeAssessFn,
  JudgeAssessWithHarnessFn,
  JudgeContext,
  JudgeHarness,
  JudgeHarnessOptions,
  JudgeOptions,
  JudgeResult,
} from "./judges/types";
