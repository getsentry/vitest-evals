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
  HarnessJudgeRuntime,
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
  name: TCase["name"];
  input: TCase["input"];
  metadata: Partial<HarnessCaseMetadata<TCase>>;
  caseData: TCase;
  run: HarnessRun;
  output: HarnessRun["output"];
  session: HarnessRun["session"];
  usage: HarnessRun["usage"];
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
    judge?: HarnessJudgeRuntime;
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

export type HarnessCaseMetadata<TCase extends HarnessCase = HarnessCase> = Omit<
  TCase,
  "input" | "name"
>;

export type HarnessRunOptions<TCase extends HarnessCase = HarnessCase> = {
  name?: string;
  metadata?: Partial<HarnessCaseMetadata<TCase>>;
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
};

export interface HarnessTestContext<
  TCase extends HarnessCase = HarnessCase,
  TAgent = unknown,
> {
  agent: TAgent | undefined;
  run: <TRunCase extends TCase = TCase>(
    input: TRunCase["input"],
    options?: HarnessRunOptions<TRunCase>,
  ) => Promise<HarnessEvalContext<TRunCase, TAgent>>;
}

export type HarnessTestOptions = {
  timeout?: number;
  skipIf?: () => boolean;
};

export type HarnessEvalTestFn<
  TCase extends HarnessCase = HarnessCase,
  TAgent = unknown,
> = (context: HarnessTestContext<TCase, TAgent>) => Promise<void> | void;

export type HarnessEvalTestRegistrar<
  TCase extends HarnessCase = HarnessCase,
  TAgent = unknown,
> = {
  (name: string, fn: HarnessEvalTestFn<TCase, TAgent>): void;
  (
    name: string,
    options: HarnessTestOptions,
    fn: HarnessEvalTestFn<TCase, TAgent>,
  ): void;
};

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
 *       output: ({ outputText }) => parseRefundDecision(outputText ?? ""),
 *     }),
 *   },
 *   (it) => {
 *     it("approves refundable invoice", async ({ run }) => {
 *       const result = await run("Refund invoice inv_123");
 *
 *       expect(result.output).toMatchObject({ status: "approved" });
 *       expect(toolCalls(result.session)).toHaveLength(2);
 *     });
 *   },
 * );
 * ```
 */
export function describeEval<TCase extends HarnessCase, TAgent = unknown>(
  name: string,
  options: HarnessSuiteOptions<TCase, TAgent>,
  define: (it: HarnessEvalTestRegistrar<TCase, TAgent>) => void,
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
  define?: (it: HarnessEvalTestRegistrar<TCase, TAgent>) => void,
) {
  return describe(name, async () => {
    registerHarnessHooks(options);

    if (define) {
      define(createHarnessTestRegistrar(options));
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
        judges: resolveHarnessJudges(options.harness, options.judges),
        threshold: resolveHarnessThreshold(options.harness, options.threshold),
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

function resolveHarnessJudges<TCase extends HarnessCase, TAgent = unknown>(
  harness: Harness<TCase["input"], TCase, TAgent>,
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>,
): Array<JudgeFn<HarnessJudgeOptions<TCase>>> | undefined {
  const combined = [
    ...((harness.judges ?? []) as Array<JudgeFn<HarnessJudgeOptions<TCase>>>),
    ...(judges ?? []),
  ];

  return combined.length > 0 ? combined : undefined;
}

function resolveHarnessThreshold<TCase extends HarnessCase, TAgent = unknown>(
  harness: Harness<TCase["input"], TCase, TAgent>,
  threshold?: number | null,
) {
  return threshold === undefined ? harness.threshold : threshold;
}

function createHarnessTestRegistrar<
  TCase extends HarnessCase,
  TAgent = unknown,
>(
  options: HarnessSuiteOptions<TCase, TAgent>,
): HarnessEvalTestRegistrar<TCase, TAgent> {
  return ((
    testName: string,
    optionsOrFn: HarnessTestOptions | HarnessEvalTestFn<TCase, TAgent>,
    maybeFn?: HarnessEvalTestFn<TCase, TAgent>,
  ) => {
    const testOptions =
      typeof optionsOrFn === "function" ? undefined : optionsOrFn;
    const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;
    const testFn =
      options.skipIf?.() || testOptions?.skipIf?.() ? test.skip : test;

    if (!fn) {
      throw new Error(`describeEval test "${testName}" requires a callback.`);
    }

    registerHarnessFixtureTest({
      testFn: testFn as VitestEvalTestFn,
      testName,
      harness: options.harness,
      judges: resolveHarnessJudges(options.harness, options.judges),
      threshold: resolveHarnessThreshold(options.harness, options.threshold),
      timeout: testOptions?.timeout ?? options.timeout,
      fn,
    });
  }) as HarnessEvalTestRegistrar<TCase, TAgent>;
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
  task?: (context: HarnessEvalContext<TCase, TAgent>) => Promise<void> | void;
}) {
  testFn(
    testName,
    {
      timeout: timeout ?? 60000,
    },
    async ({ task: testTask }) => {
      const execution = await resolveHarnessExecution(harness);
      const result = await executeHarnessCase({
        testTask,
        harnessName: harness.name,
        harnessJudge: harness.judge,
        execution,
        caseData,
        judges,
        threshold,
      });

      await task?.(result);
    },
  );
}

function registerHarnessFixtureTest<
  TCase extends HarnessCase,
  TAgent = unknown,
>({
  testFn,
  testName,
  harness,
  judges,
  threshold,
  timeout,
  fn,
}: {
  testFn: VitestEvalTestFn;
  testName: string;
  harness: Harness<TCase["input"], TCase, TAgent>;
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  timeout?: number;
  fn: HarnessEvalTestFn<TCase, TAgent>;
}) {
  testFn(
    testName,
    {
      timeout: timeout ?? 60000,
    },
    async ({ task: testTask }) => {
      const execution = await resolveHarnessExecution(harness);
      let hasRun = false;

      await fn({
        agent: execution.agent,
        run: async <TRunCase extends TCase = TCase>(
          input: TRunCase["input"],
          runOptions?: HarnessRunOptions<TRunCase>,
        ) => {
          if (hasRun) {
            throw new Error(
              `describeEval test "${testName}" already called run(). Split multiple scenarios into separate tests so reporting stays one run per test.`,
            );
          }
          hasRun = true;

          const {
            name: runName,
            metadata,
            judges: runJudges,
            threshold: runThreshold,
          } = runOptions ?? {};
          const caseData = {
            ...(metadata ?? {}),
            input,
            name: runName ?? testName,
          } as TRunCase;

          return executeHarnessCase({
            testTask,
            harnessName: harness.name,
            harnessJudge: harness.judge,
            execution: execution as unknown as HarnessExecution<
              TRunCase["input"],
              TRunCase,
              TAgent
            >,
            caseData,
            judges: [
              ...((judges ?? []) as Array<
                JudgeFn<HarnessJudgeOptions<TRunCase>>
              >),
              ...(runJudges ?? []),
            ],
            threshold: runThreshold === undefined ? threshold : runThreshold,
          });
        },
      });

      if (!hasRun) {
        throw new Error(
          `describeEval test "${testName}" must call run(input) so the harness can capture reporting metadata.`,
        );
      }
    },
  );
}

async function executeHarnessCase<TCase extends HarnessCase, TAgent = unknown>({
  testTask,
  harnessName,
  harnessJudge,
  execution,
  caseData,
  judges,
  threshold,
}: {
  testTask: { meta: Record<string, any> };
  harnessName: string;
  harnessJudge?: HarnessJudgeRuntime;
  execution: HarnessExecution<TCase["input"], TCase, TAgent>;
  caseData: TCase;
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
}): Promise<HarnessEvalContext<TCase, TAgent>> {
  const { input } = caseData;
  const artifacts: HarnessContext["artifacts"] = {};
  const context: HarnessContext<any> = {
    caseData,
    task: testTask,
    artifacts,
    setArtifact: (artifactName, value) => {
      artifacts[artifactName] = value;
    },
  };

  let run: HarnessRun;
  try {
    run = await execution.run(input, context);
  } catch (error) {
    const partialRun = getHarnessRunFromError(error);
    if (partialRun) {
      attachHarnessMeta(testTask, harnessName, partialRun, artifacts);
    }

    throw error;
  }

  attachHarnessMeta(testTask, harnessName, run, artifacts);
  await runAutomaticJudges({
    testTask,
    judges,
    threshold,
    caseData,
    input,
    run,
    harnessJudge,
  });

  return createHarnessEvalContext(
    execution.agent,
    input,
    caseData,
    run,
    harnessJudge,
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
  harnessJudge,
}: {
  testTask: { meta: Record<string, any> };
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  caseData: TCase;
  input: TCase["input"];
  run: HarnessRun;
  harnessJudge?: HarnessJudgeRuntime;
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
        judge: harnessJudge,
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

function createHarnessEvalContext<TCase extends HarnessCase, TAgent = unknown>(
  agent: TAgent | undefined,
  input: TCase["input"],
  caseData: TCase,
  run: HarnessRun,
  harnessJudge?: HarnessJudgeRuntime,
): HarnessEvalContext<TCase, TAgent> {
  return {
    agent,
    name: caseData.name,
    input,
    metadata: extractCaseMetadata(caseData),
    caseData,
    run,
    output: run.output,
    session: run.session,
    usage: run.usage,
    judge: createRunJudge(input, caseData, run, harnessJudge),
  };
}

function extractCaseMetadata<TCase extends HarnessCase>(
  caseData: TCase,
): Partial<HarnessCaseMetadata<TCase>> {
  const { input: _input, name: _name, ...metadata } = caseData;
  return metadata as HarnessCaseMetadata<TCase>;
}

function createRunJudge<TCase extends HarnessCase>(
  input: TCase["input"],
  caseData: TCase,
  run: HarnessRun,
  harnessJudge?: HarnessJudgeRuntime,
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
      judge: harnessJudge,
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
  type HarnessJudgePromptOptions,
  type HarnessJudgeRuntime,
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
