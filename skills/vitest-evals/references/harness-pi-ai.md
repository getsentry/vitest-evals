# Pi AI Harness

Open this for Pi AI or Pi Mono-style agents.

## Install And Import

```sh
npm install -D vitest-evals @vitest-evals/harness-pi-ai
```

```ts
import { piAiHarness, type PiAiRuntime, type PiAiToolset } from "@vitest-evals/harness-pi-ai";
```

## Default Agent Pattern

```ts
const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  prompt: promptJudgeModel,
});
```

`createAgent` receives `{ input, context }` when per-run instructions, native
tool closures, metadata, or seeded artifacts are needed before instrumentation.

If the agent needs a custom entrypoint:

```ts
const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  prompt: promptJudgeModel,
  run: ({ agent, input, runtime }) => agent.execute(input, runtime),
  normalize: {
    output: ({ result }) => result.decision,
  },
});
```

## Options

| Option | Requirement |
|--------|-------------|
| `agent` | Existing instance used for runs. |
| `createAgent` | Factory for a fresh per-run agent; receives `{ input, context }`. |
| `prompt` | Required prompt seam for judges. |
| `run` | Optional custom execution; omitted when the agent exposes `run(input, runtime)`. |
| `tools` | Optional explicit `PiAiToolset`; use when the agent hides its tool surface. |
| `normalize.output` | Optional domain output selector; defaults to `output`, `decision`, `result`, then `final`. |
| `normalize.session` | Optional override when event capture is insufficient. |
| `normalize.usage`, `normalize.timings`, `normalize.errors` | Optional diagnostic overrides. |
| `name` | Optional reporter label; defaults to `pi-ai`. |

## Runtime Surface

`run` receives `{ agent, input, context, runtime }`.

| Runtime field | Use |
|---------------|-----|
| `runtime.tools` | Wrapped tool functions that record tool calls and replay metadata. |
| `runtime.events.system(...)` | Add a normalized system message. |
| `runtime.events.user(...)` | Add a normalized user message. |
| `runtime.events.assistant(...)` | Add the final assistant text or structured assistant content. |
| `runtime.events.tool(...)` | Add a tool message when the native agent produced one. |
| `runtime.signal` | Forward cancellation to the app when supported. |

## Tool Inference

- The harness looks for runtime toolsets on the agent and nested `agent`, `state`, or `initialState` objects.
- It also instruments native tool arrays with `{ name, execute }`.
- Instrumentation is restored after a run and reapplied after agent resets.
- Explicit `tools` overrides runtime tools but native tool tracing can still be captured.

## Normalization Behavior

- Starts sessions with a user message for the input.
- Uses recorded runtime events as normalized messages.
- Adds tool calls from wrapped runtime tools and native tool instrumentation.
- Reads usage from `usage` or `metrics`, and adds tool call counts when absent.
- Uses `result.session` or `result.trace` directly when they already match `NormalizedSession`.
- Attaches partial runs to thrown errors.

## Use Cases

| Case | Prefer |
|------|--------|
| Conventional agent with `run(input, runtime)` | `createAgent` plus `prompt` |
| Existing agent method named differently | Add `run` |
| Hidden tool surface | Add explicit `tools` |
| Wrapped result with domain object | Add `normalize.output` |
| Agent produces extra messages | Use `runtime.events.*` inside the app run path |
