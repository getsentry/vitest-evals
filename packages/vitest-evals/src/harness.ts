export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ToolCallRecord = {
  id?: string;
  name: string;
  arguments?: Record<string, JsonValue>;
  result?: JsonValue;
  error?: {
    message: string;
    type?: string;
    [key: string]: JsonValue | undefined;
  };
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  metadata?: Record<string, JsonValue>;
};

export type NormalizedMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: JsonValue;
  toolCalls?: ToolCallRecord[];
  metadata?: Record<string, JsonValue>;
};

export type UsageSummary = {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  toolCalls?: number;
  retries?: number;
  metadata?: Record<string, JsonValue>;
};

export type TimingSummary = {
  totalMs?: number;
  metadata?: Record<string, JsonValue>;
};

export type NormalizedSession = {
  messages: NormalizedMessage[];
  outputText?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, JsonValue>;
};

export type HarnessRun = {
  session: NormalizedSession;
  output?: JsonValue;
  usage: UsageSummary;
  timings?: TimingSummary;
  artifacts?: Record<string, JsonValue>;
  errors: Array<Record<string, JsonValue>>;
};

export type HarnessRunError = Error & {
  vitestEvalsRun: HarnessRun;
};

export type HarnessCase<TInput = unknown> = {
  input: TInput;
  name?: string;
} & Record<string, any>;

export type HarnessContext<TCase extends HarnessCase = HarnessCase> = {
  caseData: TCase;
  task: {
    meta: Record<string, any>;
  };
  signal?: AbortSignal;
  artifacts: Record<string, JsonValue>;
  setArtifact: (name: string, value: JsonValue) => void;
};

export type Harness<
  TInput = unknown,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = {
  name: string;
  run: (input: TInput, context: HarnessContext<TCase>) => Promise<HarnessRun>;
};

export function toolCalls(session: NormalizedSession): ToolCallRecord[] {
  return session.messages.flatMap((message) => message.toolCalls ?? []);
}

export function messagesByRole(
  session: NormalizedSession,
  role: NormalizedMessage["role"],
): NormalizedMessage[] {
  return session.messages.filter((message) => message.role === role);
}

export function systemMessages(session: NormalizedSession) {
  return messagesByRole(session, "system");
}

export function userMessages(session: NormalizedSession) {
  return messagesByRole(session, "user");
}

export function assistantMessages(session: NormalizedSession) {
  return messagesByRole(session, "assistant");
}

export function toolMessages(session: NormalizedSession) {
  return messagesByRole(session, "tool");
}

export function attachHarnessRunToError(
  error: unknown,
  run: HarnessRun,
): HarnessRunError {
  const baseError =
    error instanceof Error
      ? error
      : new Error(String(error ?? "Unknown error"));
  return Object.assign(baseError, {
    vitestEvalsRun: run,
  });
}

export function getHarnessRunFromError(error: unknown): HarnessRun | undefined {
  if (
    error &&
    typeof error === "object" &&
    "vitestEvalsRun" in error &&
    isHarnessRun((error as { vitestEvalsRun?: unknown }).vitestEvalsRun)
  ) {
    return (error as { vitestEvalsRun: HarnessRun }).vitestEvalsRun;
  }

  return undefined;
}

function isHarnessRun(value: unknown): value is HarnessRun {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "session" in value &&
    "usage" in value &&
    "errors" in value &&
    Array.isArray((value as HarnessRun).errors)
  );
}
