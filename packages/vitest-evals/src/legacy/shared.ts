import type { JudgeFn, JudgeResult } from "../judges/types";

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

export type Score = JudgeResult;

export interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCall[];
}

export type ScoreFn<TOptions extends BaseScorerOptions = BaseScorerOptions> = (
  opts: TOptions,
) => Promise<Score> | Score;
