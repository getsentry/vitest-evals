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
import {
  createJudge,
  describeEval,
  toolCalls,
  type JudgeContext,
} from "vitest-evals";

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
  run: ({ input, runtime }) =>
    generateText({
      model: openai("gpt-4o-mini"),
      prompt: input,
      tools: runtime.tools,
      stopWhen: stepCountIs(5),
    }),
  output: ({ result }) => parseRefundDecision(result.text),
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

If `run()` already returns `{ output }` or a full `HarnessRun`, that typed
output is used directly. The `output` selector above is only for the raw
`generateText(...)` result path where the adapter should keep AI SDK
diagnostics while projecting provider text into app output.

If your existing AI SDK app exposes its own entrypoint, wire that in directly:

```ts
const harness = aiSdkHarness({
  tools,
  run: ({ input, runtime }) => createRefundAgent().run(input, runtime),
});
```

If your app exposes an agent object instead, `agent` can be either that object
or a per-run factory. Factories receive the eval input and harness context so
input-dependent instructions, metadata, or seeded state do not require
side-channel setup:

```ts
const harness = aiSdkHarness({
  tools,
  agent: ({ input, context }) =>
    createRefundAgent({
      instructions: buildInstructions(input),
      metadata: context.metadata,
    }),
});
```

`run` executes the system under test. Judges are created separately; keep judge
prompts and model calls in the judge instead of putting a judge model call on
the app harness.

```ts
const FactualityJudge = createJudge(
  "FactualityJudge",
  async (ctx: JudgeContext<string, RefundDecision>) => {
    const verdict = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: formatJudgePrompt({
        input: ctx.input,
        output: ctx.output,
      }),
    }).then((result) => result.text);

    return parseJudgeVerdict(verdict);
  },
);
```

The adapter infers:

- normalized session and tool-call traces from AI SDK `steps`
- usage diagnostics from `totalUsage` / `usage`
- typed `run.output` from explicit `run()` results that return `output`, from
  common AI SDK provider fields such as `object` and `text`, or from a typed
  `output` selector when the app deliberately returns a raw provider result
- native app output is accepted only when it is already JSON-safe; arbitrary
  fields, primitive raw results, and non-JSON values require an explicit
  `output` selector
- replay/cassette metadata for local tools configured with `toolReplay`

See the workspace demo app in `apps/demo-ai-sdk` and the RFC notes in
`docs/harness-first-rfc.md`.
