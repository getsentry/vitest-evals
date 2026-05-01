# @vitest-evals/harness-pi-ai

`pi-ai`-focused harness adapter for `vitest-evals`.

## Install

```sh
npm install -D vitest-evals @vitest-evals/harness-pi-ai
```

## Usage

```ts
import { piAiHarness } from "@vitest-evals/harness-pi-ai";

const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
});
```

If the agent already exposes its own tools, the adapter will infer them from
the agent by default. If your existing Pi Mono agent already exposes its own
entrypoint, wire that up directly and let the harness provide the runtime
seam:

```ts
const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  run: ({ agent, input, runtime }) => agent.execute(input, runtime),
});
```

If the agent already implements `run(input, runtime)`, you can omit `run` and
the harness will call that method automatically.

You should not need to configure output/session/usage basics for the normal Pi
path. Pass your agent and let the adapter infer both the toolset and the
normalized result from common Pi-style return values such as `decision` or
`output`.

If the agent completely hides its tools, `tools` still exists as a low-level
override:

```ts
const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  tools: hiddenAgentTools,
});
```

If you do have an unusual wrapper around the agent result, low-level
normalization hooks still exist under `normalize`:

```ts
const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  normalize: {
    output: ({ result }) => result.customDecision,
  },
});
```

The adapter provides:

- a runtime/tool injection seam for an existing agent
- normalized session capture from emitted events and wrapped tool calls
- usage/output inference for common `pi-ai`-style result objects
- opt-in tool replay/recording when the tool definition sets `replay: true`

See the workspace demo in `apps/demo-pi`.

## Tool Replay

Replay is configured globally in Vitest via environment variables:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      VITEST_EVALS_REPLAY_MODE: "auto",
      VITEST_EVALS_REPLAY_DIR: ".vitest-evals/recordings",
    },
  },
});
```

Then opt individual tools into recording/replay:

```ts
const tools = {
  lookupInvoice: {
    replay: true,
    execute: async ({ invoiceId }) => fetchInvoice(invoiceId),
  },
};
```

Supported modes:

- `off`: never read or write recordings
- `auto`: replay when present, otherwise call live and write a recording
- `strict`: require an existing recording and fail if it is missing
- `record`: always call live and overwrite the recording
