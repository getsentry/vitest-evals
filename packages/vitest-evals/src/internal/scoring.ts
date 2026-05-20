import type { JsonValue, ToolCallRecord } from "../harness";

export type ToolCallLike = ToolCallRecord;

export type ScoreMetadata = {
  rationale?: string;
  output?: JsonValue;
} & Record<string, JsonValue | undefined>;

export type ScoredResult = {
  score: number | null;
  metadata?: ScoreMetadata;
};

export interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCallLike[];
}
