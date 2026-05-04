# @vitest-evals/harness-ai-sdk

`ai-sdk`-focused harness adapter for `vitest-evals`.

## Install

```sh
npm install -D ai vitest-evals @vitest-evals/harness-ai-sdk
```

## Usage

```ts
import { expect } from "vitest";
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { aiSdkHarness } from "@vitest-evals/harness-ai-sdk";
import { describeEval, toolCalls } from "vitest-evals";

const tools = {
  lookupInvoice: {
    inputSchema: lookupInvoiceSchema,
    execute: lookupInvoice,
  },
};

const harness = aiSdkHarness({
  tools,
  toolReplay: {
    lookupInvoice: true,
  },
  prompt: (input, options) =>
    generateText({
      model: openai("gpt-4o-mini"),
      system: options?.system,
      prompt: input,
    }).then((result) => result.text),
  task: ({ input, runtime }) =>
    generateText({
      model: openai("gpt-4o-mini"),
      prompt: input,
      tools: runtime.tools,
      stopWhen: stepCountIs(5),
    }),
});

describeEval("refund agent", { harness }, (it) => {
  it("approves a refundable invoice", async ({ run }) => {
    const result = await run("Refund invoice inv_123");

    expect(result.output).toMatchObject({
      status: "approved",
    });
    expect(toolCalls(result.session).map((call) => call.name)).toContain(
      "lookupInvoice",
    );
  });
});
```

If your existing AI SDK app exposes its own entrypoint, wire that in directly:

```ts
const harness = aiSdkHarness({
  tools,
  prompt: sharedJudgePrompt,
  task: ({ input, runtime }) => createRefundAgent().run(input, runtime),
});
```

If your app exposes an agent object instead, `agent` can be either that object
or a per-run factory. Factories receive the eval input and harness context so
input-dependent instructions, metadata, or seeded state do not require
side-channel setup:

```ts
const harness = aiSdkHarness({
  tools,
  prompt: sharedJudgePrompt,
  agent: ({ input, context }) =>
    createRefundAgent({
      instructions: buildInstructions(input),
      metadata: context.metadata,
    }),
});
```

The required `prompt` callback is passed to harness-backed judges as
`JudgeContext.harness.prompt`, which lets rubric or factuality judges share the
same provider/model configuration as the suite harness.

The adapter infers:

- normalized session and tool-call traces from AI SDK `steps`
- usage diagnostics from `totalUsage` / `usage`
- `run.output` from common AI SDK result fields such as `output`, `object`, and
  `text`
- replay/cassette metadata for local tools configured with `toolReplay`

See the workspace demo app in `apps/demo-ai-sdk` and the RFC notes in
`docs/harness-first-rfc.md`.
