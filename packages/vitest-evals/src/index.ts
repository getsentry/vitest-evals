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
  BaseJudgeOptions,
  JudgeContext,
  JudgeFn,
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

type InternalEvalFixtures = {
  harness: Harness<any, any>;
  automaticJudges: Array<JudgeFn<HarnessJudgeOptions<any, any>>>;
  judgeThreshold: number | null | undefined;
  run: EvalRun<any, any>;
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
> = (input: TInput, options?: EvalRunOptions<TMetadata>) => Promise<HarnessRun>;

/** Fixture-backed Vitest context exposed inside `describeEval(...)` tests. */
export interface EvalTestContext<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  run: EvalRun<TInput, TMetadata>;
}

export type EvalTestAPI<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = TestAPI<EvalTestContext<TInput, TMetadata>>;

/**
 * Compatibility alias for harness-backed judge inputs.
 *
 * New custom judges should prefer `JudgeContext` directly. This alias remains
 * for older imports that were already using the harness-backed judge shape.
 */
export type HarnessJudgeOptions<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = JudgeContext<TInput, TMetadata>;

/** Suite-level configuration for a harness-backed eval block. */
export interface DescribeEvalOptions<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  /** Harness used for every explicit `run(...)` call in the suite. */
  harness: Harness<TInput, TMetadata>;
  /** Automatic judges applied after each successful `run(...)`. */
  judges?: Array<JudgeFn<HarnessJudgeOptions<TInput, TMetadata>>>;
  /** Passing threshold for automatic suite-level judges. `null` disables fail-on-score. */
  judgeThreshold?: number | null;
  skipIf?: () => boolean;
}

type JudgeAssertionInputValue<TJudgeOptions extends BaseJudgeOptions> =
  TJudgeOptions extends { inputValue: infer TInput } ? TInput : unknown;

type JudgeAssertionMetadata<TJudgeOptions extends BaseJudgeOptions> =
  TJudgeOptions extends { metadata: infer TMetadata }
    ? TMetadata
    : HarnessMetadata;

/** Optional overrides passed to `expect(...).toSatisfyJudge(...)`. */
export type JudgeAssertionOptions<
  TJudgeOptions extends BaseJudgeOptions = BaseJudgeOptions,
> = Partial<
  Omit<TJudgeOptions, "input" | "output" | "metadata" | "run" | "session">
> & {
  input?: string;
  inputValue?: JudgeAssertionInputValue<TJudgeOptions>;
  metadata?: JudgeAssertionMetadata<TJudgeOptions>;
  toolCalls?: ToolCallRecord[];
  run?: HarnessRun;
  session?: HarnessRun["session"];
  /** Passing threshold for the explicit matcher. `null` records the score without failing. */
  threshold?: number | null;
};

export type ToSatisfyJudge<R = unknown> = <
  TJudgeOptions extends BaseJudgeOptions = BaseJudgeOptions,
>(
  judge: JudgeFn<TJudgeOptions>,
  options?: JudgeAssertionOptions<TJudgeOptions>,
) => Promise<R>;

export interface EvalMatchers<R = unknown> {
  toSatisfyJudge: ToSatisfyJudge<R>;
}

declare module "vitest" {
  interface Assertion<T = any> extends EvalMatchers<T> {}
  interface AsymmetricMatchersContaining extends EvalMatchers {}

  interface TaskMeta extends EvalTaskMeta {}
}

const evalTest = test
  .extend("harness", async (): Promise<InternalEvalFixtures["harness"]> => {
    throw new Error(
      "describeEval must override the harness fixture before running tests.",
    );
  })
  .extend(
    "automaticJudges",
    [] as Array<JudgeFn<HarnessJudgeOptions<any, any>>>,
  )
  .extend("judgeThreshold", undefined as number | null | undefined)
  .extend(
    "run",
    async ({ automaticJudges, harness, judgeThreshold, signal, task }) => {
      return async (input: unknown, options?: EvalRunOptions) => {
        const resolvedHarness = harness as Harness<unknown, HarnessMetadata>;
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
          }

          throw error;
        }

        if (Object.keys(artifacts).length > 0 && !run.artifacts) {
          run.artifacts = artifacts;
        }

        setHarnessMeta(task, resolvedHarness.name, run);

        if (automaticJudges.length > 0) {
          await applyAutomaticJudges(
            task,
            automaticJudges,
            judgeThreshold,
            input,
            metadata,
            run,
          );
        }

        return run;
      };
    },
  ) as TestAPI<InternalEvalFixtures>;

expect.extend({
  toSatisfyJudge: async function toSatisfyJudge<
    TJudgeOptions extends BaseJudgeOptions = BaseJudgeOptions,
  >(
    received: unknown,
    judge: JudgeFn<TJudgeOptions>,
    options: JudgeAssertionOptions<TJudgeOptions> = {},
  ) {
    const { threshold = 1.0, ...context } = options;
    const judgeOptions = buildJudgeAssertionOptions(received, context);

    let result = judge(judgeOptions);
    if (result instanceof Promise) {
      result = await result;
    }

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
 *     createAgent: () => createRefundAgent(),
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
export function describeEval<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
>(
  name: string,
  options: DescribeEvalOptions<TInput, TMetadata>,
  define: (it: EvalTestAPI<TInput, TMetadata>) => void,
) {
  const suite = options.skipIf ? describe.skipIf(options.skipIf()) : describe;

  return suite(name, () => {
    const it = evalTest.override({
      harness: options.harness,
      automaticJudges: options.judges ?? [],
      judgeThreshold: options.judgeThreshold,
    }) as EvalTestAPI<TInput, TMetadata>;

    define(it);
  });
}

function createMetadata<TMetadata extends HarnessMetadata>(
  metadata: EvalRunOptions<TMetadata>["metadata"],
) {
  return { ...(metadata ?? {}) } as TMetadata;
}

async function applyAutomaticJudges<TInput, TMetadata extends HarnessMetadata>(
  task: EvalTaskLike,
  judges: Array<JudgeFn<HarnessJudgeOptions<TInput, TMetadata>>>,
  threshold: number | null | undefined,
  input: TInput,
  metadata: TMetadata,
  run: HarnessRun,
) {
  const scores = await Promise.all(
    judges.map((judge) => {
      const judgeOptions = {
        input: formatJudgeInput(input),
        inputValue: input,
        output: formatJudgeTextOutput(run),
        toolCalls: toolCalls(run.session),
        metadata,
        run,
        session: run.session,
      } as HarnessJudgeOptions<TInput, TMetadata>;
      const result = judge(judgeOptions);

      if (result instanceof Promise) {
        return result;
      }

      return new Promise<JudgeResult>((resolve) => resolve(result));
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
    output: formatJudgeTextOutput(run),
    toolCalls: toolCalls(run.session),
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

function formatJudgeInput(input: unknown) {
  if (typeof input === "string") {
    return input;
  }

  try {
    return JSON.stringify(input) ?? String(input);
  } catch {
    return String(input);
  }
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
  return (
    run.session.outputText ??
    resolveAssistantOutput(run.session) ??
    formatJudgeOutput(run)
  );
}

function buildJudgeAssertionOptions<
  TJudgeOptions extends BaseJudgeOptions = BaseJudgeOptions,
>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TJudgeOptions>, "threshold">,
): TJudgeOptions {
  const run = resolveJudgeRun(received, options);
  const metadata = (options.metadata ??
    {}) as JudgeAssertionMetadata<TJudgeOptions>;
  const inputValue =
    options.inputValue ??
    (userMessages(run.session)[0]?.content as
      | JudgeAssertionInputValue<TJudgeOptions>
      | undefined) ??
    undefined;
  const input =
    options.input ??
    (inputValue !== undefined ? formatJudgeInput(inputValue) : "");

  return {
    ...(options as Record<string, unknown>),
    input,
    inputValue,
    output: formatJudgeTextOutput(run),
    metadata,
    run,
    session: options.session ?? run.session,
    toolCalls: options.toolCalls ?? toolCalls(run.session),
  } as unknown as TJudgeOptions;
}

function resolveJudgeRun<
  TJudgeOptions extends BaseJudgeOptions = BaseJudgeOptions,
>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TJudgeOptions>, "threshold">,
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

function createSyntheticJudgeSession<
  TJudgeOptions extends BaseJudgeOptions = BaseJudgeOptions,
>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TJudgeOptions>, "threshold">,
): NormalizedSession {
  const messages: NormalizedSession["messages"] = [];
  const userContent =
    options.inputValue !== undefined
      ? normalizeJudgeJsonValue(options.inputValue)
      : options.input;
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
    return session.outputText ?? normalizeJudgeJsonValue(received.messages);
  }

  return normalizeJudgeJsonValue(received);
}

function resolveAssistantOutput(session: NormalizedSession) {
  const assistantContent = [...assistantMessages(session)]
    .reverse()
    .find((message) => typeof message.content === "string");
  return typeof assistantContent?.content === "string"
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

/** Applies a stable display name to a custom judge function. */
export function namedJudge<TOptions extends BaseJudgeOptions>(
  name: string,
  judge: JudgeFn<TOptions>,
): JudgeFn<TOptions> {
  const named = ((opts: TOptions) => judge(opts)) as JudgeFn<TOptions>;
  Object.defineProperty(named, "name", {
    value: name,
  });
  return named;
}

export { wrapText } from "./wrapText";
export {
  assistantMessages,
  attachHarnessRunToError,
  getHarnessRunFromError,
  messagesByRole,
  systemMessages,
  toolCalls,
  toolMessages,
  userMessages,
  type Harness,
  type HarnessContext,
  type HarnessMetadata,
  type HarnessRun,
  type HarnessRunError,
  type JsonPrimitive,
  type JsonValue,
  type NormalizedMessage,
  type NormalizedSession,
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
  BaseJudgeOptions,
  JudgeContext,
  JudgeFn,
  JudgeResult,
} from "./judges/types";
