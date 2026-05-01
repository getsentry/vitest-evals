# @vitest-evals/harness-pi-ai

`pi-ai`-focused harness adapter for `vitest-evals`.

## Install

```sh
npm install -D vitest-evals @vitest-evals/harness-pi-ai
```

## Usage

```ts
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { createRefundAgent } from "@demo/foobar";

const harness = piAiHarness(createRefundAgent);
```

`createRefundAgent` is a normal `pi-agent-core` factory. The harness wraps the
agent's existing `state.tools` for normalized tool-call records and replay,
then restores the agent's tool state after each run.

```ts
import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import { Type, getModel } from "@mariozechner/pi-ai";

type ReplayableAgentTool = AgentTool<any, any> & {
  replay?: boolean;
};

export const refundTools = [
  {
    name: "lookupInvoice",
    label: "Lookup Invoice",
    description: "Look up invoice details.",
    parameters: Type.Object({
      invoiceId: Type.String(),
    }),
    replay: true,
    execute: async (_toolCallId, args) => {
      const invoice = await lookupInvoice(args);
      return {
        content: [{ type: "text", text: JSON.stringify(invoice) }],
        details: invoice,
      };
    },
  },
] satisfies ReplayableAgentTool[];

export function createRefundAgent() {
  return new Agent({
    initialState: {
      systemPrompt: REFUND_SYSTEM_PROMPT,
      model: getModel("anthropic", "claude-sonnet-4-5"),
      tools: refundTools,
    },
  });
}
```

Judges run through the Vitest matcher, for example
`await expect(result).toBeJudged(RefundQualityJudge)`, and receive the
harness-provided `harness.prompt(...)` helper. LLM-as-judge rubrics can call a
simple prompt abstraction instead of wiring provider API calls in every test.

If your existing `pi-ai` agent needs a custom entrypoint, wire that task-shaped
function directly:

```ts
const harness = piAiHarness({
  task: async ({ input }) => {
    const agent = createRefundAgent();
    await agent.prompt(input);
    return {
      outputText: getFinalText(agent.state.messages),
    };
  },
});
```

If the agent already implements `run(input, runtime)`, pass it as `agent` and
the harness will call that method automatically. Use `task` only when the app
needs a custom entrypoint.

The adapter provides:

- native `pi-agent-core` `Agent` and `AgentTool[]` instrumentation
- a runtime/tool injection seam for custom entrypoints
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
const tools = [
  {
    name: "lookupInvoice",
    label: "Lookup Invoice",
    description: "Look up invoice details.",
    parameters: Type.Object({
      invoiceId: Type.String(),
    }),
    replay: true,
    execute: async (_toolCallId, { invoiceId }) => {
      const invoice = await fetchInvoice(invoiceId);
      return {
        content: [{ type: "text", text: JSON.stringify(invoice) }],
        details: invoice,
      };
    },
  },
];
```

Supported modes:

- `off`: never read or write recordings
- `auto`: replay when present, otherwise call live and write a recording
- `strict`: require an existing recording and fail if it is missing
- `record`: always call live and overwrite the recording
