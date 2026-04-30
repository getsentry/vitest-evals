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
- the harness executes the system under test and returns a normalized
  `HarnessRun`
- `run.output` is the application-facing result you assert on
- `run.session` is the canonical JSON-serializable trace used for reporting,
  tool assertions, replay metadata, and generic judges
- suite-level `judges` run automatically on that same `run` and `session`
- the `test` callback gets a pre-bound `judge(...)` helper for explicit judge
  assertions without rerunning the harness

## Harness Example

```ts
import { createRefundAgent, foobarTools } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
} from "vitest-evals";

describeEval("refund agent", {
  data: [
    {
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
      expectedTools: ["lookupInvoice", "createRefund"],
    },
  ],
  harness: piAiHarness({
    createAgent: () => createRefundAgent(),
    tools: foobarTools,
  }),
  judges: [ToolCallJudge()],
  test: async ({ run, session, caseData, judge }) => {
    expect(run.output).toMatchObject({ status: caseData.expectedStatus });
    expect(toolCalls(session).map((call) => call.name)).toEqual(
      caseData.expectedTools,
    );

    await judge(StructuredOutputJudge(), {
      expected: { status: caseData.expectedStatus },
    });
  },
});
```

Harness-backed suites should show the configured runtime seam, not an opaque
placeholder. In practice that means the example should include the agent
factory and any required tool/runtime configuration as part of the harness
setup.

## Existing Agents

For an existing `pi-ai` agent, the intended contract is:

- pass the tool/runtime definitions the harness should wrap
- pass `createAgent` when the agent already exposes `run(input, runtime)`, or
  pass `task` when you want to call a custom entrypoint yourself
- optionally pass `output` when the agent returns a domain object that needs a
  custom projection

The harness owns normalization, diagnostics, tool capture, replay plumbing, and
reporter-facing artifacts. The user-facing entrypoint can still be a simple
task-shaped function; it just receives the runtime pieces the harness needs to
wrap or observe.

## Legacy Compatibility

The root package is judge-first. Legacy scorer-first suites and `evaluate(...)`
now live under `vitest-evals/legacy`.

```ts
import {
  describeEval,
  StructuredOutputScorer,
  ToolCallScorer,
} from "vitest-evals/legacy";
```

Use the legacy entrypoint for older suites. Use the root entrypoint for new
harness-backed suites.

Inside a `test` callback you can call `judge(...)` directly:

```ts
test: async ({ judge, caseData }) => {
  await judge(StructuredOutputJudge(), {
    expected: { status: caseData.expectedStatus },
  });
}
```

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
