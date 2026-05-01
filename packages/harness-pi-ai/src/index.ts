import type {
  Harness,
  HarnessContext,
  HarnessMetadata,
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
  isHarnessRun,
  isNormalizedSession,
  normalizeContent,
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
type AnyPiAiToolset<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = Record<string, PiAiToolDefinition<any, any, TInput, TMetadata>>;
type InferredPiAiToolset<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = Record<
  string,
  PiAiToolDefinition<Record<string, JsonValue>, JsonValue, TInput, TMetadata>
>;

type PiAgentToolLike<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = {
  name: string;
  replay?:
    | boolean
    | PiAiToolReplayConfig<
        Record<string, JsonValue>,
        JsonValue,
        TInput,
        TMetadata
      >;
  execute: (toolCallId: string, args: Record<string, JsonValue>) => unknown;
};

const ORIGINAL_NATIVE_EXECUTE = Symbol("vitest-evals.originalNativeExecute");

export type PiAiReplayMode = ReplayMode;

export interface PiAiEventSink {
  message: (message: NormalizedMessage) => void;
  system: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  user: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  assistant: (content: JsonValue, metadata?: Record<string, JsonValue>) => void;
  tool: (
    name: string,
    content: JsonValue,
    metadata?: Record<string, JsonValue>,
  ) => void;
}

export interface PiAiToolContext<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  input: TInput;
  metadata: HarnessContext<TMetadata>["metadata"];
  signal?: AbortSignal;
  setArtifact: HarnessContext<TMetadata>["setArtifact"];
}

export type PiAiToolRecording<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
> = ToolRecording<TArgs, TResult>;

export type PiAiToolReplayConfig<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = ToolReplayConfig<TArgs, TResult, PiAiToolContext<TInput, TMetadata>>;

export interface PiAiToolDefinition<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> {
  description?: string;
  replay?: boolean | PiAiToolReplayConfig<TArgs, TResult, TInput, TMetadata>;
  execute: (
    args: TArgs,
    context: PiAiToolContext<TInput, TMetadata>,
  ) => MaybePromise<TResult>;
}

export type PiAiToolset<
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = AnyPiAiToolset<TInput, TMetadata>;

type ToolArgs<TTool> = TTool extends PiAiToolDefinition<
  infer TArgs,
  infer _TResult,
  infer _TInput,
  infer _TMetadata
>
  ? TArgs
  : never;

type ToolResult<TTool> = TTool extends PiAiToolDefinition<
  infer _TArgs,
  infer TResult,
  infer _TInput,
  infer _TMetadata
>
  ? TResult
  : never;

export type PiAiRuntime<
  TTools extends PiAiToolset<TInput, TMetadata>,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
> = {
  tools: {
    [K in keyof TTools]: (
      args: ToolArgs<TTools[K]>,
    ) => Promise<ToolResult<TTools[K]>>;
  };
  events: PiAiEventSink;
  signal?: AbortSignal;
};

export interface PiAiHarnessRunArgs<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TTools extends PiAiToolset<TInput, TMetadata>,
> {
  agent: TAgent;
  input: TInput;
  context: HarnessContext<TMetadata>;
  runtime: PiAiRuntime<TTools, TInput, TMetadata>;
}

export interface PiAiHarnessResultArgs<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
> extends PiAiHarnessRunArgs<TAgent, TInput, TMetadata, TTools> {
  result: TResult;
}

interface PiAiHarnessBaseOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
> {
  agent?: TAgent;
  createAgent?: () => MaybePromise<TAgent>;
  normalize?: PiAiHarnessNormalizeOptions<
    TAgent,
    TInput,
    TMetadata,
    TResult,
    TTools
  >;
  name?: string;
}

export interface PiAiHarnessWithToolsOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
> extends PiAiHarnessBaseOptions<TAgent, TInput, TMetadata, TResult, TTools> {
  tools: TTools;
  run?: (
    args: PiAiHarnessRunArgs<TAgent, TInput, TMetadata, TTools>,
  ) => MaybePromise<TResult | HarnessRun>;
}

export interface PiAiHarnessInferredToolsOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
> extends PiAiHarnessBaseOptions<
    TAgent,
    TInput,
    TMetadata,
    TResult,
    InferredPiAiToolset<TInput, TMetadata>
  > {
  tools?: undefined;
  run?: (
    args: PiAiHarnessRunArgs<
      TAgent,
      TInput,
      TMetadata,
      InferredPiAiToolset<TInput, TMetadata>
    >,
  ) => MaybePromise<TResult | HarnessRun>;
}

export type PiAiHarnessOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
> =
  | PiAiHarnessWithToolsOptions<TAgent, TInput, TMetadata, TResult, TTools>
  | PiAiHarnessInferredToolsOptions<TAgent, TInput, TMetadata, TResult>;

type PiAiHarnessRunOptions<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
> = PiAiHarnessBaseOptions<TAgent, TInput, TMetadata, TResult, TTools> & {
  run?: (
    args: PiAiHarnessRunArgs<TAgent, TInput, TMetadata, TTools>,
  ) => MaybePromise<TResult | HarnessRun>;
};

type PiAiRunnableAgent<
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
> = {
  run: (
    input: TInput,
    runtime: PiAiRuntime<TTools, TInput, TMetadata>,
  ) => MaybePromise<TResult | HarnessRun>;
};

export interface PiAiHarnessNormalizeOptions<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
> {
  session?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<NormalizedSession>;
  output?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<JsonValue | undefined>;
  usage?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<UsageSummary>;
  timings?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<TimingSummary | undefined>;
  errors?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TMetadata, TResult, TTools>,
  ) => MaybePromise<Array<Record<string, JsonValue>>>;
}

type InferredToolSurfaces<TInput, TMetadata extends HarnessMetadata> = {
  runtimeTools?: InferredPiAiToolset<TInput, TMetadata>;
  nativeToolsets?: Array<PiAgentToolLike<TInput, TMetadata>[]>;
};

/** Adapts a Pi agent runtime into a normalized vitest-evals harness. */
export function piAiHarness<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
>(
  options: PiAiHarnessWithToolsOptions<
    TAgent,
    TInput,
    TMetadata,
    TResult,
    TTools
  >,
): Harness<TInput, TMetadata>;
export function piAiHarness<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
>(
  options: PiAiHarnessInferredToolsOptions<TAgent, TInput, TMetadata, TResult>,
): Harness<TInput, TMetadata>;
export function piAiHarness<
  TAgent,
  TInput = string,
  TMetadata extends HarnessMetadata = HarnessMetadata,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TMetadata> = PiAiToolset<
    TInput,
    TMetadata
  >,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
): Harness<TInput, TMetadata> {
  return {
    name: options.name ?? "pi-ai",
    run: async (input, context) => {
      const agent = await resolveAgent(options);
      const messages: NormalizedMessage[] = [
        {
          role: "user",
          content: normalizeContent(input),
        },
      ];

      if (hasExplicitToolset(options)) {
        return executePiHarnessRun(
          options,
          agent,
          input,
          context,
          messages,
          options.tools,
        );
      }

      const inferredTools = resolveInferredToolSurfaces<TInput, TMetadata>(
        agent,
      );
      return executePiHarnessRun(
        options,
        agent,
        input,
        context,
        messages,
        inferredTools.runtimeTools,
        inferredTools.nativeToolsets,
      );
    },
  };
}

async function executePiHarnessRun<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
>(
  options: PiAiHarnessRunOptions<TAgent, TInput, TMetadata, TResult, TTools>,
  agent: TAgent,
  input: TInput,
  context: HarnessContext<TMetadata>,
  messages: NormalizedMessage[],
  runtimeTools: TTools | undefined,
  nativeToolsets?: Array<PiAgentToolLike<TInput, TMetadata>[]>,
): Promise<HarnessRun> {
  const runtime = createRuntime({
    input,
    context,
    tools: runtimeTools,
    messages,
  });

  try {
    const result = await withInstrumentedAgentTools(
      agent,
      nativeToolsets,
      {
        input,
        context,
        messages,
        toolCalls: runtime.toolCalls,
      },
      () =>
        runAgent(options, {
          agent,
          input,
          context,
          runtime,
        }),
    );

    if (isHarnessRun(result)) {
      if (Object.keys(context.artifacts).length > 0 && !result.artifacts) {
        result.artifacts = context.artifacts;
      }
      return result;
    }

    const resultArgs = {
      agent,
      input,
      context,
      runtime,
      result,
    } satisfies PiAiHarnessResultArgs<
      TAgent,
      TInput,
      TMetadata,
      TResult,
      TTools
    >;

    const output = options.normalize?.output
      ? await options.normalize.output(resultArgs)
      : resolveOutput(result);
    const usage = options.normalize?.usage
      ? await options.normalize.usage(resultArgs)
      : resolveUsage(result, runtime.toolCalls.length);
    const session = options.normalize?.session
      ? await options.normalize.session(resultArgs)
      : resolveSession(result, messages, output, usage);

    return {
      session,
      output,
      usage,
      timings: options.normalize?.timings
        ? await options.normalize.timings(resultArgs)
        : undefined,
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors: options.normalize?.errors
        ? await options.normalize.errors(resultArgs)
        : resolveErrors(result),
    };
  } catch (error) {
    const usage = resolveUsage(undefined, runtime.toolCalls.length);
    const run = {
      session: resolveSession(undefined, messages, undefined, usage),
      output: undefined,
      usage,
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors: [serializeError(error)],
    } satisfies HarnessRun;

    throw attachHarnessRunToError(error, run);
  }
}

async function resolveAgent<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
>(options: PiAiHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>) {
  if (options.agent !== undefined) {
    return options.agent;
  }

  if (options.createAgent) {
    return options.createAgent();
  }

  throw new Error(
    "piAiHarness requires either an agent instance or a createAgent() function.",
  );
}

function resolveInferredToolSurfaces<TInput, TMetadata extends HarnessMetadata>(
  agent: unknown,
): InferredToolSurfaces<TInput, TMetadata> {
  const nativeToolsets: Array<PiAgentToolLike<TInput, TMetadata>[]> = [];
  const seenToolsets = new Set<PiAgentToolLike<TInput, TMetadata>[]>();

  for (const candidate of getAgentToolCandidates(agent)) {
    const runtimeTools = getRuntimeToolset<TInput, TMetadata>(candidate);
    if (runtimeTools) {
      return {
        runtimeTools,
      };
    }

    const nativeTools = getNativeToolArray(candidate);
    if (nativeTools && !seenToolsets.has(nativeTools)) {
      seenToolsets.add(nativeTools);
      nativeToolsets.push(nativeTools);
    }
  }

  return nativeToolsets.length > 0 ? { nativeToolsets } : {};
}

function getAgentToolCandidates(agent: unknown): object[] {
  const roots = getAgentRoots(agent);
  const candidates: object[] = [];
  const seen = new Set<object>();

  for (const root of roots) {
    addUniqueObject(candidates, seen, root);
    addUniqueObject(candidates, seen, getObjectProperty(root, "state"));
    addUniqueObject(candidates, seen, getObjectProperty(root, "initialState"));
  }

  return candidates;
}

function getAgentRoots(agent: unknown): object[] {
  return [asObject(agent)]
    .concat(asObject(getObjectProperty(agent, "agent")))
    .filter((value): value is object => value !== undefined);
}

function addUniqueObject(
  candidates: object[],
  seen: Set<object>,
  value: unknown,
) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }

  seen.add(value);
  candidates.push(value);
}

function asObject(value: unknown): object | undefined {
  return value && typeof value === "object" ? value : undefined;
}

function getObjectProperty(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function getRuntimeToolset<TInput, TMetadata extends HarnessMetadata>(
  value: object,
): InferredPiAiToolset<TInput, TMetadata> | undefined {
  const candidate =
    getObjectProperty(value, "tools") ?? getObjectProperty(value, "toolset");

  return isPiAiToolset(candidate)
    ? (candidate as InferredPiAiToolset<TInput, TMetadata>)
    : undefined;
}

function getNativeToolArray<TInput, TMetadata extends HarnessMetadata>(
  value: object,
): PiAgentToolLike<TInput, TMetadata>[] | undefined {
  const candidate = getObjectProperty(value, "tools");
  if (isAgentToolArray(candidate)) {
    return candidate as PiAgentToolLike<TInput, TMetadata>[];
  }

  return undefined;
}

async function runAgent<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
>(
  options: PiAiHarnessRunOptions<TAgent, TInput, TMetadata, TResult, TTools>,
  args: PiAiHarnessRunArgs<TAgent, TInput, TMetadata, TTools>,
): Promise<TResult | HarnessRun> {
  if (options.run) {
    return options.run(args);
  }

  if (hasPiAiRunMethod<TInput, TMetadata, TResult, TTools>(args.agent)) {
    return args.agent.run(args.input, args.runtime);
  }

  throw new Error(
    "piAiHarness requires a run() function unless the provided agent exposes run(input, runtime).",
  );
}

function hasExplicitToolset<
  TAgent,
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TMetadata, TResult, TTools>,
): options is PiAiHarnessWithToolsOptions<
  TAgent,
  TInput,
  TMetadata,
  TResult,
  TTools
> {
  return options.tools !== undefined;
}

function hasPiAiRunMethod<
  TInput,
  TMetadata extends HarnessMetadata,
  TResult,
  TTools extends PiAiToolset<TInput, TMetadata>,
>(
  agent: unknown,
): agent is PiAiRunnableAgent<TInput, TMetadata, TResult, TTools> {
  if (!agent || typeof agent !== "object") {
    return false;
  }

  return (
    "run" in agent && typeof (agent as { run?: unknown }).run === "function"
  );
}

function isPiAiToolset(value: unknown): value is PiAiToolset {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((tool) =>
    Boolean(
      tool &&
        typeof tool === "object" &&
        "execute" in tool &&
        typeof (tool as { execute?: unknown }).execute === "function",
    ),
  );
}

function isAgentToolArray(value: unknown): value is PiAgentToolLike[] {
  return (
    Array.isArray(value) &&
    value.every((tool) =>
      Boolean(
        tool &&
          typeof tool === "object" &&
          "name" in tool &&
          typeof (tool as { name?: unknown }).name === "string" &&
          "execute" in tool &&
          typeof (tool as { execute?: unknown }).execute === "function",
      ),
    )
  );
}

async function withInstrumentedAgentTools<
  TResult,
  TInput,
  TMetadata extends HarnessMetadata,
>(
  agent: unknown,
  toolsets: Array<PiAgentToolLike<TInput, TMetadata>[]> | undefined,
  args: {
    input: TInput;
    context: HarnessContext<TMetadata>;
    messages: NormalizedMessage[];
    toolCalls: ToolCallRecord[];
  },
  callback: () => Promise<TResult>,
) {
  if (!toolsets || toolsets.length === 0) {
    return callback();
  }

  const originalExecutions = new Map<
    PiAgentToolLike<TInput, TMetadata>,
    PiAgentToolLike<TInput, TMetadata>["execute"]
  >();
  const originalResets = new Map<ResettableAgent, ResettableAgent["reset"]>();

  const patchTool = (tool: PiAgentToolLike<TInput, TMetadata>) => {
    if (originalExecutions.has(tool)) {
      return;
    }

    const originalExecute = getNativeToolExecuteOrigin(tool.execute);
    originalExecutions.set(tool, originalExecute);
    const instrumentedExecute = async (toolCallId, rawArgs) => {
      const startedAt = new Date();
      const toolContext = {
        input: args.input,
        metadata: args.context.metadata,
        signal: args.context.signal,
        setArtifact: args.context.setArtifact,
      } satisfies PiAiToolContext<TInput, TMetadata>;

      try {
        const execution = await executeNativeToolWithReplay({
          toolName: tool.name,
          toolCallId,
          execute: originalExecute,
          replay: tool.replay,
          args: rawArgs,
          context: toolContext,
        });
        const finishedAt = new Date();
        const call = {
          name: tool.name,
          arguments: rawArgs,
          result: execution.normalizedResult,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          metadata: normalizeReplayMetadata(execution.replay),
        } satisfies ToolCallRecord;
        args.toolCalls.push(call);
        args.messages.push({
          role: "assistant",
          toolCalls: [call],
        });
        args.messages.push({
          role: "tool",
          content: execution.normalizedResult,
          metadata: {
            name: tool.name,
          },
        });
        return execution.result;
      } catch (error) {
        const finishedAt = new Date();
        const call = {
          name: tool.name,
          arguments: rawArgs,
          error: serializeToolError(error),
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          metadata: normalizeReplayMetadata(getReplayMetadataFromError(error)),
        } satisfies ToolCallRecord;
        args.toolCalls.push(call);
        args.messages.push({
          role: "assistant",
          toolCalls: [call],
        });
        throw error;
      }
    };
    instrumentedExecute[ORIGINAL_NATIVE_EXECUTE] = originalExecute;
    tool.execute = instrumentedExecute;
  };

  const patchToolsets = (
    nextToolsets: Array<PiAgentToolLike<TInput, TMetadata>[]>,
  ) => {
    for (const toolset of nextToolsets) {
      for (const tool of toolset) {
        patchTool(tool);
      }
    }
  };

  patchToolsets(toolsets);

  for (const target of getAgentResetTargets(agent)) {
    const originalReset = target.reset;
    originalResets.set(target, originalReset);
    target.reset = function patchedReset(this: ResettableAgent, ...resetArgs) {
      const resetResult = originalReset.apply(this, resetArgs);

      if (isPromiseLike(resetResult)) {
        return resetResult.finally(() => {
          patchToolsets(
            resolveInferredNativeToolsets<TInput, TMetadata>(agent),
          );
        });
      }

      patchToolsets(resolveInferredNativeToolsets<TInput, TMetadata>(agent));
      return resetResult;
    };
  }

  try {
    return await callback();
  } finally {
    for (const [target, originalReset] of originalResets) {
      target.reset = originalReset;
    }

    for (const [tool, originalExecute] of originalExecutions) {
      tool.execute = originalExecute;
    }
  }
}

type ResettableAgent = {
  reset: (...args: unknown[]) => unknown;
};

function getAgentResetTargets(agent: unknown): ResettableAgent[] {
  return getAgentRoots(agent).filter(isResettableAgent);
}

function isResettableAgent(value: object): value is ResettableAgent {
  return "reset" in value && typeof value.reset === "function";
}

function resolveInferredNativeToolsets<
  TInput,
  TMetadata extends HarnessMetadata,
>(agent: unknown): Array<PiAgentToolLike<TInput, TMetadata>[]> {
  const toolsets: Array<PiAgentToolLike<TInput, TMetadata>[]> = [];
  const seenToolsets = new Set<PiAgentToolLike<TInput, TMetadata>[]>();

  for (const candidate of getAgentToolCandidates(agent)) {
    const nativeTools = getNativeToolArray(candidate);
    if (nativeTools && !seenToolsets.has(nativeTools)) {
      seenToolsets.add(nativeTools);
      toolsets.push(nativeTools);
    }
  }

  return toolsets;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value && typeof (value as { then?: unknown }).then === "function",
  );
}

function getNativeToolExecuteOrigin<TInput, TMetadata extends HarnessMetadata>(
  execute: PiAgentToolLike<TInput, TMetadata>["execute"],
) {
  return execute[ORIGINAL_NATIVE_EXECUTE] ?? execute;
}

async function executeNativeToolWithReplay<
  TInput,
  TMetadata extends HarnessMetadata,
>({
  toolName,
  toolCallId,
  execute,
  replay,
  args,
  context,
}: {
  toolName: string;
  toolCallId: string;
  execute: PiAgentToolLike<TInput, TMetadata>["execute"];
  replay: PiAgentToolLike<TInput, TMetadata>["replay"];
  args: Record<string, JsonValue>;
  context: PiAiToolContext<TInput, TMetadata>;
}) {
  let didExecute = false;
  let liveResult: unknown;

  const execution = await executeWithReplay({
    toolName,
    args,
    context,
    execute: async (toolArgs) => {
      didExecute = true;
      liveResult = await execute(toolCallId, toolArgs);
      return createNativeToolReplayEnvelope(liveResult);
    },
    replay,
  });

  if (didExecute) {
    return {
      result: liveResult,
      normalizedResult: normalizeReplayToolResult(liveResult),
      replay: execution.replay,
    };
  }

  return {
    ...resolveNativeToolReplayResult(execution.result),
    replay: execution.replay,
  };
}

function createRuntime<
  TInput,
  TMetadata extends HarnessMetadata,
  TTools extends PiAiToolset<TInput, TMetadata>,
>({
  input,
  context,
  tools,
  messages,
}: {
  input: TInput;
  context: HarnessContext<TMetadata>;
  tools: TTools | undefined;
  messages: NormalizedMessage[];
}): PiAiRuntime<TTools, TInput, TMetadata> & {
  toolCalls: ToolCallRecord[];
} {
  const toolCalls: ToolCallRecord[] = [];
  const eventSink: PiAiEventSink = {
    message: (message) => {
      messages.push(message);
    },
    system: (content, metadata) => {
      messages.push({
        role: "system",
        content,
        metadata,
      });
    },
    user: (content, metadata) => {
      messages.push({
        role: "user",
        content,
        metadata,
      });
    },
    assistant: (content, metadata) => {
      messages.push({
        role: "assistant",
        content,
        metadata,
      });
    },
    tool: (name, content, metadata) => {
      messages.push({
        role: "tool",
        content,
        metadata: {
          name,
          ...(metadata ?? {}),
        },
      });
    },
  };

  const runtimeTools = Object.fromEntries(
    Object.entries(tools ?? {}).map(([toolName, tool]) => [
      toolName,
      async (args: Record<string, JsonValue>) => {
        const startedAt = new Date();
        const toolContext = {
          input,
          metadata: context.metadata,
          signal: context.signal,
          setArtifact: context.setArtifact,
        } satisfies PiAiToolContext<TInput, TMetadata>;

        try {
          const execution = await executeToolWithReplay({
            toolName,
            tool,
            args,
            context: toolContext,
          });
          const finishedAt = new Date();
          const call = {
            name: toolName,
            arguments: args,
            result: execution.result,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            metadata: normalizeReplayMetadata(execution.replay),
          } satisfies ToolCallRecord;
          toolCalls.push(call);
          messages.push({
            role: "assistant",
            toolCalls: [call],
          });
          messages.push({
            role: "tool",
            content: execution.result,
            metadata: {
              name: toolName,
            },
          });
          return execution.result;
        } catch (error) {
          const finishedAt = new Date();
          const call = {
            name: toolName,
            arguments: args,
            error: serializeToolError(error),
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            metadata: normalizeReplayMetadata(
              getReplayMetadataFromError(error),
            ),
          } satisfies ToolCallRecord;
          toolCalls.push(call);
          messages.push({
            role: "assistant",
            toolCalls: [call],
          });
          throw error;
        }
      },
    ]),
  ) as unknown as PiAiRuntime<TTools, TInput, TMetadata>["tools"];

  return {
    tools: runtimeTools,
    events: eventSink,
    signal: context.signal,
    toolCalls,
  };
}

function resolveOutput(result: unknown): JsonValue | undefined {
  if (!result || typeof result !== "object") {
    return toJsonValue(result);
  }

  const candidates = [
    "output",
    "decision",
    "result",
    "final",
  ] satisfies string[];

  for (const key of candidates) {
    const value = (result as Record<string, unknown>)[key];
    const normalized = toJsonValue(value);
    if (normalized !== undefined) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeToolResult(result: unknown): JsonValue | undefined {
  const details =
    result && typeof result === "object"
      ? toJsonValue((result as { details?: unknown }).details)
      : undefined;
  if (details !== undefined) {
    return details;
  }

  return (
    toJsonValue(result) ?? (result === undefined ? undefined : String(result))
  );
}

function normalizeReplayToolResult(result: unknown): JsonValue {
  return normalizeToolResult(result) ?? null;
}

type NativeToolReplayEnvelope = {
  __vitestEvals: {
    kind: "pi-ai-native-tool-result";
    version: 2;
  };
  agentResult: JsonValue;
  normalizedResult: JsonValue;
};

type LegacyNativeToolReplayEnvelope = {
  __vitestEvals: {
    kind: "pi-ai-native-tool-result";
    version: 1;
  };
  normalizedResult: JsonValue;
  agentResult?: JsonValue;
};

function createNativeToolReplayEnvelope(
  result: unknown,
): NativeToolReplayEnvelope {
  const normalizedResult = normalizeReplayToolResult(result);

  return {
    __vitestEvals: {
      kind: "pi-ai-native-tool-result",
      version: 2,
    },
    agentResult: toJsonValue(result) ?? normalizedResult,
    normalizedResult,
  };
}

function resolveNativeToolReplayResult(result: JsonValue) {
  if (isNativeToolReplayEnvelope(result)) {
    return {
      result: result.agentResult,
      normalizedResult: result.normalizedResult,
    };
  }

  if (isLegacyNativeToolReplayEnvelope(result)) {
    return {
      result: result.agentResult ?? result.normalizedResult,
      normalizedResult: result.normalizedResult,
    };
  }

  return {
    result,
    normalizedResult: normalizeReplayToolResult(result),
  };
}

function isNativeToolReplayEnvelope(
  value: unknown,
): value is NativeToolReplayEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "__vitestEvals" in value &&
      isNativeToolReplayMarker(
        (value as { __vitestEvals?: unknown }).__vitestEvals,
      ) &&
      "agentResult" in value &&
      "normalizedResult" in value,
  );
}

function isNativeToolReplayMarker(
  value: unknown,
): value is NativeToolReplayEnvelope["__vitestEvals"] {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      (value as { kind?: unknown }).kind === "pi-ai-native-tool-result" &&
      "version" in value &&
      (value as { version?: unknown }).version === 2,
  );
}

function isLegacyNativeToolReplayEnvelope(
  value: unknown,
): value is LegacyNativeToolReplayEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "__vitestEvals" in value &&
      isLegacyNativeToolReplayMarker(
        (value as { __vitestEvals?: unknown }).__vitestEvals,
      ) &&
      "normalizedResult" in value,
  );
}

function isLegacyNativeToolReplayMarker(
  value: unknown,
): value is LegacyNativeToolReplayEnvelope["__vitestEvals"] {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      (value as { kind?: unknown }).kind === "pi-ai-native-tool-result" &&
      "version" in value &&
      (value as { version?: unknown }).version === 1,
  );
}

function resolveUsage(result: unknown, toolCallCount: number): UsageSummary {
  if (!result || typeof result !== "object") {
    return toolCallCount > 0 ? { toolCalls: toolCallCount } : {};
  }

  const usageValue =
    (result as Record<string, unknown>).usage ??
    (result as Record<string, unknown>).metrics;

  const usage =
    usageValue && typeof usageValue === "object"
      ? ({ ...(usageValue as Record<string, unknown>) } as UsageSummary)
      : {};

  if (usage.toolCalls === undefined && toolCallCount > 0) {
    usage.toolCalls = toolCallCount;
  }

  return usage;
}

function resolveSession(
  result: unknown,
  messages: NormalizedMessage[],
  output: JsonValue | undefined,
  usage: UsageSummary,
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

  const sessionMessages = [...messages];
  if (
    output !== undefined &&
    !sessionMessages.some(
      (message) =>
        message.role === "assistant" && message.content !== undefined,
    )
  ) {
    sessionMessages.push({
      role: "assistant",
      content: output,
    });
  }

  return {
    messages: sessionMessages,
    outputText: typeof output === "string" ? output : undefined,
    provider:
      ((result as Record<string, unknown> | undefined)?.provider as
        | string
        | undefined) ?? usage.provider,
    model:
      ((result as Record<string, unknown> | undefined)?.model as
        | string
        | undefined) ?? usage.model,
  };
}

function resolveErrors(result: unknown): Array<Record<string, JsonValue>> {
  return resolveHarnessRunErrors(result);
}

async function executeToolWithReplay<
  TArgs extends Record<string, JsonValue>,
  TResult extends JsonValue,
  TInput,
  TMetadata extends HarnessMetadata,
>({
  toolName,
  tool,
  args,
  context,
}: {
  toolName: string;
  tool: PiAiToolDefinition<TArgs, TResult, TInput, TMetadata>;
  args: TArgs;
  context: PiAiToolContext<TInput, TMetadata>;
}) {
  return executeWithReplay({
    toolName,
    args,
    context,
    execute: tool.execute,
    replay: tool.replay,
  });
}

function serializeToolError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      type: error.name,
    };
  }

  return {
    message: String(error),
    type: "Error",
  };
}
