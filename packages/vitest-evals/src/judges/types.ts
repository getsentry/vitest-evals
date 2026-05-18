import type {
  Harness,
  HarnessMetadata,
  HarnessRun,
  JsonValue,
  ToolCallRecord,
} from "../harness";

/** Score payload returned by a judge. */
export type JudgeResult = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: unknown;
  } & Record<string, unknown>;
};

/**
 * Full normalized context passed to every judge.
 *
 * Scenario-owned judge criteria should live on `input`. Use `metadata` for
 * per-run expectations or harness configuration that are not part of the
 * scenario payload.
 */
export interface JudgeContext<
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TMetadata, TOutput> | undefined =
    | Harness<TInput, TMetadata, TOutput>
    | undefined,
> {
  /** Original eval input passed to the harness. */
  input: TInput;
  /** App-facing output returned by the harness. */
  output: TOutput | undefined;
  toolCalls: ToolCallRecord[];
  metadata: Readonly<TMetadata>;
  run: HarnessRun<TOutput>;
  session: HarnessRun<TOutput>["session"];
  /** Harness associated with this judge context. */
  harness: THarness;
}

/** Convenience helper for judges that accept explicit per-call params. */
export type JudgeOptions<
  TParams extends Record<string, unknown> = Record<string, never>,
  TInput = unknown,
  TOutput extends JsonValue | undefined = JsonValue | undefined,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TMetadata, TOutput> | undefined =
    | Harness<TInput, TMetadata, TOutput>
    | undefined,
> = JudgeContext<TInput, TOutput, TMetadata, THarness> & TParams;

/** Function that assesses a normalized judge context. */
export type JudgeAssessFn<
  TOptions extends JudgeContext<any, any, any, any> = JudgeContext,
> = (opts: TOptions) => Promise<JudgeResult> | JudgeResult;

/** Runtime options supplied by core when calling a judge-side harness. */
export type JudgeHarnessOptions = {
  signal?: AbortSignal;
};

/** Provider/model helper that a judge can use without running the app harness. */
export type JudgeHarness<TInput = string, TOutput = string> = {
  assess: (
    input: TInput,
    options: JudgeHarnessOptions,
  ) => Promise<TOutput> | TOutput;
};

/** Judge-side harness after core binds run-scoped options such as abort signal. */
export type BoundJudgeHarness<TInput = string, TOutput = string> = {
  assess: (input: TInput) => Promise<TOutput>;
};

/** Function that assesses a context with a prebound judge-side harness. */
export type JudgeAssessWithHarnessFn<
  TOptions extends JudgeContext<any, any, any, any> = JudgeContext,
  TInput = string,
  TOutput = string,
> = (
  opts: TOptions,
  judge: BoundJudgeHarness<TInput, TOutput>,
) => Promise<JudgeResult> | JudgeResult;

/** Named judge object consumed by suite-level judges and explicit assertions. */
export interface Judge<
  TOptions extends JudgeContext<any, any, any, any> = JudgeContext,
> {
  name: string;
  assess: JudgeAssessFn<TOptions>;
}
