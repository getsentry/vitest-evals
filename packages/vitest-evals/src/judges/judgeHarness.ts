import {
  createHarness,
  type Harness,
  type HarnessContext,
  type HarnessMetadata,
  type HarnessResultLike,
  type HarnessRun,
  isHarnessRun,
  latestAssistantMessageContent,
  type JsonValue,
  type MaybePromise,
  normalizeContent,
} from "../harness";

/**
 * Provider-neutral prompt request issued by an LLM-backed judge.
 *
 * @example
 * ```ts
 * const input: JudgeHarnessInput = {
 *   system: "Grade factual consistency.",
 *   prompt: "Compare the submitted answer with the reference answer.",
 *   responseFormat: {
 *     type: "json",
 *   },
 * };
 * ```
 */
export type JudgeHarnessInput = {
  /** Optional system prompt for the judge model. */
  system?: string;
  /** User prompt or instruction payload for the judge model. */
  prompt: string;
  /** Optional response-format hint for adapters that support structured output. */
  responseFormat?: {
    /** Requests a JSON-compatible response. */
    type: "json";
    /** Optional JSON Schema passed through to provider-specific adapters. */
    schema?: JsonValue;
  };
};

/** JSON-safe output returned by a judge harness. */
export type JudgeHarnessOutput = JsonValue | undefined;

/**
 * Harness used by LLM-backed judges to issue judge-side prompts.
 *
 * This is separate from the application harness under test.
 *
 * @example
 * ```ts
 * const judgeHarness: JudgeHarness = createJudgeHarness({
 *   name: "judge-model",
 *   run: async ({ prompt }, { signal }) => {
 *     return callJudgeModel({ prompt, signal });
 *   },
 * });
 * ```
 */
export type JudgeHarness = Harness<
  JudgeHarnessInput,
  JudgeHarnessOutput,
  HarnessMetadata
>;

/** Runtime options supplied when a judge calls `runJudge(...)`. */
export type RunJudgeOptions = {
  /** Optional metadata forwarded to the judge harness run. */
  metadata?: HarnessMetadata;
};

/**
 * Curried judge-harness runner available inside `JudgeContext`.
 *
 * @example
 * ```ts
 * const verdict = await ctx.runJudge?.({
 *   prompt: "Return a JSON verdict.",
 *   responseFormat: { type: "json" },
 * });
 * ```
 */
export type RunJudge = (
  input: JudgeHarnessInput,
  options?: RunJudgeOptions,
) => Promise<JudgeHarnessOutput>;

/** Runtime options passed to `createJudgeHarness(...)` callbacks. */
export type CreateJudgeHarnessRunOptions = {
  /** Abort signal from the current eval run when available. */
  signal?: AbortSignal;
  /** Metadata for this judge-harness run. */
  metadata: Readonly<HarnessMetadata>;
};

/**
 * Configuration for `createJudgeHarness(...)`.
 *
 * @example
 * ```ts
 * const judgeHarness = createJudgeHarness({
 *   name: "custom-judge",
 *   run: async ({ system, prompt }, { signal }) => {
 *     return callProvider({ system, prompt, signal });
 *   },
 * });
 * ```
 */
export type CreateJudgeHarnessOptions = {
  /** Stable harness name used in diagnostics. */
  name?: string;
  /**
   * Runs one provider-specific judge prompt.
   *
   * Return a JSON-safe value, a raw provider value to normalize, a lightweight
   * `{ output }` result, or a full normalized `HarnessRun`.
   */
  run: (
    input: JudgeHarnessInput,
    options: CreateJudgeHarnessRunOptions,
  ) => MaybePromise<unknown>;
};

/**
 * Creates a judge harness from a provider-specific prompt callback.
 *
 * @param options - Harness name plus the callback that issues the judge prompt.
 *
 * @example
 * ```ts
 * const judgeHarness = createJudgeHarness({
 *   run: async ({ prompt }) => callJudgeModel(prompt),
 * });
 * ```
 */
export function createJudgeHarness(
  options: CreateJudgeHarnessOptions,
): JudgeHarness {
  return createHarness({
    name: options.name ?? "judge-harness",
    run: async ({ input, signal, metadata }) => {
      return normalizeJudgeHarnessResult(
        await options.run(input, { signal, metadata }),
      );
    },
  });
}

/**
 * Runs a judge harness with eval-scoped context already supplied.
 *
 * @param judgeHarness - Judge-side harness configured on the matcher, judge, or suite.
 * @param input - Provider-neutral judge prompt request.
 * @param options - Run-scoped metadata and abort signal.
 */
export async function runJudgeHarness(
  judgeHarness: JudgeHarness,
  input: JudgeHarnessInput,
  options: RunJudgeOptions & { signal?: AbortSignal } = {},
): Promise<JudgeHarnessOutput> {
  const artifacts: HarnessContext["artifacts"] = {};
  const run = await judgeHarness.run(input, {
    metadata: options.metadata ?? {},
    signal: options.signal,
    artifacts,
    setArtifact: (name, value) => {
      artifacts[name] = value;
    },
  });

  return run.output !== undefined
    ? run.output
    : resolveJudgeHarnessAssistantOutput(run);
}

/** Binds a judge harness to the current eval run context. */
export function createRunJudge(
  judgeHarness: JudgeHarness | undefined,
  signal?: AbortSignal,
): RunJudge | undefined {
  if (!judgeHarness) {
    return undefined;
  }

  return (input, options) =>
    runJudgeHarness(judgeHarness, input, {
      metadata: options?.metadata,
      signal,
    });
}

function normalizeJudgeHarnessResult(
  result: Awaited<ReturnType<CreateJudgeHarnessOptions["run"]>>,
): HarnessResultLike<JudgeHarnessOutput> {
  if (isHarnessRun(result)) {
    return result as HarnessRun<JudgeHarnessOutput>;
  }

  if (hasOutputField(result)) {
    return {
      output: normalizeJudgeHarnessOutput(result.output),
    };
  }

  return {
    output: normalizeJudgeHarnessOutput(result),
  };
}

function hasOutputField(value: unknown): value is { output?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "output" in value
  );
}

function normalizeJudgeHarnessOutput(value: unknown): JudgeHarnessOutput {
  if (value === undefined) {
    return undefined;
  }

  return normalizeContent(value);
}

function resolveJudgeHarnessAssistantOutput(
  run: HarnessRun<JudgeHarnessOutput>,
): JudgeHarnessOutput {
  return latestAssistantMessageContent(run.session) ?? "";
}
