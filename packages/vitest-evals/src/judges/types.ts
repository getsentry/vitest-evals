import type { HarnessMetadata, HarnessRun, ToolCallRecord } from "../harness";

/** Score payload returned by a judge. */
export type JudgeResult = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: unknown;
  } & Record<string, unknown>;
};

/**
 * Common string views passed to every judge.
 *
 * Use `JudgeContext` when you need structured access to the normalized run or
 * the original input value.
 */
export interface BaseJudgeOptions {
  /** Canonical text input passed to judges for plain prompt evaluation. */
  input: string;
  /** Canonical text response passed to judges for plain output evaluation. */
  output: string;
  toolCalls?: ToolCallRecord[];
}

/**
 * Full normalized context passed to harness-backed judges.
 *
 * Per-run judge parameters should generally live under `metadata`.
 */
export interface JudgeContext<
  TInput = unknown,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> extends BaseJudgeOptions {
  /** Original non-string input value when the judge needs more than `input`. */
  inputValue: TInput;
  metadata: Readonly<TMetadata>;
  run: HarnessRun;
  session: HarnessRun["session"];
}

/** Judge function over either string views alone or a richer normalized context. */
export type JudgeFn<TOptions extends BaseJudgeOptions = BaseJudgeOptions> = (
  opts: TOptions,
) => Promise<JudgeResult> | JudgeResult;
