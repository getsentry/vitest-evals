# vitest-evals

Harness-first integration testing for AI applications on top of Vitest.

## Install

```sh
npm install -D vitest-evals
```

## Core Concepts

- `describeEval(...)` can still run legacy scorer-first suites
- harness-backed suites treat the normalized run/session as the primary output
- `toolCalls(session)` exposes normalized tool activity for assertions and
  reporter output
- `userMessages(session)`, `assistantMessages(session)`, and
  `toolMessages(session)` expose common message access paths without forcing
  raw message-array plumbing
- `await expect(value).toSatisfyJudge(judge, context)` runs an explicit judge
  against the same normalized harness data used by automatic suite-level judges

## Harness Example

```ts
import {
  describeEval,
  StructuredOutputScorer,
  ToolCallScorer,
  toolCalls,
} from "vitest-evals";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { createRefundAgent, foobarTools } from "@demo/foobar";

describeEval("refund agent", {
  harness: piAiHarness({
    createAgent: () => createRefundAgent(),
    tools: foobarTools,
  }),
  judges: [
    ToolCallScorer(),
  ],
  data: async () => [{ input: "Refund invoice inv_123" }],
  test: async ({ run, session }) => {
    expect(run.output).toMatchObject({ status: "approved" });
    await expect(run.output).toSatisfyJudge(StructuredOutputScorer(), {
      rawInput: "Refund invoice inv_123",
      run,
      session,
      expected: {
        status: "approved",
      },
    });
    expect(toolCalls(session).map((call) => call.name)).toContain("lookupInvoice");
  },
});
```

Harness-backed suites should show the configured runtime seam, not an opaque
`myHarness` placeholder. In practice that means the example should include the
agent factory and any required tool/runtime configuration as part of the
harness setup.

`judges` run automatically for every case after the harness completes, and they
reuse the same normalized `run` and `session` objects that the optional `test`
callback receives. That keeps automatic scoring and explicit assertions on a
single execution path rather than rerunning the agent.

For an existing Pi Mono agent, the contract is:

- pass the per-test agent factory with `createAgent`
- pass the tool/runtime definitions the harness should wrap
- optionally pass `run` when the agent's entrypoint is not `run(input, runtime)`

The harness owns normalization and reporting. Your agent just needs an
execution seam where those wrapped runtime pieces can be injected.
