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
  JudgeFn,
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
  harness: Harness<any, any>;
  inputValue: unknown;
  metadata: HarnessMetadata;
  run: HarnessRun;
};

type InternalEvalFixtures = {
  harness: Harness<any, any>;
  automaticJudges: Array<JudgeFn<JudgeContext<any, any, any>>>;
  judgeThreshold: number | null | undefined;
  run: EvalRun<any, any>;
};

type HarnessInput<THarness extends Harness<any, any>> =
  THarness extends Harness<infer TInput, any> ? TInput : unknown;

type HarnessMetadataFor<THarness extends Harness<any, any>> =
  THarness extends Harness<any, infer TMetadata> ? TMetadata : HarnessMetadata;

declare const evalHarnessRunBrand: unique symbol;

/** Harness run returned by the fixture-backed `run(...)` API. */
export type EvalHarnessRun<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TMetadata> = Harness<TInput, TMetadata>,
> = HarnessRun & {
  readonly [evalHarnessRunBrand]: {
    readonly input: TInput;
    readonly metadata: TMetadata;
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
  THarness extends Harness<TInput, TMetadata> = Harness<TInput, TMetadata>,
> = (
  input: TInput,
  options?: EvalRunOptions<TMetadata>,
) => Promise<EvalHarnessRun<TInput, TMetadata, THarness>>;

/** Fixture-backed Vitest context exposed inside `describeEval(...)` tests. */
export interface EvalTestContext<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TMetadata> = Harness<TInput, TMetadata>,
> {
  run: EvalRun<TInput, TMetadata, THarness>;
}

export type EvalTestAPI<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TMetadata> = Harness<TInput, TMetadata>,
> = TestAPI<EvalTestContext<TInput, TMetadata, THarness>>;

/** Suite-level configuration for a harness-backed eval block. */
export interface DescribeEvalOptions<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TMetadata> = Harness<TInput, TMetadata>,
> {
  /** Harness used for every explicit `run(...)` call in the suite. */
  harness: THarness;
  /** Automatic judges applied after each successful `run(...)`. */
  judges?: Array<JudgeFn<JudgeContext<TInput, TMetadata, THarness>>>;
  /** Passing threshold for automatic suite-level judges. `null` disables fail-on-score. */
  judgeThreshold?: number | null;
  skipIf?: () => boolean;
}

type JudgeAssertionInputValue<
  TJudgeOptions extends JudgeContext<any, any, any>,
> = TJudgeOptions extends { inputValue: infer TInput } ? TInput : unknown;

type JudgeAssertionMetadata<TJudgeOptions extends JudgeContext<any, any, any>> =
  TJudgeOptions extends { metadata: infer TMetadata }
    ? TMetadata
    : HarnessMetadata;

type JudgeAssertionHarness<TJudgeOptions extends JudgeContext<any, any, any>> =
  TJudgeOptions extends { harness: infer THarness }
    ? Exclude<THarness, undefined>
    : Harness<
        JudgeAssertionInputValue<TJudgeOptions>,
        JudgeAssertionMetadata<TJudgeOptions>
      >;

/** Optional overrides passed to `expect(...).toSatisfyJudge(...)`. */
export type JudgeAssertionOptions<
  TJudgeOptions extends JudgeContext<any, any, any> = JudgeContext,
> = Partial<
  Omit<
    TJudgeOptions,
    | "input"
    | "output"
    | "inputValue"
    | "metadata"
    | "toolCalls"
    | "run"
    | "session"
    | "harness"
  >
> & {
  input?: string;
  inputValue?: JudgeAssertionInputValue<TJudgeOptions>;
  metadata?: JudgeAssertionMetadata<TJudgeOptions>;
  toolCalls?: ToolCallRecord[];
  run?: HarnessRun;
  session?: HarnessRun["session"];
  harness?: JudgeAssertionHarness<TJudgeOptions>;
  /** Passing threshold for the explicit matcher. `null` records the score without failing. */
  threshold?: number | null;
};

export type ToSatisfyJudge<TReceived = unknown> = <
  TJudgeOptions extends JudgeContext<any, any, any> = JudgeContext,
>(
  judge: JudgeFn<TJudgeOptions>,
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
  .extend("automaticJudges", [] as Array<JudgeFn<JudgeContext<any, any, any>>>)
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
            recordJudgeRunContext(partialRun, resolvedHarness, input, metadata);
          }

          throw error;
        }

        if (Object.keys(artifacts).length > 0 && !run.artifacts) {
          run.artifacts = artifacts;
        }

        setHarnessMeta(task, resolvedHarness.name, run);
        recordJudgeRunContext(run, resolvedHarness, input, metadata);

        if (automaticJudges.length > 0) {
          await applyAutomaticJudges(
            task,
            automaticJudges,
            judgeThreshold,
            resolvedHarness,
            input,
            metadata,
            run,
          );
        }

        return run as EvalHarnessRun<
          unknown,
          HarnessMetadata,
          typeof resolvedHarness
        >;
      };
    },
  ) as TestAPI<InternalEvalFixtures>;

expect.extend({
  toSatisfyJudge: async function toSatisfyJudge<
    TJudgeOptions extends JudgeContext<any, any, any> = JudgeContext,
  >(
    received: unknown,
    judge: JudgeFn<TJudgeOptions>,
    options: JudgeAssertionOptions<TJudgeOptions> = {},
  ) {
    const { threshold = 1.0, ...context } = options;
    const judgeOptions = buildJudgeAssertionOptions(
      received,
      context,
      isEvalTaskLike(this.task) ? this.task : undefined,
    );

    const result = await judge(judgeOptions);

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
 *     prompt: judgePrompt,
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
export function describeEval<THarness extends Harness<any, any>>(
  name: string,
  options: DescribeEvalOptions<
    HarnessInput<THarness>,
    HarnessMetadataFor<THarness>,
    THarness
  >,
  define: (
    it: EvalTestAPI<
      HarnessInput<THarness>,
      HarnessMetadataFor<THarness>,
      THarness
    >,
  ) => void,
) {
  const suite = options.skipIf ? describe.skipIf(options.skipIf()) : describe;

  return suite(name, () => {
    const it = evalTest.override({
      harness: options.harness,
      automaticJudges: (options.judges ?? []) as Array<
        JudgeFn<JudgeContext<any, any, any>>
      >,
      judgeThreshold: options.judgeThreshold,
    }) as unknown as EvalTestAPI<
      HarnessInput<THarness>,
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
  TMetadata extends HarnessMetadata,
  THarness extends Harness<TInput, TMetadata>,
>(
  task: EvalTaskLike,
  judges: Array<JudgeFn<JudgeContext<TInput, TMetadata, THarness>>>,
  threshold: number | null | undefined,
  harness: THarness,
  input: TInput,
  metadata: TMetadata,
  run: HarnessRun,
) {
  const output = formatJudgeTextOutput(run);
  const runToolCalls = toolCalls(run.session);
  const scores = await Promise.all(
    judges.map((judge) => {
      const judgeOptions = {
        input: formatJudgeInput(input),
        inputValue: input,
        output,
        toolCalls: runToolCalls,
        metadata,
        run,
        session: run.session,
        harness,
      } as JudgeContext<TInput, TMetadata, THarness>;

      return Promise.resolve(judge(judgeOptions));
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
    output,
    toolCalls: runToolCalls,
    thresholdFailed,
  };

  if (thresholdFailed) {
    assert(
      avgScore >= thresholdValue,
      [
        `Score: ${avgScore.toFixed(2)} below threshold: ${thresholdValue.toFixed(2)}`,
        `Output: ${wrapText(output)}`,
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

function recordJudgeRunContext<TInput, TMetadata extends HarnessMetadata>(
  run: HarnessRun,
  harness: Harness<TInput, TMetadata>,
  inputValue: TInput,
  metadata: TMetadata,
) {
  const context = {
    harness,
    inputValue,
    metadata,
    run,
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
  TJudgeOptions extends JudgeContext<any, any, any> = JudgeContext,
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
  const metadata = (options.metadata ??
    registeredContext?.metadata ??
    {}) as JudgeAssertionMetadata<TJudgeOptions>;
  const inputValue =
    options.inputValue ??
    (registeredContext?.inputValue as
      | JudgeAssertionInputValue<TJudgeOptions>
      | undefined) ??
    undefined;
  const contextualOptions = {
    ...options,
    ...(inputValue !== undefined ? { inputValue } : {}),
  };
  const run = resolveJudgeRun(
    received,
    contextualOptions,
    registeredContext?.run,
  );
  const resolvedInputValue =
    inputValue ??
    (userMessages(run.session)[0]?.content as
      | JudgeAssertionInputValue<TJudgeOptions>
      | undefined) ??
    undefined;
  const input =
    options.input ??
    (resolvedInputValue !== undefined
      ? formatJudgeInput(resolvedInputValue)
      : "");

  return {
    ...(options as Record<string, unknown>),
    input,
    inputValue: resolvedInputValue,
    output: formatJudgeAssertionOutput(received, run),
    metadata,
    run,
    session: options.session ?? run.session,
    toolCalls: options.toolCalls ?? toolCalls(run.session),
    harness,
  } as unknown as TJudgeOptions;
}

function resolveRegisteredJudgeRunContext<
  TJudgeOptions extends JudgeContext<any, any, any> = JudgeContext,
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
  TJudgeOptions extends JudgeContext<any, any, any> = JudgeContext,
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

function formatJudgeAssertionOutput(received: unknown, run: HarnessRun) {
  if (isHarnessRun(received) || isNormalizedSession(received)) {
    return formatJudgeTextOutput(run);
  }

  return formatReceivedJudgeOutput(received);
}

function formatReceivedJudgeOutput(received: unknown) {
  if (typeof received === "string") {
    return received;
  }

  if (received !== undefined) {
    try {
      return JSON.stringify(received) ?? String(received);
    } catch {
      return String(received);
    }
  }

  return "";
}

function createSyntheticJudgeSession<
  TJudgeOptions extends JudgeContext<any, any, any> = JudgeContext,
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

/** Applies a stable display name to a custom judge function. */
export function namedJudge<TOptions extends JudgeContext<any, any, any>>(
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
  type HarnessPrompt,
  type HarnessPromptOptions,
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
  JudgeContext,
  JudgeFn,
  JudgeOptions,
  JudgeResult,
} from "./judges/types";
