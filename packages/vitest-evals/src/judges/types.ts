import type { ToolCallRecord } from "../harness";

export type JudgeResult = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: any;
  } & Record<string, any>;
};

export interface BaseJudgeOptions {
  input: string;
  output: string;
  toolCalls?: ToolCallRecord[];
}

export type JudgeFn<TOptions extends BaseJudgeOptions = BaseJudgeOptions> = (
  opts: TOptions,
) => Promise<JudgeResult> | JudgeResult;
