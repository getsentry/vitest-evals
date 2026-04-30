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
  result?: JsonValue;
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
  outputText?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, JsonValue>;
};

type HarnessRun = {
  session: NormalizedSession;
  output?: JsonValue;
  usage: UsageSummary;
  timings?: TimingSummary;
  artifacts?: Record<string, JsonValue>;
  errors: Array<Record<string, JsonValue>>;
};
```

## Design Rules

Harness adapters should:

- keep the stored session JSON-serializable
- normalize tool calls into `ToolCallRecord`
- preserve the application-facing result separately in `run.output`
- attach provider/model and usage data when available
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
    result: toJsonValue(call.result),
    error: call.error
      ? {
          message: String(call.error.message),
          type: call.error.name,
        }
      : undefined,
    durationMs: call.durationMs,
  }));
}

function normalizeSession(input: string, result: ProviderResult): NormalizedSession {
  return {
    messages: [
      { role: "user", content: input },
      ...result.steps.map((step) => ({
        role: "assistant",
        content: step.text,
        toolCalls: normalizeProviderStep(step),
      })),
    ],
    outputText: result.text,
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
