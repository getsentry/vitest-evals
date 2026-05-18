/**
 * Temporary scorer-first compatibility types.
 *
 * Keep these local to `vitest-evals/legacy` so the legacy entrypoint can be
 * deleted without preserving any dependency on the harness-first modules.
 */

/** Tool call shape used by legacy scorer-first APIs. */
export type ToolCall = {
  name: string;
  arguments?: Record<string, any>;
  [key: string]: any;
};

/** Legacy task result that can include assistant text and tool calls. */
export type TaskResult = {
  result: string;
  toolCalls?: ToolCall[];
};

/** Legacy task function invoked by scorer-first eval suites. */
export type TaskFn = (input: string) => Promise<string | TaskResult>;

/** Legacy score payload returned by scorer functions. */
export type Score = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: unknown;
  } & Record<string, unknown>;
};

/** Base input supplied to every legacy scorer function. */
export interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCall[];
}

/** Legacy scorer function signature. */
export type ScoreFn<TOptions extends BaseScorerOptions = BaseScorerOptions> = (
  opts: TOptions,
) => Promise<Score> | Score;
