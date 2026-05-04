import type {
  Harness,
  HarnessContext,
  HarnessMetadata,
  HarnessPrompt,
  HarnessRun,
  JsonValue,
  NormalizedMessage,
  NormalizedSession,
  TimingSummary,
  ToolCallRecord,
  UsageSummary,
} from "vitest-evals/harness";
import {
  attachHarnessRunToError,
  hasCallableMethod,
  isHarnessRun,
  isNormalizedSession,
  normalizeContent,
  normalizeMetadata,
  normalizeRecord,
  resolveHarnessRunErrors,
  serializeError,
  toJsonValue,
} from "vitest-evals/harness";
import {
  executeWithReplay,
  getReplayMetadataFromError,
  normalizeReplayMetadata,
} from "vitest-evals/replay";
import type {
  ReplayMode,
  ToolRecording,
  ToolReplayConfig,
} from "vitest-evals/replay";

type MaybePromise<T> = T | Promise<T>;

export type OpenAiAgentsReplayMode = ReplayMode;

export interface OpenAiAgentsRuntimeContext<
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  metadata: Readonly<TMetadata>;
  artifacts: HarnessContext<TMetadata>["artifacts"];
  setArtifact: HarnessContext<TMetadata>["setArtifact"];
}

export type OpenAiAgentsRunOptions<TContext = unknown> = Record<
  string,
  unknown
> & {
  context?: TContext;
  signal?: AbortSignal;
  stream?: boolean;
};

export interface OpenAiAgentsRunner<TAgent, TInput, TContext, TResult> {
  run: (
    agent: TAgent,
    input: TInput,
    options?: OpenAiAgentsRunOptions<TContext>,
  ) => MaybePromise<TResult | HarnessRun>;
}

export interface OpenAiAgentsRuntime<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TContext = OpenAiAgentsRuntimeContext<TMetadata>,
> {
  context: TContext;
  runOptions: OpenAiAgentsRunOptions<TContext>;
  signal?: AbortSignal;
  tools: OpenAiAgentsTool<TInput, TMetadata>[];
}

export interface OpenAiAgentsHarnessRunArgs<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
> {
  agent: TAgent;
  input: TInput;
  context: HarnessContext<TMetadata>;
  runtime: OpenAiAgentsRuntime<TInput, TMetadata, TContext>;
  runner: TRunner | undefined;
  runOptions: OpenAiAgentsRunOptions<TContext>;
}

export interface OpenAiAgentsHarnessResultArgs<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
> extends OpenAiAgentsHarnessRunArgs<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  > {
  result: TResult;
  output: JsonValue | undefined;
}

export interface OpenAiAgentsToolContext<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  input: TInput;
  metadata: HarnessContext<TMetadata>["metadata"];
  signal?: AbortSignal;
  setArtifact: HarnessContext<TMetadata>["setArtifact"];
  runContext: unknown;
  details: unknown;
  tool: OpenAiAgentsTool<TInput, TMetadata>;
}

export type OpenAiAgentsToolRecording<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
> = ToolRecording<TArgs, TResult>;

export type OpenAiAgentsToolReplayConfig<
  TArgs extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = ToolReplayConfig<
  TArgs,
  TResult,
  OpenAiAgentsToolContext<TInput, TMetadata>
>;

export type OpenAiAgentsToolReplayPolicy<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> =
  | boolean
  | OpenAiAgentsToolReplayConfig<JsonValue, JsonValue, TInput, TMetadata>;

export type OpenAiAgentsToolReplayPolicies<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = Record<string, OpenAiAgentsToolReplayPolicy<TInput, TMetadata>>;

type OpenAiAgentsInvoke = (...args: unknown[]) => unknown;

export type OpenAiAgentsTool<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = Record<string, unknown> & {
  name?: string;
  toolName?: string;
  type?: string;
  invoke?: OpenAiAgentsInvoke;
};

export interface OpenAiAgentsHarnessNormalizeOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TRunner = unknown,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext<TMetadata>,
> {
  session?: (
    args: OpenAiAgentsHarnessResultArgs<
      TAgent,
      TInput,
      TMetadata,
      TRunner,
      TResult,
      TContext
    >,
  ) => MaybePromise<NormalizedSession>;
  output?: (
    args: Omit<
      OpenAiAgentsHarnessResultArgs<
        TAgent,
        TInput,
        TMetadata,
        TRunner,
        TResult,
        TContext
      >,
      "output"
    >,
  ) => MaybePromise<JsonValue | undefined>;
  outputText?: (
    args: OpenAiAgentsHarnessResultArgs<
      TAgent,
      TInput,
      TMetadata,
      TRunner,
      TResult,
      TContext
    >,
  ) => MaybePromise<string | undefined>;
  usage?: (
    args: OpenAiAgentsHarnessResultArgs<
      TAgent,
      TInput,
      TMetadata,
      TRunner,
      TResult,
      TContext
    >,
  ) => MaybePromise<UsageSummary>;
  timings?: (
    args: OpenAiAgentsHarnessResultArgs<
      TAgent,
      TInput,
      TMetadata,
      TRunner,
      TResult,
      TContext
    >,
  ) => MaybePromise<TimingSummary | undefined>;
  errors?: (
    args: OpenAiAgentsHarnessResultArgs<
      TAgent,
      TInput,
      TMetadata,
      TRunner,
      TResult,
      TContext
    >,
  ) => MaybePromise<Array<Record<string, JsonValue>>>;
}

export interface OpenAiAgentsHarnessOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext<TMetadata>,
    unknown
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext<TMetadata>,
> {
  agent?: TAgent;
  createAgent?: () => MaybePromise<TAgent>;
  runner?: TRunner;
  createRunner?: (
    args: Omit<
      OpenAiAgentsHarnessRunArgs<
        TAgent,
        TInput,
        TMetadata,
        TRunner,
        TResult,
        TContext
      >,
      "runner"
    >,
  ) => MaybePromise<TRunner>;
  run?: (
    args: OpenAiAgentsHarnessRunArgs<
      TAgent,
      TInput,
      TMetadata,
      TRunner,
      TResult,
      TContext
    >,
  ) => MaybePromise<TResult | HarnessRun>;
  runOptions?:
    | OpenAiAgentsRunOptions<TContext>
    | ((
        args: Omit<
          OpenAiAgentsHarnessRunArgs<
            TAgent,
            TInput,
            TMetadata,
            TRunner,
            TResult,
            TContext
          >,
          "runner" | "runtime" | "runOptions"
        >,
      ) => MaybePromise<OpenAiAgentsRunOptions<TContext> | undefined>);
  toolReplay?: OpenAiAgentsToolReplayPolicies<TInput, TMetadata>;
  normalize?: OpenAiAgentsHarnessNormalizeOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >;
  prompt: HarnessPrompt;
  name?: string;
}

type RuntimeToolCapture = {
  calls: ToolCallRecord[];
};

/** Adapts an `@openai/agents` Runner workflow into a normalized harness. */
export function openaiAgentsHarness<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TRunner = OpenAiAgentsRunner<
    TAgent,
    TInput,
    OpenAiAgentsRuntimeContext<TMetadata>,
    unknown
  >,
  TResult = unknown,
  TContext = OpenAiAgentsRuntimeContext<TMetadata>,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
): Harness<TInput, TMetadata> {
  validateOptions(options);

  return {
    name: options.name ?? "openai-agents",
    prompt: options.prompt,
    run: async (input, context) => {
      const agent = await resolveAgent(options);
      return executeOpenAiAgentsHarness(options, agent, input, context);
    },
  };
}

async function executeOpenAiAgentsHarness<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
  agent: TAgent,
  input: TInput,
  context: HarnessContext<TMetadata>,
): Promise<HarnessRun> {
  const startedAt = Date.now();
  const capture: RuntimeToolCapture = {
    calls: [],
  };

  return withInstrumentedAgentTools(
    agent,
    {
      input,
      context,
      capture,
      toolReplay: options.toolReplay,
    },
    async (instrumentedAgent, runtimeTools) => {
      const defaultRuntimeContext = {
        metadata: context.metadata,
        artifacts: context.artifacts,
        setArtifact: context.setArtifact,
      } satisfies OpenAiAgentsRuntimeContext<TMetadata>;
      const runOptions = await resolveRunOptions<
        TAgent,
        TInput,
        TMetadata,
        TRunner,
        TResult,
        TContext
      >(
        options,
        instrumentedAgent,
        input,
        context,
        defaultRuntimeContext as TContext,
      );
      const runtime = {
        context: runOptions.context as TContext,
        runOptions,
        signal: runOptions.signal,
        tools: runtimeTools,
      } satisfies OpenAiAgentsRuntime<TInput, TMetadata, TContext>;
      const runner = await resolveRunner(options, {
        agent: instrumentedAgent,
        input,
        context,
        runtime,
        runOptions,
      });

      try {
        const result = await runAgent(options, {
          agent: instrumentedAgent,
          input,
          context,
          runtime,
          runner,
          runOptions,
        });
        const settledResult = await settleRunResult(result);

        if (isHarnessRun(settledResult) && !hasResultOverrides(options)) {
          if (
            Object.keys(context.artifacts).length > 0 &&
            !settledResult.artifacts
          ) {
            settledResult.artifacts = context.artifacts;
          }
          return settledResult;
        }

        const normalizeResult = settledResult as TResult;
        const baseResultArgs = {
          agent: instrumentedAgent,
          input,
          context,
          runtime,
          runner,
          runOptions,
          result: normalizeResult,
        };
        const output = options.normalize?.output
          ? await options.normalize.output(baseResultArgs)
          : resolveOutput(normalizeResult);
        const resultArgs = {
          ...baseResultArgs,
          output,
        } satisfies OpenAiAgentsHarnessResultArgs<
          TAgent,
          TInput,
          TMetadata,
          TRunner,
          TResult,
          TContext
        >;
        const usage = options.normalize?.usage
          ? await options.normalize.usage(resultArgs)
          : resolveUsage(normalizeResult, capture.calls.length);
        const outputText = options.normalize?.outputText
          ? await options.normalize.outputText(resultArgs)
          : resolveOutputText(normalizeResult, output);
        const session = options.normalize?.session
          ? await options.normalize.session(resultArgs)
          : resolveSession(input, normalizeResult, output, outputText, usage, {
              runtimeToolCalls: capture.calls,
            });

        return {
          session,
          output,
          usage,
          timings: options.normalize?.timings
            ? await options.normalize.timings(resultArgs)
            : { totalMs: Date.now() - startedAt },
          artifacts:
            Object.keys(context.artifacts).length > 0
              ? context.artifacts
              : undefined,
          errors: options.normalize?.errors
            ? await options.normalize.errors(resultArgs)
            : resolveHarnessRunErrors(normalizeResult),
        };
      } catch (error) {
        const usage =
          capture.calls.length > 0 ? { toolCalls: capture.calls.length } : {};
        const run = {
          session: resolveSession(
            input,
            undefined,
            undefined,
            undefined,
            usage,
            {
              runtimeToolCalls: capture.calls,
            },
          ),
          output: undefined,
          usage,
          timings: { totalMs: Date.now() - startedAt },
          artifacts:
            Object.keys(context.artifacts).length > 0
              ? context.artifacts
              : undefined,
          errors: [serializeError(error)],
        } satisfies HarnessRun;

        throw attachHarnessRunToError(error, run);
      }
    },
  );
}

function validateOptions<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
) {
  const hasAgent = options.agent !== undefined;
  const hasCreateAgent = typeof options.createAgent === "function";

  if (hasAgent && hasCreateAgent) {
    throw new Error(
      "openaiAgentsHarness accepts either agent or createAgent(), not both.",
    );
  }

  if (!hasAgent && !hasCreateAgent) {
    throw new Error(
      "openaiAgentsHarness requires either an agent instance or createAgent().",
    );
  }

  if (options.runner && options.createRunner) {
    throw new Error(
      "openaiAgentsHarness accepts either runner or createRunner(), not both.",
    );
  }

  if (typeof options.agent === "function") {
    throw new Error(
      "openaiAgentsHarness agent must be an Agent instance. Use createAgent() for agent factories.",
    );
  }

  if (
    typeof options.runner === "function" &&
    !hasCallableMethod(options.runner, "run")
  ) {
    throw new Error(
      "openaiAgentsHarness runner must be a Runner instance. Use createRunner() for runner factories.",
    );
  }

  if (!options.run && !options.runner && !options.createRunner) {
    throw new Error(
      "openaiAgentsHarness requires runner/createRunner for Runner.run(agent, input, options), or run() for a custom entrypoint.",
    );
  }
}

async function resolveAgent<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
) {
  if (options.createAgent) {
    return options.createAgent();
  }

  if (options.agent !== undefined) {
    return options.agent;
  }

  throw new Error(
    "openaiAgentsHarness requires either an agent instance or createAgent().",
  );
}

async function resolveRunner<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
  args: Omit<
    OpenAiAgentsHarnessRunArgs<
      TAgent,
      TInput,
      TMetadata,
      TRunner,
      TResult,
      TContext
    >,
    "runner"
  >,
) {
  if (options.createRunner) {
    return options.createRunner(args);
  }

  if (options.runner !== undefined) {
    return options.runner;
  }

  return undefined;
}

async function resolveRunOptions<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
  agent: TAgent,
  input: TInput,
  context: HarnessContext<TMetadata>,
  defaultRuntimeContext: TContext,
): Promise<OpenAiAgentsRunOptions<TContext>> {
  const userOptions =
    typeof options.runOptions === "function"
      ? await options.runOptions({
          agent,
          input,
          context,
        })
      : options.runOptions;
  const baseOptions = userOptions ?? {};

  return {
    ...baseOptions,
    context:
      "context" in baseOptions
        ? (baseOptions.context as TContext)
        : defaultRuntimeContext,
    signal:
      "signal" in baseOptions
        ? (baseOptions.signal as AbortSignal | undefined)
        : context.signal,
    stream: "stream" in baseOptions ? Boolean(baseOptions.stream) : false,
  };
}

async function runAgent<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
  args: OpenAiAgentsHarnessRunArgs<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
): Promise<TResult | HarnessRun> {
  if (options.run) {
    return options.run(args);
  }

  if (hasRunnerRunMethod<TAgent, TInput, TContext, TResult>(args.runner)) {
    return args.runner.run(args.agent, args.input, args.runOptions);
  }

  throw new Error(
    "openaiAgentsHarness requires runner/createRunner for the default Runner.run path, or run() for a custom entrypoint.",
  );
}

function hasRunnerRunMethod<TAgent, TInput, TContext, TResult>(
  runner: unknown,
): runner is OpenAiAgentsRunner<TAgent, TInput, TContext, TResult> {
  return hasCallableMethod(runner, "run");
}

async function settleRunResult(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "completed" in result &&
    isPromiseLike((result as { completed?: unknown }).completed)
  ) {
    await (result as { completed: Promise<unknown> }).completed;
  }

  return result;
}

function hasResultOverrides<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TRunner,
  TResult,
  TContext,
>(
  options: OpenAiAgentsHarnessOptions<
    TAgent,
    TInput,
    TMetadata,
    TRunner,
    TResult,
    TContext
  >,
) {
  return Boolean(
    options.normalize?.output ??
      options.normalize?.outputText ??
      options.normalize?.session ??
      options.normalize?.usage ??
      options.normalize?.timings ??
      options.normalize?.errors,
  );
}

async function withInstrumentedAgentTools<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
>(
  agent: TAgent,
  args: {
    input: TInput;
    context: HarnessContext<TMetadata>;
    capture: RuntimeToolCapture;
    toolReplay: OpenAiAgentsToolReplayPolicies<TInput, TMetadata> | undefined;
  },
  callback: (
    agent: TAgent,
    runtimeTools: OpenAiAgentsTool<TInput, TMetadata>[],
  ) => Promise<TResult>,
) {
  const agentTools = getAgentTools<TInput, TMetadata>(agent) ?? [];
  validateToolReplayPolicies(agentTools, args.toolReplay);

  if (agentTools.length === 0) {
    return callback(agent, []);
  }

  const runtimeTools = agentTools.map((tool) => instrumentTool(tool, args));
  const instrumentedAgent = cloneAgentWithTools(agent, runtimeTools);
  return callback(instrumentedAgent, runtimeTools);
}

function getAgentTools<TInput, TMetadata extends HarnessMetadata>(
  agent: unknown,
): OpenAiAgentsTool<TInput, TMetadata>[] | undefined {
  const tools = getObjectProperty(agent, "tools");
  return Array.isArray(tools)
    ? (tools as OpenAiAgentsTool<TInput, TMetadata>[])
    : undefined;
}

function instrumentTool<TInput, TMetadata extends HarnessMetadata>(
  tool: OpenAiAgentsTool<TInput, TMetadata>,
  args: {
    input: TInput;
    context: HarnessContext<TMetadata>;
    capture: RuntimeToolCapture;
    toolReplay: OpenAiAgentsToolReplayPolicies<TInput, TMetadata> | undefined;
  },
): OpenAiAgentsTool<TInput, TMetadata> {
  const toolName = resolveToolName(tool);
  const replay = args.toolReplay?.[toolName];

  if (typeof tool.invoke !== "function") {
    if (replay) {
      throw new Error(
        `Tool replay requires invoke() for ${toolName}. Hosted or provider-executed OpenAI Agents tools cannot be recorded automatically.`,
      );
    }

    return tool;
  }

  const originalInvoke = tool.invoke;
  const instrumentedInvoke = (async (runContext, rawInput, details) =>
    executeInstrumentedTool({
      tool,
      toolName,
      replay,
      rawInput,
      runContext,
      details,
      input: args.input,
      context: args.context,
      capture: args.capture,
      execute: () => originalInvoke(runContext, rawInput, details),
    })) as OpenAiAgentsInvoke;

  return {
    ...tool,
    invoke: instrumentedInvoke,
  };
}

function validateToolReplayPolicies<TInput, TMetadata extends HarnessMetadata>(
  tools: OpenAiAgentsTool<TInput, TMetadata>[],
  toolReplay: OpenAiAgentsToolReplayPolicies<TInput, TMetadata> | undefined,
) {
  const replayToolNames = Object.entries(toolReplay ?? {})
    .filter(([, replay]) => Boolean(replay))
    .map(([toolName]) => toolName);
  if (replayToolNames.length === 0) {
    return;
  }

  const knownToolNames = new Set(tools.map(resolveToolName));
  const unknownToolNames = replayToolNames.filter(
    (toolName) => !knownToolNames.has(toolName),
  );
  if (unknownToolNames.length > 0) {
    throw new Error(
      `Tool replay configured for unknown OpenAI Agents tool(s): ${unknownToolNames.join(", ")}.`,
    );
  }
}

function cloneAgentWithTools<TAgent, TInput, TMetadata extends HarnessMetadata>(
  agent: TAgent,
  tools: OpenAiAgentsTool<TInput, TMetadata>[],
): TAgent {
  if (hasCallableMethod(agent, "clone")) {
    return (
      agent as {
        clone: (config: {
          tools: OpenAiAgentsTool<TInput, TMetadata>[];
        }) => TAgent;
      }
    ).clone({ tools });
  }

  if (!agent || typeof agent !== "object") {
    return agent;
  }

  return Object.assign({}, agent, { tools }) as TAgent;
}

async function executeInstrumentedTool<
  TInput,
  TMetadata extends HarnessMetadata,
>({
  tool,
  toolName,
  replay,
  rawInput,
  runContext,
  details,
  input,
  context,
  capture,
  execute,
}: {
  tool: OpenAiAgentsTool<TInput, TMetadata>;
  toolName: string;
  replay: OpenAiAgentsToolReplayPolicy<TInput, TMetadata> | undefined;
  rawInput: unknown;
  runContext: unknown;
  details: unknown;
  input: TInput;
  context: HarnessContext<TMetadata>;
  capture: RuntimeToolCapture;
  execute: () => MaybePromise<unknown>;
}) {
  const startedAt = new Date();
  const toolCallId = resolveToolCallId(runContext, rawInput, details);
  const normalizedArgs = normalizeArguments(rawInput);
  const replayContext = {
    input,
    metadata: context.metadata,
    signal: context.signal,
    setArtifact: context.setArtifact,
    runContext,
    details,
    tool,
  } satisfies OpenAiAgentsToolContext<TInput, TMetadata>;

  try {
    const execution = replay
      ? await executeWithReplay({
          toolName,
          args: normalizeReplayToolInput(rawInput),
          context: replayContext,
          execute: async () =>
            toReplayJsonValue(await execute(), `${toolName} tool output`),
          replay,
        })
      : {
          result: await execute(),
          replay: undefined,
        };
    const finishedAt = new Date();
    const normalizedResult = normalizeToolResult(execution.result);
    const call = {
      ...(toolCallId ? { id: toolCallId } : {}),
      name: toolName,
      ...(normalizedArgs !== undefined ? { arguments: normalizedArgs } : {}),
      ...(normalizedResult !== undefined ? { result: normalizedResult } : {}),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      metadata: normalizeReplayMetadata(execution.replay),
    } satisfies ToolCallRecord;

    capture.calls.push(call);
    return execution.result;
  } catch (error) {
    const finishedAt = new Date();
    const replay = getReplayMetadataFromError(error);
    const call = {
      ...(toolCallId ? { id: toolCallId } : {}),
      name: toolName,
      ...(normalizedArgs !== undefined ? { arguments: normalizedArgs } : {}),
      error: normalizeError(error),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      metadata: normalizeReplayMetadata(replay),
    } satisfies ToolCallRecord;

    capture.calls.push(call);
    throw error;
  }
}

function resolveToolName(tool: unknown) {
  return (
    stringProperty(tool, "name") ??
    stringProperty(tool, "toolName") ??
    stringProperty(getObjectProperty(tool, "function"), "name") ??
    "unknown"
  );
}

function resolveToolCallId(
  runContext: unknown,
  rawInput: unknown,
  details: unknown,
) {
  return (
    findStringAtPath(details, ["toolCallId"]) ??
    findStringAtPath(details, ["tool_call_id"]) ??
    findStringAtPath(details, ["callId"]) ??
    findStringAtPath(details, ["call_id"]) ??
    findStringAtPath(details, ["toolCall", "callId"]) ??
    findStringAtPath(details, ["toolCall", "call_id"]) ??
    findStringAtPath(details, ["rawItem", "callId"]) ??
    findStringAtPath(details, ["rawItem", "call_id"]) ??
    findStringAtPath(runContext, ["toolCallId"]) ??
    findStringAtPath(runContext, ["tool_call_id"]) ??
    findStringAtPath(runContext, ["toolCall", "callId"]) ??
    findStringAtPath(rawInput, ["toolCallId"]) ??
    findStringAtPath(rawInput, ["tool_call_id"])
  );
}

function resolveOutput(result: unknown): JsonValue | undefined {
  if (!result || typeof result !== "object") {
    return toJsonValue(result);
  }

  const candidates = [
    "finalOutput",
    "final_output",
    "object",
    "result",
    "decision",
    "text",
  ] satisfies string[];

  for (const key of candidates) {
    const normalized = toJsonValue((result as Record<string, unknown>)[key]);
    if (normalized !== undefined) {
      return normalized;
    }
  }

  const output = (result as { output?: unknown }).output;
  if (typeof output === "string") {
    return output;
  }

  return undefined;
}

function resolveOutputText(
  result: unknown,
  output: JsonValue | undefined,
): string | undefined {
  if (!result || typeof result !== "object") {
    return typeof output === "string" ? output : stringifyJson(output);
  }

  const directText =
    stringProperty(result, "finalOutput") ??
    stringProperty(result, "final_output") ??
    stringProperty(result, "text");
  if (directText !== undefined) {
    return directText;
  }

  const itemText = resolveAssistantTextFromItems(
    arrayProperty(result, "newItems") ?? arrayProperty(result, "output") ?? [],
  );
  if (itemText) {
    return itemText;
  }

  return typeof output === "string" ? output : stringifyJson(output);
}

function resolveUsage(result: unknown, runtimeToolCallCount: number) {
  const usage =
    getObjectProperty(getObjectProperty(result, "state"), "usage") ??
    getObjectProperty(getObjectProperty(result, "runContext"), "usage") ??
    getObjectProperty(result, "usage");
  const usageRecord =
    usage && typeof usage === "object"
      ? (usage as Record<string, unknown>)
      : undefined;
  const toolCallCount =
    countToolCallsFromResult(result) || runtimeToolCallCount || undefined;

  if (!usageRecord) {
    return toolCallCount ? { toolCalls: toolCallCount } : {};
  }

  return {
    provider: resolveProvider(result),
    model: resolveModel(result),
    inputTokens: numberProperty(usageRecord, "inputTokens"),
    outputTokens: numberProperty(usageRecord, "outputTokens"),
    reasoningTokens: numberProperty(usageRecord, "reasoningTokens"),
    totalTokens: numberProperty(usageRecord, "totalTokens"),
    toolCalls: toolCallCount,
    retries: numberProperty(usageRecord, "retries"),
    metadata: normalizeMetadata({
      requests: usageRecord.requests,
      requestUsageEntries: usageRecord.requestUsageEntries,
      raw: usageRecord.raw,
    }),
  } satisfies UsageSummary;
}

function resolveSession(
  input: unknown,
  result: unknown,
  output: JsonValue | undefined,
  outputText: string | undefined,
  usage: UsageSummary,
  options: {
    runtimeToolCalls: ToolCallRecord[];
  },
): NormalizedSession {
  if (
    isNormalizedSession(
      (result as Record<string, unknown> | undefined)?.session,
    )
  ) {
    return (result as { session: NormalizedSession }).session;
  }

  if (
    isNormalizedSession((result as Record<string, unknown> | undefined)?.trace)
  ) {
    return (result as { trace: NormalizedSession }).trace;
  }

  const newItems = arrayProperty(result, "newItems");
  const outputItems = arrayProperty(result, "output");
  const messages =
    newItems && newItems.length > 0
      ? normalizeInputMessages(getObjectProperty(result, "input") ?? input)
      : normalizeHistoryMessages(result, input);

  if (newItems && newItems.length > 0) {
    messages.push(...normalizeRunItems(newItems, options.runtimeToolCalls));
  } else if (outputItems && outputItems.length > 0) {
    messages.push(...normalizeRunItems(outputItems, options.runtimeToolCalls));
  }

  appendUnmatchedRuntimeToolCalls(messages, options.runtimeToolCalls);

  if (
    output !== undefined &&
    !messages.some(
      (message) =>
        message.role === "assistant" && message.content !== undefined,
    )
  ) {
    messages.push({
      role: "assistant",
      content: output,
    });
  }

  return {
    messages,
    outputText,
    provider: resolveProvider(result) ?? usage.provider,
    model: resolveModel(result) ?? usage.model,
    metadata: normalizeMetadata({
      lastResponseId: getObjectProperty(result, "lastResponseId"),
      interruptions: getObjectProperty(result, "interruptions"),
      rawResponses: getObjectProperty(result, "rawResponses"),
      inputGuardrailResults: getObjectProperty(result, "inputGuardrailResults"),
      outputGuardrailResults: getObjectProperty(
        result,
        "outputGuardrailResults",
      ),
      toolInputGuardrailResults: getObjectProperty(
        result,
        "toolInputGuardrailResults",
      ),
      toolOutputGuardrailResults: getObjectProperty(
        result,
        "toolOutputGuardrailResults",
      ),
      activeAgent: normalizeAgentMetadata(
        getObjectProperty(result, "activeAgent"),
      ),
      lastAgent: normalizeAgentMetadata(getObjectProperty(result, "lastAgent")),
    }),
  };
}

function normalizeHistoryMessages(
  result: unknown,
  fallbackInput: unknown,
): NormalizedMessage[] {
  const history = arrayProperty(result, "history");
  if (!history || history.length === 0) {
    return normalizeInputMessages(
      getObjectProperty(result, "input") ?? fallbackInput,
    );
  }

  const messages: NormalizedMessage[] = [];
  for (const item of history) {
    const normalized = normalizeModelMessage(item);
    if (normalized) {
      messages.push(normalized);
    }
  }

  return messages.length > 0
    ? messages
    : normalizeInputMessages(
        getObjectProperty(result, "input") ?? fallbackInput,
      );
}

function normalizeInputMessages(input: unknown): NormalizedMessage[] {
  if (Array.isArray(input)) {
    const messages = input
      .map((item) => normalizeModelMessage(item))
      .filter((message): message is NormalizedMessage => Boolean(message));

    return messages.length > 0
      ? messages
      : [
          {
            role: "user",
            content: normalizeContent(input),
          },
        ];
  }

  return [
    {
      role: "user",
      content: normalizeContent(input),
    },
  ];
}

function normalizeRunItems(
  items: unknown[],
  runtimeToolCalls: ToolCallRecord[],
): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];
  const outputItemsByCallId = new Map<string, unknown>();
  const runtimeCallsById = new Map(
    runtimeToolCalls
      .filter((call): call is ToolCallRecord & { id: string } =>
        Boolean(call.id),
      )
      .map((call) => [call.id, call]),
  );

  for (const item of items) {
    const rawItem = getRunItemRawItem(item);
    const callId = resolveRawToolCallId(rawItem);
    if (callId && isToolCallOutputItem(item, rawItem)) {
      outputItemsByCallId.set(callId, item);
    }
  }

  for (const item of items) {
    const rawItem = getRunItemRawItem(item);

    if (isAssistantMessageItem(item, rawItem)) {
      messages.push({
        role: "assistant",
        content: normalizeMessageContent(rawItem, item),
        metadata: normalizeRunItemMetadata(item, rawItem),
      });
      continue;
    }

    if (isToolCallItem(item, rawItem)) {
      const callId = resolveRawToolCallId(rawItem);
      const runtimeCall = callId ? runtimeCallsById.get(callId) : undefined;
      const call = normalizeToolCallItem(
        item,
        rawItem,
        outputItemsByCallId.get(callId ?? ""),
        runtimeCall,
      );
      messages.push({
        role: "assistant",
        toolCalls: [call],
        metadata: normalizeRunItemMetadata(item, rawItem),
      });
      continue;
    }

    if (isToolCallOutputItem(item, rawItem)) {
      messages.push(normalizeToolResultMessage(item, rawItem));
      continue;
    }

    const metadata = normalizeRunItemMetadata(item, rawItem);
    if (metadata) {
      messages.push({
        role: "assistant",
        metadata,
      });
    }
  }

  return messages;
}

function appendUnmatchedRuntimeToolCalls(
  messages: NormalizedMessage[],
  runtimeToolCalls: ToolCallRecord[],
) {
  const seenIds = new Set(
    messages.flatMap((message) =>
      (message.toolCalls ?? [])
        .map((call) => call.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const unmatched = runtimeToolCalls.filter(
    (call) => !call.id || !seenIds.has(call.id),
  );

  for (const call of unmatched) {
    messages.push({
      role: "assistant",
      toolCalls: [call],
    });

    if (call.result !== undefined || call.error) {
      messages.push({
        role: "tool",
        ...(call.result !== undefined
          ? { content: call.result }
          : call.error && call.error.message.length > 0
            ? { content: call.error.message }
            : {}),
        metadata: normalizeMetadata({
          name: call.name,
          toolCallId: call.id,
          isError: Boolean(call.error),
        }),
      });
    }
  }
}

function normalizeModelMessage(item: unknown): NormalizedMessage | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }

  const rawItem = getRunItemRawItem(item);
  const role = stringProperty(rawItem, "role");
  if (
    role !== "system" &&
    role !== "user" &&
    role !== "assistant" &&
    role !== "tool"
  ) {
    return undefined;
  }

  const content = normalizeMessageContent(rawItem, item);
  return {
    role,
    ...(content !== undefined ? { content } : {}),
    metadata: normalizeRunItemMetadata(item, rawItem),
  };
}

function normalizeToolCallItem(
  item: unknown,
  rawItem: unknown,
  outputItem: unknown,
  runtimeCall: ToolCallRecord | undefined,
): ToolCallRecord {
  const rawOutputItem = getRunItemRawItem(outputItem);
  const output =
    getObjectProperty(outputItem, "output") ??
    getObjectProperty(rawOutputItem, "output");
  const outputStatus = stringProperty(rawOutputItem, "status");
  const outputError =
    outputStatus === "failed" ? normalizeToolOutputError(output) : undefined;
  const normalizedResult =
    output !== undefined ? normalizeToolResult(output) : undefined;
  const call = {
    id: resolveRawToolCallId(rawItem),
    name: resolveRawToolName(rawItem),
    arguments: normalizeArguments(getObjectProperty(rawItem, "arguments")),
    ...(outputError
      ? { error: outputError }
      : normalizedResult !== undefined
        ? { result: normalizedResult }
        : {}),
    metadata: normalizeMetadata({
      status: getObjectProperty(rawItem, "status"),
      outputStatus,
      namespace: getObjectProperty(rawItem, "namespace"),
      providerData: getObjectProperty(rawItem, "providerData"),
      itemType: getObjectProperty(item, "type"),
      rawType: getObjectProperty(rawItem, "type"),
    }),
  } satisfies ToolCallRecord;

  return mergeToolCalls(call, runtimeCall);
}

function normalizeToolResultMessage(
  item: unknown,
  rawItem: unknown,
): NormalizedMessage {
  const output =
    getObjectProperty(item, "output") ?? getObjectProperty(rawItem, "output");
  const status = stringProperty(rawItem, "status");
  const isError = status === "failed";

  return {
    role: "tool",
    ...(output !== undefined ? { content: normalizeContent(output) } : {}),
    metadata: normalizeMetadata({
      name: resolveRawToolName(rawItem),
      toolCallId: resolveRawToolCallId(rawItem),
      isError,
      status,
      namespace: getObjectProperty(rawItem, "namespace"),
      providerData: getObjectProperty(rawItem, "providerData"),
      itemType: getObjectProperty(item, "type"),
      rawType: getObjectProperty(rawItem, "type"),
    }),
  };
}

function mergeToolCalls(
  call: ToolCallRecord,
  runtimeCall: ToolCallRecord | undefined,
): ToolCallRecord {
  if (!runtimeCall) {
    return call;
  }

  return {
    ...runtimeCall,
    ...call,
    id: call.id ?? runtimeCall.id,
    name: call.name ?? runtimeCall.name,
    arguments: call.arguments ?? runtimeCall.arguments,
    result: call.result ?? runtimeCall.result,
    error: call.error ?? runtimeCall.error,
    metadata: normalizeMetadata({
      ...(runtimeCall.metadata ?? {}),
      ...(call.metadata ?? {}),
    }),
  };
}

function normalizeMessageContent(
  rawItem: unknown,
  item: unknown,
): JsonValue | undefined {
  const contentAccessor = getObjectProperty(item, "content");
  if (typeof contentAccessor === "string" && contentAccessor.length > 0) {
    return contentAccessor;
  }

  const content = getObjectProperty(rawItem, "content");
  const text = extractText(content);
  if (text) {
    return text;
  }

  return content === undefined ? undefined : normalizeContent(content);
}

function resolveAssistantTextFromItems(items: unknown[]) {
  const texts: string[] = [];

  for (const item of items) {
    const rawItem = getRunItemRawItem(item);
    if (!isAssistantMessageItem(item, rawItem)) {
      continue;
    }

    const text = extractText(getObjectProperty(rawItem, "content"));
    if (text) {
      texts.push(text);
    }
  }

  return texts.join("\n\n");
}

function isAssistantMessageItem(item: unknown, rawItem: unknown) {
  return (
    getObjectProperty(item, "type") === "message_output_item" ||
    stringProperty(rawItem, "role") === "assistant"
  );
}

function isToolCallItem(item: unknown, rawItem: unknown) {
  const itemType = getObjectProperty(item, "type");
  const rawType = getObjectProperty(rawItem, "type");

  return (
    itemType === "tool_call_item" ||
    rawType === "function_call" ||
    rawType === "hosted_tool_call" ||
    rawType === "tool_search_call" ||
    rawType === "shell_call" ||
    rawType === "computer_call" ||
    rawType === "apply_patch_call"
  );
}

function isToolCallOutputItem(item: unknown, rawItem: unknown) {
  const itemType = getObjectProperty(item, "type");
  const rawType = getObjectProperty(rawItem, "type");

  return (
    itemType === "tool_call_output_item" ||
    rawType === "function_call_result" ||
    rawType === "tool_search_output" ||
    rawType === "shell_call_output" ||
    rawType === "computer_call_result" ||
    rawType === "apply_patch_call_output"
  );
}

function getRunItemRawItem(item: unknown) {
  return getObjectProperty(item, "rawItem") ?? item;
}

function normalizeRunItemMetadata(item: unknown, rawItem: unknown) {
  return normalizeMetadata({
    id: getObjectProperty(rawItem, "id"),
    status: getObjectProperty(rawItem, "status"),
    providerData: getObjectProperty(rawItem, "providerData"),
    agent: normalizeAgentMetadata(getObjectProperty(item, "agent")),
    itemType: getObjectProperty(item, "type"),
    rawType: getObjectProperty(rawItem, "type"),
  });
}

function resolveRawToolCallId(rawItem: unknown) {
  return (
    stringProperty(rawItem, "callId") ??
    stringProperty(rawItem, "call_id") ??
    stringProperty(rawItem, "id")
  );
}

function resolveRawToolName(rawItem: unknown) {
  const rawType = stringProperty(rawItem, "type");
  if (rawType === "tool_search_call" || rawType === "tool_search_output") {
    return "tool_search";
  }

  return (
    stringProperty(rawItem, "name") ??
    stringProperty(rawItem, "toolName") ??
    stringProperty(rawItem, "namespace") ??
    rawType ??
    "unknown"
  );
}

function countToolCallsFromResult(result: unknown): number {
  const items = [
    ...(arrayProperty(result, "newItems") ?? []),
    ...(arrayProperty(result, "output") ?? []),
  ];

  return items.reduce<number>((count, item) => {
    const rawItem = getRunItemRawItem(item);
    return isToolCallItem(item, rawItem) ? count + 1 : count;
  }, 0);
}

function normalizeArguments(
  value: unknown,
): Record<string, JsonValue> | undefined {
  const parsed = parseMaybeJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed === undefined
      ? undefined
      : { input: normalizeContent(parsed) };
  }

  return normalizeRecord(parsed as Record<string, unknown>);
}

function normalizeReplayToolInput(value: unknown): JsonValue {
  const parsed = parseMaybeJson(value);
  return toReplayJsonValue(parsed, "OpenAI Agents tool input");
}

function normalizeToolResult(value: unknown): JsonValue | undefined {
  const normalized = toJsonValue(value);
  if (normalized !== undefined) {
    return normalized;
  }

  return value === undefined ? undefined : String(value);
}

function normalizeToolOutputError(
  output: unknown,
): NonNullable<ToolCallRecord["error"]> {
  return {
    message: resolveToolOutputErrorMessage(output),
  };
}

function resolveToolOutputErrorMessage(output: unknown) {
  if (typeof output === "string") {
    return output.length > 0 ? output : "Tool call failed";
  }

  const message =
    stringProperty(output, "message") ??
    stringProperty(output, "error") ??
    stringProperty(output, "text") ??
    extractText(output);
  if (message && message.length > 0) {
    return message;
  }

  const normalized = toJsonValue(output);
  return normalized === undefined
    ? "Tool call failed"
    : JSON.stringify(normalized);
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeError(error: unknown): NonNullable<ToolCallRecord["error"]> {
  const serialized = serializeError(error);
  const { message, type, ...details } = serialized;

  return {
    ...details,
    message: typeof message === "string" ? message : String(message),
    ...(typeof type === "string" ? { type } : {}),
  };
}

function toReplayJsonValue(value: unknown, label: string): JsonValue {
  const normalized = toJsonValue(value);
  if (normalized === undefined) {
    throw new Error(
      `Tool replay only supports JSON-serializable values. ${label} could not be normalized.`,
    );
  }

  return normalized;
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const parts = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return undefined;
      }

      return (
        stringProperty(entry, "text") ??
        stringProperty(entry, "refusal") ??
        stringProperty(entry, "transcript")
      );
    })
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("") : undefined;
}

function resolveProvider(result: unknown) {
  return (
    stringProperty(result, "provider") ??
    stringProperty(getObjectProperty(result, "model"), "provider") ??
    stringProperty(getObjectProperty(result, "lastAgent"), "provider") ??
    stringProperty(
      getObjectProperty(getObjectProperty(result, "lastAgent"), "model"),
      "provider",
    )
  );
}

function resolveModel(result: unknown) {
  const directModel = getObjectProperty(result, "model");
  const lastAgentModel = getObjectProperty(
    getObjectProperty(result, "lastAgent"),
    "model",
  );

  return (
    stringProperty(result, "model") ??
    (typeof directModel === "string" ? directModel : undefined) ??
    stringProperty(directModel, "modelId") ??
    stringProperty(directModel, "id") ??
    (typeof lastAgentModel === "string" ? lastAgentModel : undefined) ??
    stringProperty(lastAgentModel, "modelId") ??
    stringProperty(lastAgentModel, "id")
  );
}

function normalizeAgentMetadata(agent: unknown) {
  if (!agent || typeof agent !== "object") {
    return undefined;
  }

  return normalizeMetadata({
    name: getObjectProperty(agent, "name"),
    model: resolveModel({ lastAgent: agent }),
  });
}

function getObjectProperty(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  const property = getObjectProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function numberProperty(value: unknown, key: string): number | undefined {
  const property = getObjectProperty(value, key);
  return typeof property === "number" ? property : undefined;
}

function arrayProperty(value: unknown, key: string): unknown[] | undefined {
  const property = getObjectProperty(value, key);
  return Array.isArray(property) ? property : undefined;
}

function findStringAtPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    current = getObjectProperty(current, key);
  }

  return typeof current === "string" ? current : undefined;
}

function stringifyJson(value: JsonValue | undefined) {
  return value === undefined ? undefined : JSON.stringify(value);
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value && typeof (value as { then?: unknown }).then === "function",
  );
}
