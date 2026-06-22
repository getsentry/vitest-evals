# Harness Normalization Patterns

This document describes the internal normalization target for harness packages.
Application authors should not need to manually transform provider responses in
every test file. First-party harness packages should do that work once and
return a normalized `HarnessRun`.

## Normalized Targets

The important normalized types are:

```ts
type TranscriptEvent =
  | TranscriptMessageEvent
  | TranscriptToolCallEvent
  | TranscriptToolResultEvent;

type TranscriptMessageEvent = {
  type: "message";
  role: "system" | "user" | "assistant";
  content?: JsonValue;
  metadata?: Record<string, JsonValue>;
};

type TranscriptToolCallEvent = {
  type: "tool_call";
  id: string;
  name: string;
  arguments?: Record<string, JsonValue>;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  metadata?: Record<string, JsonValue>;
};

type TranscriptToolResultEvent = {
  type: "tool_result";
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
  events: TranscriptEvent[];
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

`NormalizedSession.events` is the stored contract. It is the only transcript
shape that reporters, judges, and assertion helpers should read. The flat event
stream keeps the transcript ordered without overloading an assistant message
with tool-request data that may or may not correspond to a provider's native
message format.

Harness adapters and `createHarness(...)` may accept either:

- normalized `events`, which are stored directly
- provider-style `messages`, including Chat Completions-style assistant
  `toolCalls` and separate `role: "tool"` results, which are normalized into
  events at the harness boundary

After that boundary, there is no `messages` fallback and no nested
`assistant.toolCalls` data in normalized run metadata.

Harness adapters should:

- keep the stored session JSON-serializable
- derive successful-run transcript events from one explicit source: returned
  normalized `events`, provider transcript data such as steps/run items, or a
  runtime event stream that the harness owns as the provider transcript
- normalize assistant/tool-call requests into `type: "tool_call"` events
- normalize completed, failed, or pending tool executions into
  `type: "tool_result"` events when a result exists
- treat the transcript as the source for tool-call assertions; traces are
  optional operational enrichment, not a fallback source for messages or tools
- keep wrapper bookkeeping out of successful transcripts unless the provider
  transcript already reported the same tool item and the wrapper only adds
  execution details such as replay metadata
- require custom run entrypoints that lack provider transcript data to return a
  normalized `session` explicitly
- preserve provider tool-call ids when providers expose them; adapters that
  execute tools themselves should create runtime-local ids so request/result
  transcript events remain unambiguous
- preserve the application-facing result separately in `run.output`
- attach provider/model and stable usage data when available
- keep provider-specific cost estimates in `usage.metadata`, not as normalized
  usage fields
- attach replay/cache metadata in the tool record metadata rather than in
  provider-specific side channels
- expose common assertion data through helpers such as `toolCalls(result)`,
  `userMessages(result)`, `assistantMessages(result)`, `toolMessages(result)`,
  and `spans(result)` instead of asking test authors to walk raw transcript
  events

Harness adapters should not require end users to manually flatten provider
payloads just to write assertions.

## Provider Shapes

OpenAI APIs illustrate why the input boundary is deliberately broader than the
stored normalized shape:

- Chat Completions represents tool requests as `assistant.tool_calls` and tool
  outputs as separate `role: "tool"` messages with `tool_call_id`.
- Responses and Realtime represent message, `function_call`, and
  `function_call_output` items as first-class conversation items.
- OpenAI Agents exposes run items such as `tool_call_item` and
  `tool_call_output_item`.

All of those shapes normalize into the same ordered event stream.

## Minimal Adapter Example

```ts
function normalizeSession(input: string, result: ProviderResult): NormalizedSession {
  const events: TranscriptEvent[] = [
    { type: "message", role: "user", content: input },
  ];

  for (const step of result.steps) {
    if (step.text) {
      events.push({
        type: "message",
        role: "assistant",
        content: step.text,
      });
    }

    for (const call of step.toolCalls ?? []) {
      events.push({
        type: "tool_call",
        id: call.id,
        name: call.name,
        arguments: toJsonRecord(call.arguments),
        durationMs: call.durationMs,
      });
    }

    for (const toolResult of step.toolResults ?? []) {
      events.push({
        type: "tool_result",
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
    events,
    provider: result.provider,
    model: result.model,
  };
}
```

For Chat Completions-style inputs, custom harness authors may still return
message-shaped data and let `createHarness(...)` normalize it:

```ts
return {
  output,
  messages: [
    { role: "user", content: input },
    {
      role: "assistant",
      content: step.text,
      toolCalls: [{ id: "call_lookup", name: "lookupInvoice", arguments }],
    },
    {
      role: "tool",
      toolCallId: "call_lookup",
      name: "lookupInvoice",
      content: toolOutput,
    },
  ],
};
```

## First-Party Harness Responsibilities

### `@vitest-evals/harness-ai-sdk`

Normalizes AI SDK style `steps`, `toolCalls`, `toolResults`, and usage records
into the root session and run model. Successful runs without AI SDK steps must
return a normalized `session` when tool-call assertions need transcript data.

### `@vitest-evals/harness-openai-agents`

Normalizes OpenAI Agents run items such as `newItems` and `output` into the root
session and run model. Runtime tool wrappers may enrich those run items with
execution/replay metadata. When a custom entrypoint returns no provider items,
runtime wrapper events are the transcript source for local tool activity.

### `@vitest-evals/harness-pi-ai`

Normalizes the Pi runtime event stream and wrapped Pi tool activity. In this
harness the runtime event stream is the transcript source because the adapter
owns that provider-facing event boundary.

## User-Facing Guidance

If you are writing a suite, prefer:

- `aiSdkHarness(...)`
- `piAiHarness(...)`

If you are building a new harness package, follow this normalization contract.
