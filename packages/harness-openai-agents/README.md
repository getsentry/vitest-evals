# @vitest-evals/harness-openai-agents

`@openai/agents`-focused harness adapter for `vitest-evals`.

## Install

```sh
npm install -D @openai/agents vitest-evals @vitest-evals/harness-openai-agents
```

## Usage

```ts
import { expect } from "vitest";
import { Runner } from "@openai/agents";
import { openaiAgentsHarness } from "@vitest-evals/harness-openai-agents";
import { describeEval, toolCalls } from "vitest-evals";

const harness = openaiAgentsHarness({
  createAgent: () => createClassifierAgent(),
  createRunner: () =>
    new Runner({
      modelProvider,
      tracingDisabled: true,
    }),
  prompt: sharedJudgePrompt,
});

describeEval("classifier agent", { harness }, (it) => {
  it("classifies a bottle", async ({ run }) => {
    const result = await run("Classify bottle bt_123");

    expect(result.output).toMatchObject({
      label: "bourbon",
    });
    expect(toolCalls(result.session).map((call) => call.name)).toContain(
      "lookup_bottle",
    );
  });
});
```

The adapter calls `runner.run(agent, input, options)` by default. It forwards
the eval metadata, artifact helpers, and abort signal through the run options,
then normalizes the `RunResult` into the standard `HarnessRun` shape.

If your application has a custom entrypoint, wire it directly:

```ts
const harness = openaiAgentsHarness({
  createAgent: () => createClassifierAgent(),
  createRunner: () => new Runner({ modelProvider, tracingDisabled: true }),
  prompt: sharedJudgePrompt,
  run: ({ agent, input, runner, runOptions }) =>
    runBottleClassifier({ agent, runner, input, runOptions }),
  normalize: {
    output: ({ result }) => result.classification,
    outputText: ({ output }) => JSON.stringify(output),
  },
});
```

The required `prompt` callback is passed to harness-backed judges as
`JudgeContext.harness.prompt`, so rubric or factuality judges can share the
same provider/model setup as the suite harness.

The adapter provides:

- native `Runner.run(agent, input, options)` execution
- support for existing agents or per-test `createAgent()` factories
- a `run` escape hatch for app-specific entrypoints
- normalized assistant output, messages, tool calls, tool results, usage,
  timings, errors, and replay-friendly metadata
- app-facing `run.output` plus a deliberate `session.outputText` for judges
- opt-in replay metadata for local function tools configured with `toolReplay`

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

Then opt local function tools into replay by name:

```ts
import { Agent, Runner, tool } from "@openai/agents";
import { openaiAgentsHarness } from "@vitest-evals/harness-openai-agents";

const lookupBottle = tool({
  name: "lookup_bottle",
  description: "Look up bottle facts.",
  parameters: lookupBottleSchema,
  async execute({ bottleId }) {
    return fetchBottleFacts(bottleId);
  },
});

const harness = openaiAgentsHarness({
  createAgent: () => new Agent({ name: "classifier", tools: [lookupBottle] }),
  createRunner: () => new Runner({ modelProvider, tracingDisabled: true }),
  prompt: sharedJudgePrompt,
  toolReplay: {
    lookup_bottle: true,
  },
});
```

`toolReplay` is keyed by the OpenAI tool name. Values can be `true` or the
standard replay config object with `key`, `sanitize`, and `version` callbacks.

Hosted OpenAI tools are still normalized from the SDK run items when they are
present in `newItems`, but replay recording is only automatic for local
function tools that execute in the application process.

See the workspace demo app in `apps/demo-openai-agents`.
