# vitest-evals

Harness-first integration testing for AI applications on top of Vitest.

## Install

```sh
npm install -D vitest-evals
```

Install a first-party harness package for the runtime you want to test:

```sh
npm install -D @vitest-evals/harness-pi-ai
```

## Core Model

- `describeEval(...)` binds exactly one harness to a suite
- the suite callback defines individual eval tests with Vitest-style names
- the harness executes the system under test and returns a normalized
  `HarnessRun`
- `run.output` is the application-facing result you assert on
- `run.session` is the canonical JSON-serializable trace used for reporting,
  tool assertions, replay metadata, and generic judges
- each eval test gets an instrumented `run(input)` fixture
- optional judges can score the same recorded run when reusable or semantic
  evaluation is useful

## Harness Example

```ts
import { expect } from "vitest";
import { createRefundAgent } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, toolCalls } from "vitest-evals";

describeEval(
  "refund agent",
  {
    harness: piAiHarness(createRefundAgent),
  },
  (it) => {
    it("approves refundable invoice", async ({ agent, run }) => {
      const result = await run("Refund invoice inv_123");

      expect(agent).toBeDefined();
      expect(result.session.outputText).toContain('"status":"approved"');
      expect(toolCalls(result.session).map((call) => call.name)).toEqual(
        ["lookupInvoice", "createRefund"],
      );
      expect(result.usage.totalTokens).toBeGreaterThan(0);
    });
  },
);
```

Harness-backed suites should show the configured runtime integration point, not
an opaque placeholder. In practice that means the harness setup includes the
agent and any required tool/runtime configuration, while each eval test owns
the user-facing task input and assertions.

## Existing Agents

For an existing `pi-ai` agent, the intended contract is:

- pass `agent` as a `pi-agent-core` `Agent` instance or factory
- pass native `AgentTool[]` when the harness should wrap tools for trace and
  replay; if the agent already has tools in state, this is optional
- optionally pass `output` when the agent returns a domain object that needs a
  custom projection
- pass `task` only when you need to call a custom entrypoint yourself

The harness owns normalization, diagnostics, tool capture, replay plumbing, and
reporter-facing artifacts. Individual eval tests stay small: they call
`run(input)`, assert on `result.output`, inspect `result.session`, and use
`result.usage` or other metadata when useful.

When you need to pass scenario data to automatic judges or future reporter
extensions, put it under `metadata` so top-level run options stay reserved for
framework behavior:

```ts
await run("Refund invoice inv_404", {
  metadata: {
    scenario: "non-refundable invoice",
  },
});
```

```ts
const harness = piAiHarness(createRefundAgent);
```

For custom entrypoints:

```ts
const harness = piAiHarness({
  task: async ({ input }) => {
    const agent = createRefundAgent();
    await agent.prompt(input);
    return {
      outputText: getFinalText(agent.state.messages),
    };
  },
  output: ({ outputText }) => parseRefundDecision(outputText ?? ""),
});
```

## Legacy Compatibility

The root package is harness-first. Legacy scorer-first suites and
`evaluate(...)` now live under `vitest-evals/legacy`.

```ts
import {
  describeEval,
  StructuredOutputScorer,
  ToolCallScorer,
} from "vitest-evals/legacy";
```

Use the legacy entrypoint for older suites. Use the root entrypoint for new
harness-backed suites.

Judges are optional. Inside an eval test, call `result.judge(...)` when you
want a reusable score, a semantic or LLM-backed rubric, or score details in the
report. Judges consume the recorded result from `run(...)`; they do not execute
the agent again. Harness adapters can provide `harness.prompt(...)`, so
LLM-as-judge provider setup lives with the harness runtime rather than inside
every eval test.

For lower-level cases, the matcher still exists as
`await expect(value).toSatisfyJudge(judge, context)`.

If you are writing a custom judge, wrap it with `judge(...)` so reporter output
uses a stable label:

```ts
import { judge } from "vitest-evals";

const RefundJudge = judge("RefundJudge", async (opts) => {
  return {
    score: opts.output.includes('"status":"approved"') ? 1 : 0,
  };
});
```
