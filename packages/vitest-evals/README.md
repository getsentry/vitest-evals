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
- `await expect(value).toSatisfyJudge(judge, context)` runs an explicit judge
  without rerunning the harness

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
  data: async () => [
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
  test: async ({ run, session, caseData }) => {
    expect(run.output).toMatchObject({ status: caseData.expectedStatus });
    expect(toolCalls(session).map((call) => call.name)).toEqual(
      caseData.expectedTools,
    );

    await expect(run.output).toSatisfyJudge(StructuredOutputJudge(), {
      rawInput: caseData.input,
      caseData,
      run,
      session,
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

For an existing Pi Mono agent, the intended contract is:

- pass the per-test agent factory with `createAgent`
- pass the tool/runtime definitions the harness should wrap
- optionally pass `run` when the agent's entrypoint is not
  `run(input, runtime)`
- optionally pass `output` when the agent returns a domain object that needs a
  custom projection

The harness owns normalization, diagnostics, tool capture, replay plumbing, and
reporter-facing artifacts. Your agent just needs an execution seam where those
wrapped runtime pieces can be injected.

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
