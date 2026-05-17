export type VitestJsonStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "pending"
  | "todo"
  | "disabled";

export type VitestJsonLocation = {
  line: number;
  column: number;
};

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

export type VitestJsonFile = {
  message: string;
  name: string;
  status: "failed" | "passed";
  startTime: number;
  endTime: number;
  assertionResults: VitestJsonAssertion[];
};

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

export type EvalScore = {
  name?: string;
  score?: number | null;
  metadata?: {
    rationale?: unknown;
    output?: unknown;
    [key: string]: unknown;
  };
};

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

export type EvalFailure = {
  judgeName?: string;
  score?: number;
  reason?: string;
};

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

export type UsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  toolCalls?: number;
};

export type ToolCallSummary = {
  name: string;
  error?: string;
  durationMs?: number;
};

export type CollectOptions = {
  workspace?: string;
};
