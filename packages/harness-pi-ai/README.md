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
  tools: foobarTools,
});
```

If your existing Pi Mono agent already exposes its own entrypoint, wire that
up directly and let the harness provide the runtime seam:

```ts
const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  tools: foobarTools,
  run: ({ agent, input, runtime }) => agent.execute(input, runtime),
});
```

If the agent already implements `run(input, runtime)`, you can omit `run` and
the harness will call that method automatically.

The adapter provides:

- a runtime/tool injection seam for an existing agent
- normalized session capture from emitted events and wrapped tool calls
- usage/output inference for common `pi-ai`-style result objects

See the workspace demo in `apps/demo-pi`.
