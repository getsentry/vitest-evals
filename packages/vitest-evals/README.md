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
import { createRefundAgent, foobarTools } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, toolCalls } from "vitest-evals";

describeEval(
  "refund agent",
  {
    harness: piAiHarness({
      agent: createRefundAgent,
      tools: foobarTools,
    }),
  },
  (it) => {
    it("approves refundable invoice", async ({ agent, run }) => {
      const result = await run("Refund invoice inv_123");

      expect(agent).toBeDefined();
      expect(result.output).toMatchObject({
        status: "approved",
      });
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

- pass `agent` when the app already exposes `run(input, runtime)`; `agent` can
  be an instance or a factory function
- pass `task` when you need to call a custom entrypoint yourself
- pass the tool/runtime definitions the harness should wrap
- optionally pass `output` when the agent returns a domain object that needs a
  custom projection

The harness owns normalization, diagnostics, tool capture, replay plumbing, and
reporter-facing artifacts. Individual eval tests stay small: they call
`run(input)`, assert on `result.output`, inspect `result.session`, and use
`result.usage` or other metadata when useful.

```ts
const harness = piAiHarness({
  agent: createRefundAgent,
  tools: foobarTools,
});
```

For custom entrypoints:

```ts
const harness = piAiHarness({
  task: ({ input, runtime }) => createRefundAgent().execute(input, runtime),
  tools: foobarTools,
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

Judges are optional. Inside an eval test, call `judge(...)` when you want a
reusable score, a semantic or LLM-backed rubric, or score details in the
report. Judges consume the recorded result from `run(...)`; they do not execute
the agent again.

For lower-level cases, the matcher still exists as
`await expect(value).toSatisfyJudge(judge, context)`.

If you are writing a custom judge, wrap it with `namedJudge(...)` so reporter
output uses a stable label:

```ts
import { namedJudge } from "vitest-evals";

const RefundJudge = namedJudge("RefundJudge", async (opts) => {
  return {
    score: opts.output.includes('"status":"approved"') ? 1 : 0,
  };
});
```
