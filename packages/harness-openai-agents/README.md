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
import {
  createJudge,
  describeEval,
  toolCalls,
  type JudgeContext,
} from "vitest-evals";

const harness = openaiAgentsHarness({
  agent: () => createClassifierAgent(),
  runner: () =>
    new Runner({
      modelProvider,
      tracingDisabled: true,
    }),
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
  agent: () => createClassifierAgent(),
  runner: () => new Runner({ modelProvider, tracingDisabled: true }),
  run: async ({ agent, input, runner, runOptions }) => {
    const result = await runBottleClassifier({
      agent,
      runner,
      input,
      runOptions,
    });

    return {
      output: result.classification,
    };
  },
});
```

`agent` and `runner` can be objects or per-run factories. An `agent` factory
receives the per-run input and harness context before the adapter instruments
local function tools. Use that when an agent needs scenario-specific tool
closures, instructions, or metadata while staying on the native replay path:

```ts
const harness = openaiAgentsHarness({
  agent: ({ input, context }) =>
    createClassifierAgent({
      bottleId: parseBottleId(input),
      metadata: context.metadata,
    }),
  runner: () => new Runner({ modelProvider, tracingDisabled: true }),
  toolReplay: {
    lookup_bottle: true,
  },
});
```

`run` executes the OpenAI agent under test. Judges are created separately; keep
judge prompts and model calls in the judge instead of putting a judge model
call on the app harness.

```ts
const ClassificationJudge = createJudge(
  "ClassificationJudge",
  async (ctx: JudgeContext<string, Classification>) => {
    const result = await judgeRunner
      .run(judgeAgent, formatJudgePrompt(ctx))
      .then((result) => resolveResultText(result));

    return parseJudgeVerdict(result);
  },
);
```

The adapter provides:

- native `Runner.run(agent, input, options)` execution
- support for existing agents/runners or per-run `agent` and `runner` factories
- a `run` escape hatch for app-specific entrypoints
- normalized assistant output, messages, tool calls, tool results, usage,
  timings, errors, and replay-friendly metadata
- app-facing `run.output` for typed assertions and judges
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
  agent: () => new Agent({ name: "classifier", tools: [lookupBottle] }),
  runner: () => new Runner({ modelProvider, tracingDisabled: true }),
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
