import type { ToolCallRecord } from "../harness";

export type ToolCallLike = ToolCallRecord;

export type ScoreMetadata = {
  rationale?: string;
  output?: unknown;
} & Record<string, unknown>;

export type ScoredResult = {
  score: number | null;
  metadata?: ScoreMetadata;
};

export interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCallLike[];
}
