# @vitest-evals/harness-pi-ai

`pi-ai`-focused harness adapter for `vitest-evals`.

## Install

```sh
npm install -D vitest-evals @vitest-evals/harness-pi-ai
```

## Usage

```ts
import { expect } from "vitest";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, toolCalls } from "vitest-evals";

const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  toolReplay: {
    lookupInvoice: true,
  },
  prompt: sharedJudgePrompt,
});

describeEval("refund agent", { harness }, (it) => {
  it("approves a refundable invoice", async ({ run }) => {
    const result = await run("Refund invoice inv_123");

    expect(result.output).toMatchObject({
      status: "approved",
    });
    expect(toolCalls(result.session).map((call) => call.name)).toEqual([
      "lookupInvoice",
      "createRefund",
    ]);
  });
});
```

`prompt` gives rubric or factuality judges the same provider/model setup
through `JudgeContext.harness.prompt`.

If the agent already exposes its own tools, the adapter will infer them from
the agent by default. If your existing Pi Mono agent already exposes its own
entrypoint, wire that up directly and let the harness provide the runtime
seam:

```ts
const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  prompt: sharedJudgePrompt,
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
  prompt: sharedJudgePrompt,
  tools: hiddenAgentTools,
});
```

If you do have an unusual wrapper around the agent result, low-level
normalization hooks still exist under `normalize`:

```ts
const harness = piAiHarness({
  createAgent: () => createWrappedRefundAgent(),
  prompt: sharedJudgePrompt,
  run: ({ agent, input, runtime }) => agent.run(input, runtime),
  normalize: {
    output: ({ result }) => result.customDecision,
  },
});
```

The adapter provides:

- a runtime/tool injection seam for an existing agent
- a required prompt seam for LLM-backed judges
- normalized session capture from emitted events and wrapped tool calls
- usage/output inference for common `pi-ai`-style result objects
- opt-in tool replay/recording from harness-level `toolReplay`

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

Then opt individual tools into recording/replay from the harness:

```ts
const harness = piAiHarness({
  createAgent: () => createRefundAgent(),
  toolReplay: {
    lookupInvoice: true,
  },
  prompt: sharedJudgePrompt,
});
```

When an agent exposes both a native Pi tool and a runtime tool with the same
name, a native tool call records in its own cassette namespace. Runtime calls of
that same name are treated as implementation details while the native tool is
executing, so delegated runtime calls do not create duplicate trace entries or
overwrite the native recording.

Supported modes:

- `off`: never read or write recordings
- `auto`: replay when present, otherwise call live and write a recording
- `strict`: require an existing recording and fail if it is missing
- `record`: always call live and overwrite the recording
