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
  prompt: (input, options) =>
    generateText({
      model,
      system: options?.system,
      prompt: input,
      temperature: 0,
    }).then((result) => result.text),
  task: ({ input, runtime }) =>
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
| `prompt` | Required prompt seam for judges. |
| `task` | Use for custom execution such as `generateText(...)`; mutually exclusive with `agent`. |
| `agent` | Use for objects or factories exposing `run(input, runtime)` or `generate(input, runtime)`; mutually exclusive with `task`. |
| `tools` | Optional AI SDK toolset; wrapped before being passed to the task or agent. |
| `output` | Optional domain output selector; defaults to `output`, `object`, `experimental_output`, `result`, then `text`. |
| `session` | Optional override when inferred steps or traces are insufficient. |
| `usage`, `timings`, `errors` | Optional diagnostic overrides. |
| `name` | Optional reporter label; defaults to `ai-sdk`. |

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
| Direct `generateText(...)` or `generateObject(...)` call | `task` |
| Existing app wrapper with `run(input, runtime)` | `agent` |
| Provider result text needs parsing | `output` |
| App returns a full normalized run | Return `HarnessRun` and omit overrides. |
| App returns a run-like domain object | Use `output` and `session` overrides to avoid accidental pass-through. |
