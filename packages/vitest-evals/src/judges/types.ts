import type {
  Harness,
  HarnessRun,
  JsonValue,
  ToolCallRecord,
} from "../harness";
import type { JudgeHarness, RunJudge } from "./judgeHarness";

/**
 * Score payload returned by a judge.
 *
 * @example
 * ```ts
 * const result: JudgeResult = {
 *   score: 1,
 *   metadata: {
 *     rationale: "Output matched the expected refund status.",
 *   },
 * };
 * ```
 */
export type JudgeResult = {
  /** Numeric score. `null` records an intentionally unscored result. */
  score: number | null;
  /** JSON-like judge metadata shown by assertions and reporters. */
  metadata?: {
    /** Human-readable explanation for the score. */
    rationale?: string;
    /** Optional judge-side output or diagnostic payload. */
    output?: JsonValue;
  } & Record<string, JsonValue | undefined>;
};

/**
 * Full normalized context passed to every judge.
 *
 * @example
 * ```ts
 * type RefundOutput = { status: "approved" | "denied" };
 *
 * const RefundStatusJudge = createJudge<string, RefundOutput>(
 *   "RefundStatusJudge",
 *   ({ output }) => ({
 *     score: output.status === "approved" ? 1 : 0,
 *   }),
 * );
 * ```
 */
export interface JudgeContext<
  TInput = any,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  THarness extends Harness<TInput, TOutput> | undefined =
    | Harness<TInput, TOutput>
    | undefined,
> {
  /** Original eval input passed to the harness. */
  input: TInput;
  /** App-facing output returned by the harness. */
  output: TOutput;
  /** Flattened tool calls observed in the normalized session. */
  toolCalls: ToolCallRecord[];
  /** Complete normalized harness run being judged. */
  run: HarnessRun<TOutput>;
  /** Normalized transcript associated with the harness run. */
  session: HarnessRun<TOutput>["session"];
  /** Harness associated with this judge context. */
  harness: THarness;
  /** Runs the configured matcher, judge, or suite judge harness with run-scoped context. */
  runJudge?: RunJudge;
}

/** Convenience helper for judges that accept explicit per-call params. */
export type JudgeOptions<
  TInput = any,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TParams extends object = Record<never, never>,
  THarness extends Harness<TInput, TOutput> | undefined =
    | Harness<TInput, TOutput>
    | undefined,
> = JudgeContext<TInput, TOutput, THarness> & TParams;

/** Function that assesses a normalized judge context. */
export type JudgeAssessFn<
  TOptions extends JudgeContext<any, any, any> = JudgeContext,
> = (opts: TOptions) => Promise<JudgeResult> | JudgeResult;

/**
 * Runtime options supplied by core when calling a legacy judge-side assessor.
 *
 * @deprecated Prefer `RunJudgeOptions` with `ctx.runJudge(...)`.
 */
export type JudgeAssessorOptions = {
  /** Abort signal from the current eval run when available. */
  signal?: AbortSignal;
};

/**
 * Legacy provider/model helper that a judge can use without running the app
 * harness.
 *
 * New LLM-backed judges should use `createJudgeHarness(...)` plus
 * `ctx.runJudge(...)` instead. The judge harness path supports response
 * formats, matcher/suite/judge-level configuration, and keeps provider
 * adapters outside core judge implementations.
 *
 * @deprecated Prefer `createJudgeHarness(...)` and `ctx.runJudge(...)` for
 * LLM-backed judges.
 *
 * @example
 * ```ts
 * const assessor: JudgeAssessor<string, { passed: boolean; rationale: string }> = {
 *   assess: async (prompt, { signal }) => runRubricModel(prompt, { signal }),
 * };
 * ```
 */
export type JudgeAssessor<TInput = string, TOutput = string> = {
  /** Runs the judge-side model/provider call. */
  assess: (
    input: TInput,
    options: JudgeAssessorOptions,
  ) => Promise<TOutput> | TOutput;
};

/**
 * Legacy judge-side assessor after core binds run-scoped options such as abort
 * signal.
 *
 * @deprecated Prefer `RunJudge` from `ctx.runJudge(...)` for LLM-backed judges.
 */
export type BoundJudgeAssessor<TInput = string, TOutput = string> = {
  /** Runs the judge-side model/provider call with run-scoped options already bound. */
  assess: (input: TInput) => Promise<TOutput>;
};

/**
 * Legacy function that assesses a context with a prebound judge-side assessor.
 *
 * @deprecated Prefer `JudgeAssessFn` with `ctx.runJudge(...)`.
 */
export type JudgeAssessWithAssessorFn<
  TOptions extends JudgeContext<any, any, any> = JudgeContext,
  TInput = string,
  TOutput = string,
> = (
  opts: TOptions,
  assessor: BoundJudgeAssessor<TInput, TOutput>,
) => Promise<JudgeResult> | JudgeResult;

/**
 * Named judge object consumed by suite-level judges and explicit assertions.
 *
 * @example
 * ```ts
 * type RefundOutput = { status: "approved" | "denied" };
 *
 * const judge: Judge<JudgeContext<string, RefundOutput>> = {
 *   name: "RefundStatusJudge",
 *   assess: ({ output }) => ({
 *     score: output.status === "approved" ? 1 : 0,
 *   }),
 * };
 * ```
 */
export interface Judge<
  TOptions extends JudgeContext<any, any, any> = JudgeContext,
> {
  /** Stable judge name used in assertion messages and reports. */
  name: string;
  /** Default judge-side harness used when matcher options do not provide one. */
  judgeHarness?: JudgeHarness;
  /** Scores one normalized judge context. */
  assess: JudgeAssessFn<TOptions>;
}
