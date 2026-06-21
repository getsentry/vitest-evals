# Harness Normalization Patterns

This document describes the internal normalization target for harness packages.
Application authors should not need to manually transform provider responses in
every test file. First-party harness packages should do that work once and
return a normalized `HarnessRun`.

## Normalized Targets

The important normalized types are:

```ts
type ToolCallRecord = {
  id?: string;
  name: string;
  arguments?: Record<string, JsonValue>;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  metadata?: Record<string, JsonValue>;
};

type NormalizedToolResultMessage = {
  role: "tool";
  toolCallId: string;
  name?: string;
  content?: JsonValue;
  error?: {
    message: string;
    type?: string;
  };
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  metadata?: Record<string, JsonValue>;
};

type NormalizedSession = {
  messages: NormalizedMessage[];
  provider?: string;
  model?: string;
  metadata?: Record<string, JsonValue>;
};

type HarnessRun<TOutput extends JsonValue | undefined = JsonValue | undefined> = (
  undefined extends TOutput ? { output?: TOutput } : { output: TOutput }
) & {
  session: NormalizedSession;
  usage: UsageSummary;
  timings?: TimingSummary;
  artifacts?: Record<string, JsonValue>;
  traces?: NormalizedTrace[];
  errors: Array<Record<string, JsonValue>>;
};
```

## Design Rules

Harness adapters should:

- keep the stored session JSON-serializable
- normalize assistant tool-call requests into `ToolCallRecord`
- normalize completed or failed tool executions into separate `role: "tool"`
  messages with `toolCallId`
- treat the transcript as the source for tool-call assertions; traces are
  optional operational enrichment, not a fallback source for messages or tools
- preserve provider tool-call ids when providers expose them; adapters that
  execute tools themselves should create runtime-local ids so request/result
  transcript messages remain unambiguous
- preserve the application-facing result separately in `run.output`
- attach provider/model and stable usage data when available
- keep provider-specific cost estimates in `usage.metadata`, not as normalized
  usage fields
- attach replay/cache metadata in the tool record metadata rather than in
  provider-specific side channels

Harness adapters should not require end users to manually flatten provider
events just to write assertions.

## Minimal Adapter Example

```ts
function normalizeProviderStep(step: ProviderStep): ToolCallRecord[] {
  return (step.toolCalls ?? []).map((call) => ({
    id: call.id,
    name: call.name,
    arguments: toJsonRecord(call.arguments),
    durationMs: call.durationMs,
  }));
}

function normalizeSession(input: string, result: ProviderResult): NormalizedSession {
  const messages: NormalizedMessage[] = [{ role: "user", content: input }];

  for (const step of result.steps) {
    messages.push({
      role: "assistant",
      content: step.text,
      toolCalls: normalizeProviderStep(step),
    });

    for (const toolResult of step.toolResults ?? []) {
      messages.push({
        role: "tool",
        toolCallId: toolResult.toolCallId,
        name: toolResult.name,
        ...(toolResult.error
          ? {
              error: {
                message: String(toolResult.error.message),
                type: toolResult.error.name,
              },
            }
          : { content: toJsonValue(toolResult.output) }),
      });
    }
  }

  return {
    messages,
    provider: result.provider,
    model: result.model,
  };
}
```

## First-Party Harness Responsibilities

### `@vitest-evals/harness-ai-sdk`

Normalizes AI SDK style `steps`, `toolCalls`, `toolResults`, and usage records
into the root session and run model.

### `@vitest-evals/harness-pi-ai`

Normalizes `pi-ai` style message and tool activity and wraps tools so replay
policy can be applied consistently.

## User-Facing Guidance

If you are writing a suite, prefer:

- `aiSdkHarness(...)`
- `piAiHarness(...)`

If you are building a new harness package, follow this normalization contract.
