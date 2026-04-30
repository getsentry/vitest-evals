import type {
  Agent as PiAiAgent,
  AgentMessage,
  AgentTool,
  AgentToolResult,
} from "@mariozechner/pi-agent-core";
import {
  complete,
  type AssistantMessage,
  type ToolResultMessage,
  type UserMessage,
} from "@mariozechner/pi-ai";
import {
  attachHarnessRunToError,
  hasCallableMethod,
  isHarnessRun,
  isNormalizedSession,
  normalizeContent,
  normalizeRecord,
  resolveHarnessRunErrors,
  serializeError,
  toJsonValue,
} from "vitest-evals";
import type {
  Harness,
  HarnessCase,
  HarnessContext,
  HarnessPrompt,
  HarnessRun,
  JsonValue,
  NormalizedMessage,
  NormalizedSession,
  TimingSummary,
  ToolCallRecord,
  UsageSummary,
} from "vitest-evals";
import {
  executeWithReplay,
  getReplayMetadataFromError,
  normalizeReplayMetadata,
} from "vitest-evals/replay";
import type {
  ReplayMetadata,
  ReplayMode,
  ToolRecording,
  ToolReplayConfig,
} from "vitest-evals/replay";

type MaybePromise<T> = T | Promise<T>;
type AgentSource<TAgent> = TAgent | (() => MaybePromise<TAgent>);
type PiAiPromptModel = Parameters<typeof complete>[0];
type PiAiAgentInstance = Pick<PiAiAgent, "prompt" | "reset" | "state">;

const piAiAgentResultSymbol = Symbol("vitest-evals.pi-ai-agent-result");

export type PiAiReplayMode = ReplayMode;

export type PiAiAgentToolReplayConfig<
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = ToolReplayConfig<
  Record<string, JsonValue>,
  JsonValue,
  PiAiToolContext<TInput, TCase>
>;

export type PiAiAgentTool<
  TDetails = unknown,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = AgentTool<any, TDetails> & {
  replay?: boolean | PiAiAgentToolReplayConfig<TInput, TCase>;
};

export type PiAiAgentTools<
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = readonly PiAiAgentTool<any, TInput, TCase>[];

interface PiAiPromptOptions {
  model: PiAiPromptModel;
  system?: string;
}

function createPiAiPrompt(options: PiAiPromptOptions): HarnessPrompt {
  return async (input, promptOptions) => {
    const response = await complete(options.model, {
      systemPrompt: promptOptions?.system ?? options.system,
      messages: [
        {
          role: "user",
          content: input,
          timestamp: Date.now(),
        },
      ],
    });

    return getAssistantText(response);
  };
}

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
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> {
  input: TInput;
  caseData: TCase;
  signal?: AbortSignal;
  setArtifact: HarnessContext<TCase>["setArtifact"];
}

export type PiAiToolRecording<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
> = ToolRecording<TArgs, TResult>;

export type PiAiToolReplayConfig<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = ToolReplayConfig<TArgs, TResult, PiAiToolContext<TInput, TCase>>;

export interface PiAiToolDefinition<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
  TResult extends JsonValue = JsonValue,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> {
  description?: string;
  replay?: boolean | PiAiToolReplayConfig<TArgs, TResult, TInput, TCase>;
  execute: (
    args: TArgs,
    context: PiAiToolContext<TInput, TCase>,
  ) => MaybePromise<TResult>;
}

export type PiAiToolset<
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = Record<string, PiAiToolDefinition<any, any, TInput, TCase>>;

type ToolArgs<TTool> = TTool extends PiAiToolDefinition<
  infer TArgs,
  any,
  any,
  any
>
  ? TArgs
  : never;

type ToolResult<TTool> = TTool extends PiAiToolDefinition<
  any,
  infer TResult,
  any,
  any
>
  ? TResult
  : never;

export type PiAiRuntime<
  TTools extends PiAiToolset<TInput, TCase>,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = {
  tools: {
    [K in keyof TTools]: (
      args: ToolArgs<TTools[K]>,
    ) => Promise<ToolResult<TTools[K]>>;
  };
  events: PiAiEventSink;
  signal?: AbortSignal;
};

type PiAiRuntimeExecution<
  TTools extends PiAiToolset<TInput, TCase>,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
> = PiAiRuntime<TTools, TInput, TCase> & {
  toolCalls: ToolCallRecord[];
};

export interface PiAiHarnessRunArgs<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TTools extends PiAiToolset<TInput, TCase>,
> {
  agent: TAgent | undefined;
  input: TInput;
  context: HarnessContext<TCase>;
  runtime: PiAiRuntime<TTools, TInput, TCase>;
}

export interface PiAiHarnessResultArgs<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
> extends PiAiHarnessRunArgs<TAgent, TInput, TCase, TTools> {
  result: TResult;
  outputText?: string;
  finalMessage?: AssistantMessage;
  messages?: AgentMessage[];
  toolCalls: ToolCallRecord[];
}

export type PiAiHarnessOptions<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
> = PiAiHarnessBaseOptions<TAgent, TInput, TCase, TResult, TTools> &
  (
    | {
        agent: AgentSource<TAgent>;
        task?: never;
      }
    | {
        task: (
          args: PiAiHarnessRunArgs<TAgent, TInput, TCase, TTools>,
        ) => MaybePromise<TResult | HarnessRun>;
        agent?: never;
      }
  );

interface PiAiHarnessBaseOptions<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
> {
  tools?: TTools | PiAiAgentTools<TInput, TCase>;
  session?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<NormalizedSession>;
  output?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<JsonValue | undefined>;
  usage?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<UsageSummary>;
  timings?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<TimingSummary | undefined>;
  errors?: (
    args: PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>,
  ) => MaybePromise<Array<Record<string, JsonValue>>>;
  promptModel?: PiAiPromptModel;
  promptSystem?: string;
  prompt?: HarnessPrompt;
  name?: string;
}

export type PiAiHarnessConfig<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
> = PiAiHarnessBaseOptions<TAgent, TInput, TCase, TResult, TTools>;

type PiAiNativeAgentRunResult = {
  [piAiAgentResultSymbol]: true;
  messages: AgentMessage[];
  normalizedMessages: NormalizedMessage[];
  finalMessage?: AssistantMessage;
  outputText?: string;
  usage: UsageSummary;
  toolCalls: ToolCallRecord[];
  errors: Array<Record<string, JsonValue>>;
  provider?: string;
  model?: string;
};

export function piAiHarness<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
): Harness<TInput, TCase, TAgent>;
export function piAiHarness<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
>(
  agent: AgentSource<TAgent>,
  options?: PiAiHarnessConfig<TAgent, TInput, TCase, TResult, TTools>,
): Harness<TInput, TCase, TAgent>;
export function piAiHarness<
  TAgent,
  TInput = string,
  TCase extends HarnessCase<TInput> = HarnessCase<TInput>,
  TResult = unknown,
  TTools extends PiAiToolset<TInput, TCase> = PiAiToolset<TInput, TCase>,
>(
  agentOrOptions:
    | AgentSource<TAgent>
    | PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  options?: PiAiHarnessConfig<TAgent, TInput, TCase, TResult, TTools>,
): Harness<TInput, TCase, TAgent> {
  const harnessOptions = normalizePiAiHarnessOptions(agentOrOptions, options);
  validateOptions(harnessOptions);

  return {
    name: harnessOptions.name ?? "pi-ai",
    prompt: resolveHarnessPrompt(harnessOptions),
    setup: () => createPiAiHarnessExecution(harnessOptions),
    run: async (input, context) => {
      const execution = await createPiAiHarnessExecution(harnessOptions);
      return execution.run(input, context);
    },
  };
}

function normalizePiAiHarnessOptions<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  agentOrOptions:
    | AgentSource<TAgent>
    | PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  options: PiAiHarnessConfig<TAgent, TInput, TCase, TResult, TTools> = {},
): PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools> {
  if (isPiAiHarnessOptions(agentOrOptions)) {
    return agentOrOptions as PiAiHarnessOptions<
      TAgent,
      TInput,
      TCase,
      TResult,
      TTools
    >;
  }

  return {
    ...options,
    agent: agentOrOptions as AgentSource<TAgent>,
  } as PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>;
}

function isPiAiHarnessOptions(
  value: unknown,
): value is PiAiHarnessOptions<
  unknown,
  unknown,
  HarnessCase<unknown>,
  unknown,
  PiAiToolset<unknown, HarnessCase<unknown>>
> {
  return (
    value !== null &&
    typeof value === "object" &&
    ("agent" in value || "task" in value)
  );
}

function resolveHarnessPrompt<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
): HarnessPrompt | undefined {
  if (options.prompt) {
    return options.prompt;
  }

  if (options.promptModel) {
    return createPiAiPrompt({
      model: options.promptModel,
      system: options.promptSystem,
    });
  }

  return undefined;
}

async function createPiAiHarnessExecution<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
  const agent = await resolveAgent(options);
  return {
    agent,
    run: (input: TInput, context: HarnessContext<TCase>) =>
      runPiAiHarness(options, agent, input, context),
  };
}

async function runPiAiHarness<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  agent: TAgent | undefined,
  input: TInput,
  context: HarnessContext<TCase>,
): Promise<HarnessRun> {
  const messages: NormalizedMessage[] = [
    {
      role: "user",
      content: normalizeContent(input),
    },
  ];

  const runtime = createRuntime<TInput, TCase, TTools>({
    input,
    context,
    tools: getRuntimeToolset(options.tools),
    messages,
  });

  try {
    const result = await runAgent(options, {
      agent,
      input,
      context,
      runtime,
    });

    if (isHarnessRun(result)) {
      if (Object.keys(context.artifacts).length > 0 && !result.artifacts) {
        result.artifacts = context.artifacts;
      }
      return result;
    }

    if (isPiAiNativeAgentRunResult(result)) {
      messages.splice(0, messages.length, ...result.normalizedMessages);
    }

    const toolCallCount = getResultToolCallCount(result, runtime.toolCalls);
    const resultConvenience = getResultConvenience(result, runtime.toolCalls);
    const resultArgs = {
      agent,
      input,
      context,
      runtime,
      result: result as TResult,
      ...resultConvenience,
    } satisfies PiAiHarnessResultArgs<TAgent, TInput, TCase, TResult, TTools>;

    const output = options.output
      ? await options.output(resultArgs)
      : resolveOutput(result);
    const usage = options.usage
      ? await options.usage(resultArgs)
      : resolveUsage(result, toolCallCount);
    const session = options.session
      ? await options.session(resultArgs)
      : resolveSession(result, messages, output, usage);

    return {
      session,
      output,
      usage,
      timings: options.timings ? await options.timings(resultArgs) : undefined,
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors: options.errors
        ? await options.errors(resultArgs)
        : resolveHarnessRunErrors(result),
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
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
  if (!hasAgentSource(options)) {
    return undefined;
  }

  return resolveAgentSource(options.agent);
}

async function runAgent<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  args: PiAiHarnessRunArgs<TAgent, TInput, TCase, TTools>,
): Promise<TResult | HarnessRun | PiAiNativeAgentRunResult> {
  if (options.task) {
    return options.task(args);
  }

  if (hasCallableMethod(args.agent, "run")) {
    return (
      args.agent as {
        run: (
          input: TInput,
          runtime: PiAiRuntime<TTools, TInput, TCase>,
        ) => MaybePromise<TResult | HarnessRun>;
      }
    ).run(args.input, args.runtime);
  }

  if (isPiAiAgentInstance(args.agent)) {
    return runNativePiAiAgent(options, {
      agent: args.agent,
      input: args.input,
      context: args.context,
    });
  }

  throw new Error(
    "piAiHarness agent must be a pi-agent-core Agent, expose run(input, runtime), or use task() for a custom entrypoint.",
  );
}

async function runNativePiAiAgent<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
  args: {
    agent: PiAiAgentInstance;
    input: TInput;
    context: HarnessContext<TCase>;
  },
): Promise<PiAiNativeAgentRunResult> {
  const originalTools = args.agent.state.tools.slice();
  const baseTools = isAgentToolArray(options.tools)
    ? options.tools
    : originalTools;
  const toolCalls: ToolCallRecord[] = [];

  args.agent.reset();
  args.agent.state.tools = createInstrumentedAgentTools({
    tools: baseTools,
    input: args.input,
    context: args.context,
    toolCalls,
  });

  try {
    await args.agent.prompt(toPromptInput(args.input));
  } finally {
    args.agent.state.tools = originalTools;
  }

  const agentMessages = args.agent.state.messages.slice();
  const finalMessage = getFinalAssistantMessage(agentMessages);
  const outputText = finalMessage ? getAssistantText(finalMessage) : undefined;

  return {
    [piAiAgentResultSymbol]: true,
    messages: agentMessages,
    normalizedMessages: normalizeAgentMessages(agentMessages, toolCalls),
    finalMessage,
    outputText,
    usage: resolvePiAiUsage(finalMessage, toolCalls.length),
    toolCalls,
    errors: resolvePiAiAgentErrors(finalMessage, toolCalls),
    provider: finalMessage?.provider,
    model: finalMessage?.model,
  };
}

function createInstrumentedAgentTools<
  TInput,
  TCase extends HarnessCase<TInput>,
>({
  tools,
  input,
  context,
  toolCalls,
}: {
  tools: PiAiAgentTools<TInput, TCase>;
  input: TInput;
  context: HarnessContext<TCase>;
  toolCalls: ToolCallRecord[];
}): AgentTool<any, any>[] {
  return tools.map((tool) => ({
    ...tool,
    execute: async (
      toolCallId: string,
      args: unknown,
      signal?: AbortSignal,
      onUpdate?: Parameters<AgentTool["execute"]>[3],
    ) => {
      const startedAt = new Date();
      const normalizedArgs = normalizeAgentToolArguments(args);
      const toolContext = {
        input,
        caseData: context.caseData,
        signal: signal ?? context.signal,
        setArtifact: context.setArtifact,
      } satisfies PiAiToolContext<TInput, TCase>;

      try {
        const execution = await executeAgentToolWithReplay({
          tool,
          toolCallId,
          args,
          normalizedArgs,
          context: toolContext,
          signal,
          onUpdate,
        });
        const finishedAt = new Date();
        const call = {
          id: toolCallId,
          name: tool.name,
          arguments: normalizedArgs,
          result: serializeAgentToolRecordResult(execution.result),
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          metadata: normalizeReplayMetadata(execution.replay),
        } satisfies ToolCallRecord;
        toolCalls.push(call);

        return execution.result;
      } catch (error) {
        const finishedAt = new Date();
        const call = {
          id: toolCallId,
          name: tool.name,
          arguments: normalizedArgs,
          error: serializeToolError(error),
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          metadata: normalizeReplayMetadata(getReplayMetadataFromError(error)),
        } satisfies ToolCallRecord;
        toolCalls.push(call);
        throw error;
      }
    },
  }));
}

async function executeAgentToolWithReplay<
  TInput,
  TCase extends HarnessCase<TInput>,
>({
  tool,
  toolCallId,
  args,
  normalizedArgs,
  context,
  signal,
  onUpdate,
}: {
  tool: PiAiAgentTool<any, TInput, TCase>;
  toolCallId: string;
  args: unknown;
  normalizedArgs: Record<string, JsonValue>;
  context: PiAiToolContext<TInput, TCase>;
  signal?: AbortSignal;
  onUpdate?: Parameters<AgentTool["execute"]>[3];
}): Promise<{
  result: AgentToolResult<JsonValue>;
  replay?: ReplayMetadata;
}> {
  if (!tool.replay) {
    return {
      result: (await tool.execute(
        toolCallId,
        args as never,
        signal,
        onUpdate,
      )) as AgentToolResult<JsonValue>,
    };
  }

  const execution = await executeWithReplay({
    toolName: tool.name,
    args: normalizedArgs,
    context,
    replay: tool.replay,
    execute: async () =>
      serializeAgentToolReplayResult(
        await tool.execute(toolCallId, args as never, signal, onUpdate),
      ),
  });

  return {
    result: deserializeAgentToolReplayResult(execution.result),
    replay: execution.replay,
  };
}

function normalizeAgentMessages(
  messages: AgentMessage[],
  recordedToolCalls: ToolCallRecord[],
): NormalizedMessage[] {
  return messages.flatMap((message) => {
    const normalized = normalizeAgentMessage(message, recordedToolCalls);
    return normalized ? [normalized] : [];
  });
}

function normalizeAgentMessage(
  message: AgentMessage,
  recordedToolCalls: ToolCallRecord[],
): NormalizedMessage | undefined {
  if (isPiAiUserMessage(message)) {
    return {
      role: "user",
      content: normalizeContent(message.content),
    };
  }

  if (isPiAiAssistantMessage(message)) {
    const content = getAssistantText(message);
    const toolCalls = message.content
      .filter((block) => block.type === "toolCall")
      .map((toolCall) => {
        const recorded = recordedToolCalls.find(
          (call) => call.id === toolCall.id,
        );
        return (
          recorded ?? {
            id: toolCall.id,
            name: toolCall.name,
            arguments: normalizeAgentToolArguments(toolCall.arguments),
          }
        );
      });

    return {
      role: "assistant",
      content: content.length > 0 ? content : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      metadata: normalizeRecord({
        api: message.api,
        provider: message.provider,
        model: message.model,
        stopReason: message.stopReason,
        errorMessage: message.errorMessage,
      }),
    };
  }

  if (isPiAiToolResultMessage(message)) {
    return {
      role: "tool",
      content: resolveAgentToolResultMessageContent(message),
      metadata: normalizeRecord({
        id: message.toolCallId,
        name: message.toolName,
        isError: message.isError,
      }),
    };
  }

  return undefined;
}

function resolvePiAiUsage(
  message: AssistantMessage | undefined,
  toolCallCount: number,
): UsageSummary {
  if (!message) {
    return toolCallCount > 0 ? { toolCalls: toolCallCount } : {};
  }

  return {
    provider: message.provider,
    model: message.model,
    inputTokens: message.usage.input,
    outputTokens: message.usage.output,
    totalTokens: message.usage.totalTokens,
    estimatedCost: message.usage.cost.total,
    toolCalls: toolCallCount > 0 ? toolCallCount : undefined,
    metadata: {
      api: message.api,
      cacheReadTokens: message.usage.cacheRead,
      cacheWriteTokens: message.usage.cacheWrite,
      inputCost: message.usage.cost.input,
      outputCost: message.usage.cost.output,
      cacheReadCost: message.usage.cost.cacheRead,
      cacheWriteCost: message.usage.cost.cacheWrite,
    },
  };
}

function resolvePiAiAgentErrors(
  message: AssistantMessage | undefined,
  toolCalls: ToolCallRecord[],
): Array<Record<string, JsonValue>> {
  const errors: Array<Record<string, JsonValue>> = toolCalls.flatMap((call) => {
    if (!call.error) {
      return [];
    }

    return [
      {
        type: call.error.type ?? "ToolError",
        message: call.error.message,
        toolName: call.name,
      } satisfies Record<string, JsonValue>,
    ];
  });

  if (message?.stopReason === "error" || message?.stopReason === "aborted") {
    errors.push({
      type: "PiAiAgentError",
      message:
        message.errorMessage ?? `Agent stopped with ${message.stopReason}`,
      stopReason: message.stopReason,
    });
  }

  return errors;
}

function validateOptions<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>) {
  const hasAgent = hasAgentSource(options);
  const hasTask = typeof (options as { task?: unknown }).task === "function";

  if (hasAgent && hasTask) {
    throw new Error(
      "piAiHarness accepts either agent or task, not both. Use agent for a pi-agent-core Agent or run(input, runtime) object, and task only for a custom entrypoint.",
    );
  }

  if (!hasAgent && !hasTask) {
    throw new Error(
      "piAiHarness requires either agent or task. Use agent for a pi-agent-core Agent or run(input, runtime) object, and task only for a custom entrypoint.",
    );
  }
}

function hasAgentSource<
  TAgent,
  TInput,
  TCase extends HarnessCase<TInput>,
  TResult,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  options: PiAiHarnessOptions<TAgent, TInput, TCase, TResult, TTools>,
): options is PiAiHarnessBaseOptions<TAgent, TInput, TCase, TResult, TTools> & {
  agent: AgentSource<TAgent>;
} {
  return "agent" in options && options.agent !== undefined;
}

async function resolveAgentSource<TAgent>(
  agent: AgentSource<TAgent>,
): Promise<TAgent> {
  if (typeof agent === "function" && !hasCallableMethod(agent, "run")) {
    return (agent as () => MaybePromise<TAgent>)();
  }

  return agent as TAgent;
}

function isPiAiAgentInstance(value: unknown): value is PiAiAgentInstance {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    prompt?: unknown;
    reset?: unknown;
    state?: {
      tools?: unknown;
      messages?: unknown;
    };
  };

  return (
    typeof candidate.prompt === "function" &&
    typeof candidate.reset === "function" &&
    Boolean(candidate.state) &&
    Array.isArray(candidate.state?.tools) &&
    Array.isArray(candidate.state?.messages)
  );
}

function isAgentToolArray<TInput, TCase extends HarnessCase<TInput>>(
  value: unknown,
): value is PiAiAgentTools<TInput, TCase> {
  return (
    Array.isArray(value) &&
    value.every(
      (tool) =>
        tool &&
        typeof tool === "object" &&
        "name" in tool &&
        "execute" in tool &&
        typeof (tool as { execute?: unknown }).execute === "function",
    )
  );
}

function getRuntimeToolset<
  TInput,
  TCase extends HarnessCase<TInput>,
  TTools extends PiAiToolset<TInput, TCase>,
>(
  tools: TTools | PiAiAgentTools<TInput, TCase> | undefined,
): TTools | undefined {
  return isAgentToolArray(tools) ? undefined : (tools as TTools | undefined);
}

function isPiAiNativeAgentRunResult(
  result: unknown,
): result is PiAiNativeAgentRunResult {
  return Boolean(
    result &&
      typeof result === "object" &&
      (result as { [piAiAgentResultSymbol]?: unknown })[
        piAiAgentResultSymbol
      ] === true,
  );
}

function getResultToolCallCount(
  result: unknown,
  runtimeToolCalls: ToolCallRecord[],
) {
  if (isPiAiNativeAgentRunResult(result)) {
    return result.toolCalls.length;
  }

  return runtimeToolCalls.length;
}

function getResultConvenience(
  result: unknown,
  runtimeToolCalls: ToolCallRecord[],
): Pick<
  PiAiHarnessResultArgs<unknown, unknown, HarnessCase<unknown>, unknown, any>,
  "outputText" | "finalMessage" | "messages" | "toolCalls"
> {
  if (isPiAiNativeAgentRunResult(result)) {
    return {
      outputText: result.outputText,
      finalMessage: result.finalMessage,
      messages: result.messages,
      toolCalls: result.toolCalls,
    };
  }

  return {
    outputText: resolveResultOutputText(result),
    toolCalls: runtimeToolCalls,
  };
}

function isPiAiUserMessage(message: AgentMessage): message is UserMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    "role" in message &&
    (message as { role?: unknown }).role === "user"
  );
}

function isPiAiAssistantMessage(
  message: AgentMessage,
): message is AssistantMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    "role" in message &&
    (message as { role?: unknown }).role === "assistant"
  );
}

function isPiAiToolResultMessage(
  message: AgentMessage,
): message is ToolResultMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    "role" in message &&
    (message as { role?: unknown }).role === "toolResult"
  );
}

function getFinalAssistantMessage(
  messages: AgentMessage[],
): AssistantMessage | undefined {
  return [...messages].reverse().find(isPiAiAssistantMessage);
}

function toPromptInput(input: unknown) {
  if (typeof input === "string") {
    return input;
  }

  const normalized = normalizeContent(input);
  return typeof normalized === "string"
    ? normalized
    : JSON.stringify(normalized);
}

function normalizeAgentToolArguments(args: unknown): Record<string, JsonValue> {
  const normalized = toJsonValue(args);

  if (
    normalized &&
    typeof normalized === "object" &&
    !Array.isArray(normalized)
  ) {
    return normalized;
  }

  return {
    value: normalized ?? String(args),
  };
}

function serializeAgentToolReplayResult(
  result: AgentToolResult<unknown>,
): JsonValue {
  return normalizeContent(result);
}

function deserializeAgentToolReplayResult(
  value: JsonValue,
): AgentToolResult<JsonValue> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.content)
  ) {
    return value as unknown as AgentToolResult<JsonValue>;
  }

  return {
    content: [
      {
        type: "text",
        text: stringifyJsonValue(value),
      },
    ],
    details: value,
  };
}

function serializeAgentToolRecordResult(
  result: AgentToolResult<unknown>,
): JsonValue {
  const details = toJsonValue(result.details);
  if (details !== undefined) {
    return details;
  }

  return resolveAgentToolResultContent(result);
}

function resolveAgentToolResultMessageContent(
  message: ToolResultMessage,
): JsonValue {
  const details = toJsonValue(message.details);
  if (details !== undefined) {
    return details;
  }

  return resolveAgentToolResultContent(message);
}

function resolveAgentToolResultContent(result: {
  content: AgentToolResult<unknown>["content"];
}): JsonValue {
  const text = result.content
    .filter(
      (
        block,
      ): block is Extract<
        AgentToolResult<unknown>["content"][number],
        { type: "text" }
      > => block.type === "text",
    )
    .map((block) => block.text)
    .join("")
    .trim();

  if (text.length > 0) {
    return text;
  }

  return normalizeContent(result.content);
}

function stringifyJsonValue(value: JsonValue) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function createRuntime<
  TInput,
  TCase extends HarnessCase<TInput>,
  TTools extends PiAiToolset<TInput, TCase>,
>({
  input,
  context,
  tools,
  messages,
}: {
  input: TInput;
  context: HarnessContext<TCase>;
  tools: TTools | undefined;
  messages: NormalizedMessage[];
}): PiAiRuntimeExecution<TTools, TInput, TCase> {
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
          caseData: context.caseData,
          signal: context.signal,
          setArtifact: context.setArtifact,
        } satisfies PiAiToolContext<TInput, TCase>;

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
  ) as unknown as PiAiRuntime<TTools, TInput, TCase>["tools"];

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
    "outputText",
    "text",
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

function resolveResultOutputText(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return typeof result === "string" ? result : undefined;
  }

  const value =
    (result as Record<string, unknown>).outputText ??
    (result as Record<string, unknown>).text;

  return typeof value === "string" ? value : undefined;
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
    outputText:
      typeof output === "string" ? output : resolveResultOutputText(result),
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

function getAssistantText(message: AssistantMessage) {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

async function executeToolWithReplay<
  TArgs extends Record<string, JsonValue>,
  TResult extends JsonValue,
  TInput,
  TCase extends HarnessCase<TInput>,
>({
  toolName,
  tool,
  args,
  context,
}: {
  toolName: string;
  tool: PiAiToolDefinition<TArgs, TResult, TInput, TCase>;
  args: TArgs;
  context: PiAiToolContext<TInput, TCase>;
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
