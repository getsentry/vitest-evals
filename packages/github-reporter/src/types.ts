import type {
  EvalScore,
  UsageSummary as HarnessUsageSummary,
  VitestJsonLocation,
  VitestJsonReport,
  VitestJsonStatus,
} from "@vitest-evals/core";

export type {
  EvalScore,
  VitestJsonLocation,
  VitestJsonReport,
  VitestJsonStatus,
} from "@vitest-evals/core";

/** Normalized eval case consumed by GitHub reporter renderers. */
export type EvalCase = {
  id: string;
  file: string;
  displayFile: string;
  title: string;
  displayName: string;
  status: VitestJsonStatus;
  durationMs?: number;
  location?: VitestJsonLocation;
  failureMessages: string[];
  toolCalls: ToolCallSummary[];
  eval?: {
    avgScore?: number;
    thresholdFailed?: boolean;
    output?: unknown;
    scores: EvalScore[];
  };
  harness?: {
    name?: string;
    output?: unknown;
    usage?: HarnessUsageSummary;
    timingMs?: number;
    toolCalls: ToolCallSummary[];
    errors: unknown[];
  };
  primaryFailure?: EvalFailure;
};

/** Primary failure summary extracted from an eval case. */
export type EvalFailure = {
  judgeName?: string;
  score?: number;
  reason?: string;
};

/** Collected eval report used by summaries, annotations, and check runs. */
export type EvalReport = {
  status: "passed" | "failed";
  startedAt?: number;
  durationMs?: number;
  totals: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    evalTotal: number;
    evalPassed: number;
    evalFailed: number;
  };
  score?: {
    average: number;
    minimum?: number;
  };
  usage: Required<UsageSummary>;
  cases: EvalCase[];
  failures: EvalCase[];
};

/** Aggregated stable usage values collected from eval metadata. */
export type UsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  toolCalls?: number;
};

/** Tool-call summary shown in reporter output. */
export type ToolCallSummary = {
  name: string;
  error?: string;
  durationMs?: number;
};

/** Options for collecting eval data from a Vitest JSON report. */
export type CollectOptions = {
  workspace?: string;
};
