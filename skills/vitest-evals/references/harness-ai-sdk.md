# AI SDK Harness

Open this for `ai` package integrations such as `generateText`, `generateObject`, tools, or AI SDK-style agents.

## Install And Import

```sh
npm install -D ai vitest-evals @vitest-evals/harness-ai-sdk
```

```ts
import { aiSdkHarness, type AiSdkToolset } from "@vitest-evals/harness-ai-sdk";
```

## Default `generateText` Pattern

```ts
import { generateText, stepCountIs } from "ai";

const harness = aiSdkHarness({
  tools,
  run: ({ input, runtime }) =>
    generateText({
      model,
      prompt: input,
      tools: runtime.tools,
      stopWhen: stepCountIs(5),
      temperature: 0,
    }),
  output: ({ result }) => parseDomainOutput(result.text),
});
```

## Options

| Option | Requirement |
|--------|-------------|
| `query` | Optional judge-model helper; only include it when real shared provider setup or credentials exist. |
| `run` | Use for custom execution such as `generateText(...)`; mutually exclusive with `agent`. |
| `agent` | Use for objects or per-run factories exposing `run(input, runtime)` or `generate(input, runtime)`; mutually exclusive with `run`. |
| `tools` | Optional AI SDK toolset; wrapped before being passed to the run callback or agent. |
| `output` | Optional typed domain output selector; defaults to `output`, `object`, `experimental_output`, `result`, then `text`. |
| `name` | Optional reporter label; defaults to `ai-sdk`. |

Agent factories receive `{ input, context }` before execution so apps can
derive instructions, metadata, or seeded state without side-channel setup.

When LLM-backed judges need shared provider setup, add a real `query` helper
that calls a separate judge model and forwards `options.signal` when supported:

```ts
const harness = aiSdkHarness({
  tools,
  run: ({ input, runtime }) =>
    generateText({
      model,
      prompt: input,
      tools: runtime.tools,
    }),
  query: (input, options) =>
    generateText({
      model: judgeModel,
      system: options?.system,
      prompt: input,
      abortSignal: options?.signal,
    }).then((result) => result.text),
});
```

## Normalization Behavior

- Reads `steps` to build assistant messages, tool calls, tool results, and metadata.
- Reads `totalUsage` or `usage`; if absent, aggregates step usage where available.
- Preserves provider and model from the last step when present.
- Uses `result.session` or `result.trace` directly when they already match `NormalizedSession`.
- Adds runtime tool calls that were executed through wrapped tools but did not appear in provider steps.
- Attaches partial runs to thrown errors so failed executions can still expose tool traces.

## Tool Rules

- Define tool inputs and outputs so they can be normalized to JSON.
- Set `replay: true` or a replay config only on tools with `execute(...)`.
- Provider-executed tools without `execute(...)` cannot be recorded automatically.
- Replay rejects async iterable tool outputs; return JSON-safe values for recorded tools.

## Use Cases

| Case | Prefer |
|------|--------|
| Direct `generateText(...)` or `generateObject(...)` call | `run` |
| Existing app wrapper with `run(input, runtime)` | `agent` |
| Provider result text needs parsing | `output` |
| App returns a full normalized run | Return `HarnessRun`. |
| App needs exact session/usage/errors control | Return `HarnessRun`. |
