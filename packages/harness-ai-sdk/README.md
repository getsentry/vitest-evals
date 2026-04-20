# @vitest-evals/harness-ai-sdk

`ai-sdk`-focused harness adapter for `vitest-evals`.

## Install

```sh
npm install -D ai vitest-evals @vitest-evals/harness-ai-sdk
```

## Usage

```ts
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { aiSdkHarness } from "@vitest-evals/harness-ai-sdk";

const harness = aiSdkHarness({
  run: ({ input }) =>
    generateText({
      model: openai("gpt-4o-mini"),
      prompt: input,
      tools: {
        lookupInvoice,
      },
      stopWhen: stepCountIs(5),
    }),
});
```

If your existing AI SDK app exposes its own entrypoint, wire that in directly:

```ts
const harness = aiSdkHarness({
  createAgent: () => createRefundAgent(),
  run: ({ agent, input }) => agent.run(input),
});
```

The adapter infers:

- normalized session and tool-call traces from AI SDK `steps`
- usage diagnostics from `totalUsage` / `usage`
- `run.output` from common AI SDK result fields such as `output`, `object`, and
  `text`

See the workspace RFC notes in `docs/harness-first-rfc.md`.
