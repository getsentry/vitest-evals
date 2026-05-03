import type {
  Harness,
  HarnessMetadata,
  HarnessRun,
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
 * Per-run judge parameters should generally live under `metadata`.
 */
export interface JudgeContext<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TMetadata> | undefined =
    | Harness<TInput, TMetadata>
    | undefined,
> {
  /** Canonical text input passed to judges for plain prompt evaluation. */
  input: string;
  /** Canonical text response passed to judges for plain output evaluation. */
  output: string;
  /** Original non-string input value when the judge needs more than `input`. */
  inputValue: TInput;
  toolCalls: ToolCallRecord[];
  metadata: Readonly<TMetadata>;
  run: HarnessRun;
  session: HarnessRun["session"];
  /** Harness associated with this judge context. */
  harness: THarness;
}

/** Convenience helper for judges that accept explicit per-call params. */
export type JudgeOptions<
  TParams extends Record<string, unknown> = Record<string, never>,
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  THarness extends Harness<TInput, TMetadata> | undefined =
    | Harness<TInput, TMetadata>
    | undefined,
> = JudgeContext<TInput, TMetadata, THarness> & TParams;

/** Judge function over the normalized judge context. */
export type JudgeFn<
  TOptions extends JudgeContext<any, any, any> = JudgeContext,
> = (opts: TOptions) => Promise<JudgeResult> | JudgeResult;
