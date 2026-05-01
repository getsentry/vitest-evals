/**
 * Temporary scorer-first compatibility types.
 *
 * Keep these local to `vitest-evals/legacy` so the legacy entrypoint can be
 * deleted without preserving any dependency on the harness-first modules.
 */

export type ToolCall = {
  name: string;
  arguments?: Record<string, any>;
  [key: string]: any;
};

export type TaskResult = {
  result: string;
  toolCalls?: ToolCall[];
};

export type TaskFn = (input: string) => Promise<string | TaskResult>;

export type Score = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: unknown;
  } & Record<string, unknown>;
};

export interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCall[];
}

export type ScoreFn<TOptions extends BaseScorerOptions = BaseScorerOptions> = (
  opts: TOptions,
) => Promise<Score> | Score;
