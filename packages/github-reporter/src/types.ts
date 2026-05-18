/** Status values emitted by Vitest JSON reports. */
export type VitestJsonStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "pending"
  | "todo"
  | "disabled";

/** Source location attached to a Vitest assertion. */
export type VitestJsonLocation = {
  line: number;
  column: number;
};

/** Assertion record read from Vitest's JSON reporter output. */
export type VitestJsonAssertion = {
  ancestorTitles: string[];
  fullName: string;
  status: VitestJsonStatus;
  title: string;
  meta?: unknown;
  duration?: number | null;
  failureMessages?: string[] | null;
  location?: VitestJsonLocation | null;
  tags?: string[];
};

/** Test-file record read from Vitest's JSON reporter output. */
export type VitestJsonFile = {
  message: string;
  name: string;
  status: "failed" | "passed";
  startTime: number;
  endTime: number;
  assertionResults: VitestJsonAssertion[];
};

/** Top-level Vitest JSON reporter payload. */
export type VitestJsonReport = {
  numFailedTests: number;
  numPassedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  numTotalTests: number;
  startTime: number;
  success: boolean;
  testResults: VitestJsonFile[];
};

/** Score record stored by `vitest-evals` on Vitest task metadata. */
export type EvalScore = {
  name?: string;
  score?: number | null;
  metadata?: {
    rationale?: unknown;
    output?: unknown;
    [key: string]: unknown;
  };
};

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
  eval?: {
    avgScore?: number;
    thresholdFailed?: boolean;
    output?: unknown;
    scores: EvalScore[];
  };
  harness?: {
    name?: string;
    output?: unknown;
    usage?: UsageSummary;
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

/** Aggregated usage values shown in reporter output. */
export type UsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
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
