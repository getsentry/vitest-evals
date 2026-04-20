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
  HarnessRun,
  JsonValue,
  NormalizedSession,
} from "./harness";
import {
  attachHarnessRunToError,
  assistantMessages,
  getHarnessRunFromError,
  toolCalls,
  userMessages,
} from "./harness";
import { wrapText } from "./wrapText";

/**
 * Represents a tool/function call made during task execution.
 * Supports various LLM provider formats and use cases.
 */
export type ToolCall = {
  // Core fields (required for basic usage)
  name: string;
  arguments?: Record<string, any>;

  // Additional metadata
  [key: string]: any; // Allow provider-specific fields
};

export type TaskResult = {
  result: string;
  toolCalls?: ToolCall[];
};

/**
 * Task function that processes an input and returns either a string result
 * or a TaskResult object containing the result and any tool calls made.
 *
 * @param input - The input string to process
 * @returns Promise resolving to either a string or TaskResult object
 *
 * @example
 * // Simple tasks can just return a string
 * const simpleTask: TaskFn = async (input) => "The answer is 42";
 *
 * // Tasks that use tools should return TaskResult
 * const taskWithTools: TaskFn = async (input) => ({
 *   result: "The answer is 42",
 *   toolCalls: [{ name: "calculate", arguments: { expr: "6*7" }, result: 42 }]
 * });
 */
export type TaskFn = (input: string) => Promise<string | TaskResult>;

export type Score = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: any;
  } & Record<string, any>;
};

export interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCall[];
}

export type ScoreFn<TOptions extends BaseScorerOptions = BaseScorerOptions> = (
  opts: TOptions,
) => Promise<Score> | Score;

export interface HarnessEvalContext<TCase extends HarnessCase = HarnessCase> {
  input: TCase["input"];
  caseData: TCase;
  run: HarnessRun;
  session: HarnessRun["session"];
}

export type HarnessJudgeOptions<TCase extends HarnessCase = HarnessCase> =
  BaseScorerOptions & {
    rawInput: TCase["input"];
    assistantOutput?: string;
    caseData: TCase;
    run: HarnessRun;
    session: HarnessRun["session"];
  } & Record<string, any>;

export interface HarnessDescribeEvalOptions<
  TCase extends HarnessCase = HarnessCase,
> {
  data: () => Promise<TCase[]>;
  harness: Harness<TCase["input"], TCase>;
  judges?: Array<ScoreFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  test?: (context: HarnessEvalContext<TCase>) => Promise<void> | void;
  skipIf?: () => boolean;
  timeout?: number;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

export interface LegacyDescribeEvalOptions {
  data: () => Promise<
    Array<{ input: string; name?: string } & Record<string, any>>
  >;
  task: TaskFn;
  skipIf?: () => boolean;
  scorers: ScoreFn<any>[];
  threshold?: number | null;
  timeout?: number;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

/**
 * @deprecated Use describeEval() instead for better test organization and multiple scorers support
 */
export type ToEval<R = unknown> = (
  expected: any,
  taskFn: TaskFn,
  scoreFn: ScoreFn<any>,
  threshold?: number,
) => Promise<R>;

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
  judge: ScoreFn<any>,
  options?: JudgeAssertionOptions<any>,
) => Promise<R>;

export interface EvalMatchers<R = unknown> {
  toEval: ToEval<R>;
  toSatisfyJudge: ToSatisfyJudge<R>;
}

declare module "vitest" {
  interface Assertion<T = any> extends EvalMatchers<T> {}
  interface AsymmetricMatchersContaining extends EvalMatchers {}

  interface TaskMeta {
    eval?: {
      scores: (Score & { name: string })[];
      avgScore: number;
      output?: unknown;
      toolCalls?: ToolCall[];
      thresholdFailed?: boolean;
    };
    harness?: {
      name: string;
      run: HarnessRun;
    };
  }
}

expect.extend({
  /**
   * Evaluates a language model output against an expected answer using a scoring function.
   *
   * @deprecated Use describeEval() instead for better test organization and multiple scorers support
   * @param expected - The expected (ground truth) answer, can be any type depending on the scorer
   * @param taskFn - Async function that processes the input and returns the model output
   *                 Can return either a string or TaskResult object with result and optional toolCalls
   * @param scoreFn - Function that evaluates the model output against the expected answer
   * @param threshold - Minimum acceptable score (0-1), defaults to 1.0
   *
   * @example
   * ```javascript
   * test("checks capital of France", async () => {
   *   expect("What is the capital of France?").toEval(
   *     "Paris",
   *     async (input) => {
   *       const response = await queryLLM(input);
   *       // Recommended: return TaskResult
   *       return {
   *         result: response.text,
   *         toolCalls: response.toolCalls || []
   *       };
   *     },
   *     checkFactuality,
   *     0.8
   *   );
   * });
   * ```
   */
  // TODO: this needs to be support true extensibility with Eval scorers
  toEval: async function toEval(
    input: string,
    expected: any,
    taskFn: TaskFn,
    scoreFn: ScoreFn<any>,
    threshold = 1.0,
  ) {
    const taskOutput = await taskFn(input);
    const output =
      typeof taskOutput === "string" ? taskOutput : taskOutput.result;
    const toolCalls =
      typeof taskOutput === "object" ? taskOutput.toolCalls : undefined;

    let result = scoreFn({ input, expected, output, toolCalls });
    if (result instanceof Promise) {
      result = await result;
    }

    return {
      pass: (result.score ?? 0) >= threshold,
      message: () => formatScores([{ ...result, name: scoreFn.name }]),
    };
  },

  toSatisfyJudge: async function toSatisfyJudge(
    received: unknown,
    judge: ScoreFn<any>,
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
 * Creates a test suite for evaluating language model outputs.
 *
 * @param name - The name of the test suite
 * @param options - Configuration options
 * @param options.data - Async function that returns an array of test cases with input and any additional fields
 * @param options.task - Function that processes the input and returns the model output
 *                       Can return either a string or TaskResult object with result and optional toolCalls
 * @param options.skipIf - Optional function that determines if tests should be skipped
 * @param options.scorers - Array of scoring functions that evaluate model outputs
 * @param options.threshold - Minimum acceptable average score (0-1), defaults to 1.0
 * @param options.timeout - Test timeout in milliseconds, defaults to 60000 (60s)
 *
 * @example
 * ```javascript
 * // Recommended: TaskResult format with tool tracking
 * describeEval("capital cities test", {
 *   data: async () => [{
 *     input: "What is the capital of France?",
 *     expected: "Paris"
 *   }],
 *   task: async (input) => {
 *     const response = await queryLLM(input);
 *     return {
 *       result: response.text,
 *       toolCalls: response.toolCalls || []
 *     };
 *   },
 *   scorers: [checkFactuality],
 *   threshold: 0.8
 * });
 *
 * // Example with tool usage evaluation
 * describeEval("tool usage test", {
 *   data: async () => [{
 *     input: "Search for weather in Seattle",
 *     expectedTools: [{ name: "weather_api", arguments: { location: "Seattle" } }]
 *   }],
 *   task: async (input) => {
 *     return {
 *       result: "The weather in Seattle is 65°F",
 *       toolCalls: [{
 *         name: "weather_api",
 *         arguments: { location: "Seattle" },
 *         result: { temp: 65, condition: "partly cloudy" }
 *       }]
 *     };
 *   },
 *   scorers: [ToolCallScorer()],
 *   threshold: 1.0
 * });
 * ```
 */
export function describeEval<TCase extends HarnessCase>(
  name: string,
  options: HarnessDescribeEvalOptions<TCase>,
): void;
export function describeEval(
  name: string,
  options: LegacyDescribeEvalOptions,
): void;
export function describeEval(
  name: string,
  options: HarnessDescribeEvalOptions<any> | LegacyDescribeEvalOptions,
) {
  return describe(name, async () => {
    if (options.beforeEach) {
      vitestBeforeEach(options.beforeEach);
    }
    if (options.afterEach) {
      vitestAfterEach(options.afterEach);
    }

    if (isHarnessDescribeEvalOptions(options)) {
      const testFn = options.skipIf ? test.skipIf(options.skipIf()) : test;
      for (const caseData of await options.data()) {
        const { input, name: testName } = caseData;
        testFn(
          testName ?? formatHarnessTestName(input),
          {
            timeout: options.timeout ?? 60000,
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

            let run: HarnessRun;
            try {
              run = await options.harness.run(input, context);
            } catch (error) {
              const partialRun = getHarnessRunFromError(error);
              if (partialRun) {
                if (
                  Object.keys(artifacts).length > 0 &&
                  !partialRun.artifacts
                ) {
                  partialRun.artifacts = artifacts;
                }

                testTask.meta.harness = {
                  name: options.harness.name,
                  run: partialRun,
                };
              }

              throw error;
            }

            if (Object.keys(artifacts).length > 0 && !run.artifacts) {
              run.artifacts = artifacts;
            }

            testTask.meta.harness = {
              name: options.harness.name,
              run,
            };

            if (options.judges && options.judges.length > 0) {
              const output = formatJudgeOutput(run);
              const toolCallRecords = toolCalls(run.session) as ToolCall[];
              const scores = await Promise.all(
                options.judges.map((judge) => {
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

                  return new Promise<Score>((resolve) => resolve(result));
                }),
              );
              const scoresWithName = scores.map((score, index) => ({
                ...score,
                name: options.judges![index].name,
              }));
              const avgScore =
                scores.reduce((acc, score) => acc + (score.score ?? 0), 0) /
                scores.length;
              const threshold =
                options.threshold === undefined ? 1.0 : options.threshold;
              const thresholdFailed =
                threshold !== null && avgScore < threshold;

              testTask.meta.eval = {
                scores: scoresWithName,
                avgScore,
                output,
                toolCalls: toolCallRecords,
                thresholdFailed,
              };

              if (thresholdFailed) {
                assert(
                  avgScore >= threshold,
                  [
                    `Score: ${avgScore.toFixed(2)} below threshold: ${threshold.toFixed(2)}`,
                    `Output: ${wrapText(output)}`,
                    formatScores(scoresWithName),
                  ].join("\n\n"),
                );
              }
            }

            await options.test?.({
              input,
              caseData,
              run,
              session: run.session,
            });
          },
        );
      }
      return;
    }

    const testFn = options.skipIf ? test.skipIf(options.skipIf()) : test;
    // TODO: should data just be a generator?
    for (const { input, name: testName, ...params } of await options.data()) {
      testFn(
        testName ?? input,
        {
          timeout: options.timeout ?? 60000,
        },
        async ({ task: testTask }) => {
          const taskOutput = await options.task(input);
          const output =
            typeof taskOutput === "string" ? taskOutput : taskOutput.result;
          const toolCalls =
            typeof taskOutput === "object" ? taskOutput.toolCalls : undefined;
          const threshold =
            options.threshold === undefined ? 1.0 : options.threshold;

          const scores = await Promise.all(
            options.scorers.map((scorer) => {
              const result = scorer({ input, ...params, output, toolCalls });
              if (result instanceof Promise) {
                return result;
              }
              return new Promise<Score>((resolve) => resolve(result));
            }),
          );
          const scoresWithName = scores.map((s, i) => ({
            ...s,
            name: options.scorers[i].name,
          }));

          const avgScore =
            scores.reduce((acc, s) => acc + (s.score ?? 0), 0) / scores.length;
          const thresholdFailed = threshold !== null && avgScore < threshold;

          testTask.meta.eval = {
            scores: scoresWithName,
            avgScore,
            output,
            ...(toolCalls && { toolCalls }),
            thresholdFailed,
          };

          if (thresholdFailed) {
            assert(
              avgScore >= threshold,
              [
                `Score: ${avgScore.toFixed(2)} below threshold: ${threshold.toFixed(2)}`,
                `Output: ${wrapText(output)}`,
                formatScores(scoresWithName),
              ].join("\n\n"),
            );
          }
        },
      );
    }
  });
}

function isHarnessDescribeEvalOptions(
  options: HarnessDescribeEvalOptions<any> | LegacyDescribeEvalOptions,
): options is HarnessDescribeEvalOptions<any> {
  return "harness" in options;
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
    toolCalls: options.toolCalls ?? (toolCalls(run.session) as ToolCall[]),
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

export function formatScores(scores: (Score & { name: string })[]) {
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
  type HarnessCase,
  type HarnessContext,
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

// Export built-in scorers
export {
  ToolCallScorer,
  type ToolCallScorerOptions,
  StructuredOutputScorer,
  type StructuredOutputScorerOptions,
} from "./scorers";
