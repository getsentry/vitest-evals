import {
  assert,
  beforeEach as vitestBeforeEach,
  afterEach as vitestAfterEach,
  describe,
  expect,
  test,
} from "vitest";
import "vitest";
import type {
  Harness,
  HarnessCase,
  HarnessContext,
  HarnessExecution,
  HarnessRun,
  JsonValue,
  NormalizedSession,
  ToolCallRecord,
} from "./harness";
import {
  attachHarnessRunToError,
  assistantMessages,
  getHarnessRunFromError,
  toolCalls,
  userMessages,
} from "./harness";
import type { BaseJudgeOptions, JudgeFn, JudgeResult } from "./judges/types";
import { wrapText } from "./wrapText";

type MaybePromise<T> = T | Promise<T>;
type VitestEvalTestFn = (
  name: string,
  options: { timeout: number },
  fn: (context: { task: { meta: Record<string, any> } }) => Promise<void>,
) => void;

export interface HarnessEvalContext<
  TCase extends HarnessCase = HarnessCase,
  TAgent = unknown,
> {
  agent: TAgent | undefined;
  input: TCase["input"];
  caseData: TCase;
  run: HarnessRun;
  session: HarnessRun["session"];
  judge: RunJudge<TCase>;
}

export type HarnessCaseSource<TCase extends HarnessCase = HarnessCase> =
  | TCase[]
  | (() => MaybePromise<TCase[]>);

export type HarnessJudgeOptions<TCase extends HarnessCase = HarnessCase> =
  BaseJudgeOptions & {
    rawInput: TCase["input"];
    assistantOutput?: string;
    caseData: TCase;
    run: HarnessRun;
    session: HarnessRun["session"];
  } & Record<string, any>;

export interface HarnessDescribeEvalOptions<
  TCase extends HarnessCase = HarnessCase,
  TAgent = unknown,
> {
  data: HarnessCaseSource<TCase>;
  harness: Harness<TCase["input"], TCase, TAgent>;
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  test?: (context: HarnessEvalContext<TCase, TAgent>) => Promise<void> | void;
  skipIf?: () => boolean;
  timeout?: number;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

export interface HarnessSuiteOptions<
  TCase extends HarnessCase = HarnessCase,
  TAgent = unknown,
> {
  harness: Harness<TCase["input"], TCase, TAgent>;
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  skipIf?: () => boolean;
  timeout?: number;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

export type HarnessTaskOptions<TCase extends HarnessCase = HarnessCase> = Omit<
  TCase,
  "name"
> & {
  name?: string;
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  skipIf?: () => boolean;
  timeout?: number;
};

export type HarnessTaskFn<
  TCase extends HarnessCase = HarnessCase,
  TAgent = unknown,
> = (context: HarnessEvalContext<TCase, TAgent>) => Promise<void> | void;

export type HarnessTaskRegistrar<
  TCase extends HarnessCase = HarnessCase,
  TAgent = unknown,
> = <TTaskCase extends TCase>(
  name: string,
  options: HarnessTaskOptions<TTaskCase>,
  task?: HarnessTaskFn<TTaskCase, TAgent>,
) => void;

export type JudgeAssertionOptions<TCase extends HarnessCase = HarnessCase> =
  Partial<
    Omit<
      HarnessJudgeOptions<TCase>,
      "input" | "output" | "caseData" | "run" | "session"
    >
  > & {
    input?: string;
    rawInput?: TCase["input"];
    caseData?: TCase;
    run?: HarnessRun;
    session?: HarnessRun["session"];
    threshold?: number;
  };

export type ToSatisfyJudge<R = unknown> = (
  judge: JudgeFn<any>,
  options?: JudgeAssertionOptions<any>,
) => Promise<R>;

export type RunJudge<TCase extends HarnessCase = HarnessCase> = {
  (judge: JudgeFn<any>, options?: JudgeAssertionOptions<TCase>): Promise<void>;
  (
    value: unknown,
    judge: JudgeFn<any>,
    options?: JudgeAssertionOptions<TCase>,
  ): Promise<void>;
};

export interface EvalMatchers<R = unknown> {
  toSatisfyJudge: ToSatisfyJudge<R>;
}

declare module "vitest" {
  interface Assertion<T = any> extends EvalMatchers<T> {}
  interface AsymmetricMatchersContaining extends EvalMatchers {}

  interface TaskMeta {
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
  }
}

expect.extend({
  toSatisfyJudge: async function toSatisfyJudge(
    received: unknown,
    judge: JudgeFn<any>,
    options: JudgeAssertionOptions<any> = {},
  ) {
    const { threshold = 1.0, ...context } = options;
    const judgeOptions = buildJudgeAssertionOptions(received, context);

    let result = judge(judgeOptions);
    if (result instanceof Promise) {
      result = await result;
    }

    const score = result.score ?? 0;
    const pass = score >= threshold;
    const scores = [
      {
        ...result,
        name: judge.name || "AnonymousJudge",
      },
    ];

    return {
      pass,
      message: () =>
        [
          `Score: ${score.toFixed(2)} below threshold: ${threshold.toFixed(2)}`,
          `Output: ${wrapText(judgeOptions.output)}`,
          formatScores(scores),
        ].join("\n\n"),
    };
  },
});

/**
 * Creates a harness-backed eval suite.
 *
 * @param name - The name of the test suite
 * @param options - Configuration options
 * @param options.harness - Harness adapter that runs the system under test and returns normalized artifacts
 * @param options.judges - Optional automatic judges that run against the normalized run/session data
 * @param options.timeout - Test timeout in milliseconds, defaults to 60000 (60s)
 *
 * @example
 * ```javascript
 * describeEval(
 *   "refund agent",
 *   {
 *     harness: piAiHarness({
 *       agent: createRefundAgent,
 *       tools: refundTools,
 *     }),
 *   },
 *   (it) => {
 *     it(
 *       "approves refundable invoice",
 *       { input: "Refund invoice inv_123" },
 *       async ({ run, session, judge }) => {
 *         expect(run.output).toMatchObject({ status: "approved" });
 *         expect(toolCalls(session)).toHaveLength(2);
 *         await judge(StructuredOutputJudge(), {
 *           expected: { status: "approved" },
 *         });
 *       },
 *     );
 *   },
 * );
 * ```
 */
export function describeEval<TCase extends HarnessCase, TAgent = unknown>(
  name: string,
  options: HarnessSuiteOptions<TCase, TAgent>,
  define: (task: HarnessTaskRegistrar<TCase, TAgent>) => void,
): void;
export function describeEval<TCase extends HarnessCase, TAgent = unknown>(
  name: string,
  options: HarnessDescribeEvalOptions<TCase, TAgent>,
): void;
export function describeEval<TCase extends HarnessCase, TAgent = unknown>(
  name: string,
  options:
    | HarnessDescribeEvalOptions<TCase, TAgent>
    | HarnessSuiteOptions<TCase, TAgent>,
  define?: (task: HarnessTaskRegistrar<TCase, TAgent>) => void,
) {
  return describe(name, async () => {
    registerHarnessHooks(options);

    if (define) {
      define(createHarnessTaskRegistrar(options));
      return;
    }

    if (!isDataBackedEvalOptions(options)) {
      throw new Error(
        "describeEval requires either data-backed options or a callback that defines eval tests.",
      );
    }

    const testFn = options.skipIf ? test.skipIf(options.skipIf()) : test;
    for (const caseData of await resolveCaseData(options.data)) {
      const { input, name: testName } = caseData;
      registerHarnessCaseTest({
        testFn: testFn as VitestEvalTestFn,
        testName: testName ?? formatHarnessTestName(input),
        harness: options.harness,
        caseData,
        judges: options.judges,
        threshold: options.threshold,
        timeout: options.timeout,
        task: options.test,
      });
    }
  });
}

function registerHarnessHooks(options: {
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}) {
  if (options.beforeEach) {
    vitestBeforeEach(options.beforeEach);
  }
  if (options.afterEach) {
    vitestAfterEach(options.afterEach);
  }
}

function isDataBackedEvalOptions<TCase extends HarnessCase, TAgent>(
  options:
    | HarnessDescribeEvalOptions<TCase, TAgent>
    | HarnessSuiteOptions<TCase, TAgent>,
): options is HarnessDescribeEvalOptions<TCase, TAgent> {
  return "data" in options;
}

function createHarnessTaskRegistrar<
  TCase extends HarnessCase,
  TAgent = unknown,
>(
  options: HarnessSuiteOptions<TCase, TAgent>,
): HarnessTaskRegistrar<TCase, TAgent> {
  return <TTaskCase extends TCase>(
    testName: string,
    taskOptions: HarnessTaskOptions<TTaskCase>,
    task?: HarnessTaskFn<TTaskCase, TAgent>,
  ) => {
    const { caseData, judges, threshold, skipIf, timeout } =
      splitHarnessTaskOptions<TTaskCase>(testName, taskOptions);
    const testFn = options.skipIf?.() || skipIf?.() ? test.skip : test;

    registerHarnessCaseTest({
      testFn: testFn as VitestEvalTestFn,
      testName,
      harness: options.harness as unknown as Harness<
        TTaskCase["input"],
        TTaskCase,
        TAgent
      >,
      caseData,
      judges: [
        ...((options.judges ?? []) as Array<
          JudgeFn<HarnessJudgeOptions<TTaskCase>>
        >),
        ...(judges ?? []),
      ],
      threshold: threshold === undefined ? options.threshold : threshold,
      timeout: timeout ?? options.timeout,
      task,
    });
  };
}

function splitHarnessTaskOptions<TCase extends HarnessCase>(
  testName: string,
  options: HarnessTaskOptions<TCase>,
) {
  const { judges, threshold, skipIf, timeout, ...caseFields } =
    options as HarnessTaskOptions<TCase> & Record<string, unknown>;
  const caseData = {
    ...caseFields,
    name: testName,
  } as unknown as TCase;

  return {
    caseData,
    judges,
    threshold,
    skipIf,
    timeout,
  };
}

function registerHarnessCaseTest<TCase extends HarnessCase, TAgent = unknown>({
  testFn,
  testName,
  harness,
  caseData,
  judges,
  threshold,
  timeout,
  task,
}: {
  testFn: VitestEvalTestFn;
  testName: string;
  harness: Harness<TCase["input"], TCase, TAgent>;
  caseData: TCase;
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  timeout?: number;
  task?: HarnessTaskFn<TCase, TAgent>;
}) {
  const { input } = caseData;

  testFn(
    testName,
    {
      timeout: timeout ?? 60000,
    },
    async ({ task: testTask }) => {
      const artifacts: HarnessContext["artifacts"] = {};
      const context: HarnessContext<any> = {
        caseData,
        task: testTask,
        artifacts,
        setArtifact: (artifactName, value) => {
          artifacts[artifactName] = value;
        },
      };
      const execution = await resolveHarnessExecution(harness);

      let run: HarnessRun;
      try {
        run = await execution.run(input, context);
      } catch (error) {
        const partialRun = getHarnessRunFromError(error);
        if (partialRun) {
          attachHarnessMeta(testTask, harness.name, partialRun, artifacts);
        }

        throw error;
      }

      attachHarnessMeta(testTask, harness.name, run, artifacts);
      await runAutomaticJudges({
        testTask,
        judges,
        threshold,
        caseData,
        input,
        run,
      });

      await task?.({
        agent: execution.agent,
        input,
        caseData,
        run,
        session: run.session,
        judge: createRunJudge(input, caseData, run),
      });
    },
  );
}

async function resolveHarnessExecution<
  TCase extends HarnessCase,
  TAgent = unknown,
>(
  harness: Harness<TCase["input"], TCase, TAgent>,
): Promise<HarnessExecution<TCase["input"], TCase, TAgent>> {
  return harness.setup ? await harness.setup() : { run: harness.run };
}

function attachHarnessMeta(
  testTask: { meta: Record<string, any> },
  harnessName: string,
  run: HarnessRun,
  artifacts: Record<string, JsonValue>,
) {
  if (Object.keys(artifacts).length > 0 && !run.artifacts) {
    run.artifacts = artifacts;
  }

  testTask.meta.harness = {
    name: harnessName,
    run,
  };
}

async function runAutomaticJudges<TCase extends HarnessCase>({
  testTask,
  judges,
  threshold,
  caseData,
  input,
  run,
}: {
  testTask: { meta: Record<string, any> };
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  caseData: TCase;
  input: TCase["input"];
  run: HarnessRun;
}) {
  if (!judges || judges.length === 0) {
    return;
  }

  const output = formatJudgeOutput(run);
  const toolCallRecords = toolCalls(run.session);
  const scores = await Promise.all(
    judges.map((judge) => {
      const result = judge({
        ...(caseData as Record<string, any>),
        input: formatJudgeInput(input),
        rawInput: input,
        output,
        assistantOutput: run.session.outputText,
        toolCalls: toolCallRecords,
        caseData,
        run,
        session: run.session,
      });

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
  const avgScore =
    scores.reduce((acc, score) => acc + (score.score ?? 0), 0) / scores.length;
  const resolvedThreshold = threshold === undefined ? 1.0 : threshold;
  const thresholdFailed =
    resolvedThreshold !== null && avgScore < resolvedThreshold;

  testTask.meta.eval = {
    scores: scoresWithName,
    avgScore,
    output,
    toolCalls: toolCallRecords,
    thresholdFailed,
  };

  if (thresholdFailed) {
    assert(
      avgScore >= resolvedThreshold,
      [
        `Score: ${avgScore.toFixed(2)} below threshold: ${resolvedThreshold.toFixed(2)}`,
        `Output: ${wrapText(output)}`,
        formatScores(scoresWithName),
      ].join("\n\n"),
    );
  }
}

function createRunJudge<TCase extends HarnessCase>(
  input: TCase["input"],
  caseData: TCase,
  run: HarnessRun,
): RunJudge<TCase> {
  return async (
    valueOrJudge: unknown | JudgeFn<any>,
    judgeOrOptions?: JudgeFn<any> | JudgeAssertionOptions<TCase>,
    maybeOptions?: JudgeAssertionOptions<TCase>,
  ) => {
    const received =
      typeof valueOrJudge === "function" ? (run.output ?? run) : valueOrJudge;
    const judge =
      typeof valueOrJudge === "function"
        ? (valueOrJudge as JudgeFn<any>)
        : (judgeOrOptions as JudgeFn<any>);
    const judgeOptions =
      typeof valueOrJudge === "function"
        ? (judgeOrOptions as JudgeAssertionOptions<TCase> | undefined)
        : maybeOptions;

    await expect(received).toSatisfyJudge(judge, {
      rawInput: input,
      caseData,
      run,
      session: run.session,
      ...(judgeOptions ?? {}),
    });
  };
}

function formatHarnessTestName(input: unknown) {
  if (typeof input === "string") {
    return input;
  }

  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

async function resolveCaseData<TCase extends HarnessCase>(
  data: HarnessCaseSource<TCase>,
) {
  return typeof data === "function" ? await data() : data;
}

function formatJudgeInput(input: unknown) {
  if (typeof input === "string") {
    return input;
  }

  try {
    return JSON.stringify(input);
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

function buildJudgeAssertionOptions<TCase extends HarnessCase = HarnessCase>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TCase>, "threshold">,
): HarnessJudgeOptions<TCase> {
  const run = resolveJudgeRun(received, options);
  const rawInput =
    options.rawInput ??
    (userMessages(run.session)[0]?.content as TCase["input"] | undefined) ??
    undefined;
  const input =
    options.input ?? (rawInput !== undefined ? formatJudgeInput(rawInput) : "");

  return {
    ...(options as Record<string, any>),
    input,
    rawInput,
    output: formatJudgeOutput(run),
    assistantOutput:
      options.assistantOutput ??
      run.session.outputText ??
      resolveAssistantOutput(run.session),
    caseData:
      options.caseData ??
      ((rawInput !== undefined ? { input: rawInput } : { input }) as TCase),
    run,
    session: options.session ?? run.session,
    toolCalls: options.toolCalls ?? toolCalls(run.session),
  };
}

function resolveJudgeRun<TCase extends HarnessCase = HarnessCase>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TCase>, "threshold">,
): HarnessRun {
  if (options.run) {
    return options.session
      ? {
          ...options.run,
          session: options.session,
        }
      : options.run;
  }

  if (looksLikeHarnessRun(received)) {
    return options.session
      ? {
          ...received,
          session: options.session,
        }
      : received;
  }

  const session =
    options.session ??
    (looksLikeNormalizedSession(received)
      ? received
      : createSyntheticJudgeSession(received, options));

  return {
    session,
    output: inferJudgeOutputValue(received, session),
    usage: {},
    errors: [],
  };
}

function createSyntheticJudgeSession<TCase extends HarnessCase = HarnessCase>(
  received: unknown,
  options: Omit<JudgeAssertionOptions<TCase>, "threshold">,
): NormalizedSession {
  const messages: NormalizedSession["messages"] = [];
  const rawInput = options.rawInput;
  if (rawInput !== undefined) {
    messages.push({
      role: "user",
      content: normalizeJudgeJsonValue(rawInput),
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
    outputText:
      options.assistantOutput ??
      (typeof received === "string" ? received : undefined),
  };
}

function inferJudgeOutputValue(
  received: unknown,
  session: NormalizedSession,
): JsonValue | undefined {
  if (looksLikeHarnessRun(received)) {
    return received.output;
  }

  if (looksLikeNormalizedSession(received)) {
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

  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return String(value);
  }
}

function looksLikeHarnessRun(value: unknown): value is HarnessRun {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "session" in value &&
    "usage" in value &&
    "errors" in value
  );
}

function looksLikeNormalizedSession(
  value: unknown,
): value is NormalizedSession {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "messages" in value &&
    Array.isArray((value as { messages?: unknown[] }).messages)
  );
}

export function formatScores(scores: (JudgeResult & { name: string })[]) {
  return scores
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
  isHarnessRun,
  isNormalizedSession,
  messagesByRole,
  resolveHarnessRunErrors,
  serializeError,
  systemMessages,
  toolCalls,
  toolMessages,
  userMessages,
  type Harness,
  type HarnessCase,
  type HarnessContext,
  type HarnessExecution,
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
export type { BaseJudgeOptions, JudgeFn, JudgeResult } from "./judges/types";
