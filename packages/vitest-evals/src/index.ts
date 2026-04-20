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

export interface HarnessEvalContext<TCase extends HarnessCase = HarnessCase> {
  input: TCase["input"];
  caseData: TCase;
  run: HarnessRun;
  session: HarnessRun["session"];
}

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
> {
  data: () => Promise<TCase[]>;
  harness: Harness<TCase["input"], TCase>;
  judges?: Array<JudgeFn<HarnessJudgeOptions<TCase>>>;
  threshold?: number | null;
  test?: (context: HarnessEvalContext<TCase>) => Promise<void> | void;
  skipIf?: () => boolean;
  timeout?: number;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

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
 * @param options.data - Async function that returns an array of test cases with input and any additional fields
 * @param options.harness - Harness adapter that runs the system under test and returns normalized artifacts
 * @param options.judges - Optional automatic judges that run against the normalized run/session data
 * @param options.timeout - Test timeout in milliseconds, defaults to 60000 (60s)
 *
 * @example
 * ```javascript
 * describeEval("refund agent", {
 *   data: async () => [{ input: "Refund invoice inv_123" }],
 *   harness: piAiHarness({
 *     createAgent: () => createRefundAgent(),
 *     tools: refundTools,
 *   }),
 *   judges: [ToolCallJudge()],
 *   test: async ({ run, session }) => {
 *     expect(run.output).toMatchObject({ status: "approved" });
 *     expect(toolCalls(session)).toHaveLength(2);
 *   },
 * });
 * ```
 */
export function describeEval<TCase extends HarnessCase>(
  name: string,
  options: HarnessDescribeEvalOptions<TCase>,
): void;
export function describeEval<TCase extends HarnessCase>(
  name: string,
  options: HarnessDescribeEvalOptions<TCase>,
) {
  return describe(name, async () => {
    if (options.beforeEach) {
      vitestBeforeEach(options.beforeEach);
    }
    if (options.afterEach) {
      vitestAfterEach(options.afterEach);
    }

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
              if (Object.keys(artifacts).length > 0 && !partialRun.artifacts) {
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
            const toolCallRecords = toolCalls(run.session);
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

                return new Promise<JudgeResult>((resolve) => resolve(result));
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
            const thresholdFailed = threshold !== null && avgScore < threshold;

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
  });
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

export {
  StructuredOutputJudge,
  type StructuredOutputJudgeConfig,
  type StructuredOutputJudgeOptions,
  ToolCallJudge,
  type ToolCallJudgeConfig,
  type ToolCallJudgeOptions,
} from "./judges";
export type { BaseJudgeOptions, JudgeFn, JudgeResult } from "./judges/types";
