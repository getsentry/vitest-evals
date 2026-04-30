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

export type HarnessPromptOptions = {
  system?: string;
  metadata?: Record<string, JsonValue>;
};

export type HarnessPrompt = (
  input: string,
  options?: HarnessPromptOptions,
) => Promise<string>;

export type HarnessRuntime = {
  prompt: HarnessPrompt;
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
  TAgent = unknown,
> = {
  name: string;
  prompt?: HarnessPrompt;
  run: (input: TInput, context: HarnessContext<TCase>) => Promise<HarnessRun>;
  setup?: () => Promise<HarnessExecution<TInput, TCase, TAgent>>;
};

export type HarnessExecution<
  TInput = unknown,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TAgent = unknown,
> = {
  agent?: TAgent;
  run: (input: TInput, context: HarnessContext<TCase>) => Promise<HarnessRun>;
};

export function hasCallableMethod(value: unknown, methodName: string) {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    methodName in value &&
    typeof (value as Record<string, unknown>)[methodName] === "function"
  );
}

export function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = toJsonValue(item);
      return normalized === undefined ? null : normalized;
    });
  }

  if (typeof value === "object" && value !== null) {
    return normalizeRecord(value as Record<string, unknown>);
  }

  return undefined;
}

export function normalizeRecord(
  value: Record<string, unknown>,
): Record<string, JsonValue> {
  const entries = Object.entries(value).flatMap(([key, entryValue]) => {
    const normalized = toJsonValue(entryValue);
    return normalized === undefined ? [] : [[key, normalized] as const];
  });

  return Object.fromEntries(entries);
}

export function normalizeMetadata(
  value: Record<string, unknown>,
): Record<string, JsonValue> | undefined {
  const normalized = normalizeRecord(value);
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeContent(value: unknown): JsonValue {
  return toJsonValue(value) ?? String(value);
}

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

export function isHarnessRun(value: unknown): value is HarnessRun {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    session?: unknown;
    usage?: unknown;
    errors?: unknown;
  };

  return (
    isNormalizedSession(candidate.session) &&
    Boolean(candidate.usage) &&
    typeof candidate.usage === "object" &&
    !Array.isArray(candidate.usage) &&
    Array.isArray(candidate.errors)
  );
}

export function isNormalizedSession(
  value: unknown,
): value is NormalizedSession {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "messages" in value &&
    Array.isArray((value as { messages?: unknown }).messages)
  );
}

export function resolveHarnessRunErrors(
  result: unknown,
): Array<Record<string, JsonValue>> {
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as Record<string, unknown>).errors)
  ) {
    return (result as { errors: Array<Record<string, JsonValue>> }).errors;
  }

  return [];
}

export function serializeError(error: unknown): Record<string, JsonValue> {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
    };
  }

  return {
    type: "Error",
    message: String(error),
  };
}
