# Harness-First RFC Notes

This document captures the design constraints behind issue `#39`.
The current branch now implements most of this harness-first shape, so treat
this file as design rationale and background, not the canonical API reference.

## Core Clarification

A harness is the runtime adapter for the system under test. It is not just a
judge helper.

In the current package, the center of gravity is:

- `data`
- `task(input)`
- `string | TaskResult`
- scorers

In the proposed model, the center of gravity becomes:

- exactly one `harness` per suite
- fixture-backed Vitest tests
- explicit `run(input, { metadata? })`
- normalized run/session artifacts
- optional judges and explicit Vitest assertions

That means the harness replaces `task` as the primary extension point.
The user should not have to manually transform provider or framework output
inside every test file.

## What The User Wires Up

For an existing agent, the user should only need to supply:

- the existing app or agent instance, or a factory that creates it per test
- the normal entrypoint for running one case
- any required test fixtures or setup
- an optional output selector when the app returns a domain object instead of a
  plain assistant string

The user should not have to:

- flatten provider events into our normalized shape by hand
- manually record tool calls for the reporter
- manually implement replay behavior for standard harnesses
- manually copy usage stats from the framework into scorer inputs

## What The Harness Owns

A built-in harness package should own the glue code for its target runtime.
For `pi-ai` or `ai-sdk`, that means the harness is responsible for:

- executing the application through its normal runtime
- installing instrumented tool wrappers so replay/VCR policy can apply
- observing framework events, messages, steps, tool calls, tool results, and
  errors
- normalizing those events into a JSON-serializable session shape
- extracting usage, timings, retry counts, cache hits, and other diagnostics
- returning a `HarnessRun` that core and reporters can consume directly

This is the point of the harness-first design: common frameworks should feel
like supported products, not examples users have to finish themselves.

## What The Application Still Must Expose

Built-in harnesses can remove most boilerplate, but they still need one seam
into the application.

An existing agent must allow at least one of the following:

- dependency injection for tools, model clients, or runtime services
- framework-level event hooks that the harness can subscribe to
- a wrapper around the agent's execution path where the harness can observe the
  underlying runtime

If an agent closes over global tools and model clients with no injection point
and no events, the harness cannot produce reliable traces or replay behavior.
That is an application integration constraint, not a reporter problem.

The spec should say this explicitly so "bring your existing agent" does not
sound more magical than it really is.

## Two Different Outputs

The spec should distinguish between:

- `run.output`: the application-facing result the test author wants to assert on
- the normalized assistant/session trace: the canonical record used for
  reporting, tool assertions, replay metadata, and generic judges

This matters for real apps because many agents do not naturally return a single
final string. They may return a domain object such as:

- `{ answer, citations }`
- `{ status, ticketId }`
- `{ messages, finalResponse, actions }`

The harness should preserve that value in `run.output` so direct assertions stay
natural. The harness should also normalize the conversation and final assistant
message separately so built-in judges and reporters still have a consistent
surface.

## Proposed Execution Flow

1. `describeEval` selects one harness for the suite.
2. Core overrides that harness onto a fixture-backed Vitest `it`.
3. A test calls `run(input, { metadata? })`.
4. Core creates a `HarnessContext` containing reporter plumbing, artifacts, and
   the test signal.
5. The harness creates or receives the existing agent/application instance.
6. The harness runs the application with the provided input and injected test
   dependencies.
7. The harness captures runtime events and converts them into a normalized
   session.
8. The harness returns `HarnessRun`, including `run.output`, diagnostics, and
   any artifacts.
9. Core stores that run on task metadata, runs any suite-level judges, and lets
   explicit assertions consume the same recorded result.

The harness runs the system once per explicit `run(...)` call. Judges and
assertions consume the recorded result rather than re-executing the agent.

## Illustrative `pi-ai` Wiring

For a user who already has a `pi-ai` agent, the desired path should look
roughly like this:

```ts
import { describeEval, toolCalls } from "vitest-evals";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { createRefundAgent } from "../src/refundAgent";

describeEval(
  "refund agent",
  {
    harness: piAiHarness({
      createAgent: () => createRefundAgent(),
      prompt: judgePrompt,
      run: ({ agent, input, runtime }) => agent.run(input, runtime),
    }),
  },
  (it) => {
    it("approves a refundable invoice", async ({ run }) => {
      const result = await run("Refund invoice inv_123");

      expect(result.output).toMatchObject({ status: "approved" });
      expect(toolCalls(result.session)).toContainEqual(
        expect.objectContaining({ name: "lookupInvoice" }),
      );
    });
  },
);
```

The important detail is not the exact option names above. Those are still
illustrative. The important behavior is:

- the user passes their existing agent through the harness
- the harness supplies the instrumented runtime pieces as `runtime`
- the agent executes normally
- the harness returns both the domain result and the normalized trace

## Zero-Glue Path vs Escape Hatch

The built-in harness should support two authoring levels.

The default path should be close to zero glue for standard apps:

```ts
describeEval("refund agent", {
  harness: piAiHarness({
    createAgent: () => createRefundAgent(),
    prompt: judgePrompt,
  }),
}, (it) => {
  it("approves a refundable invoice", async ({ run }) => {
    const result = await run("Refund invoice inv_123");
  });
});
```

That path should work when the runtime shape is conventional and the harness can
infer the execution contract.

There should also be an explicit escape hatch for applications with a custom
entrypoint or custom result shape:

```ts
describeEval("refund agent", {
  harness: piAiHarness({
    createAgent: () => createRefundAgent(),
    prompt: judgePrompt,
    run: ({ agent, input, runtime }) => agent.execute(input, runtime),
    normalize: {
      output: ({ result }) => result.decision,
    },
  }),
}, (it) => {
  it("approves a refundable invoice", async ({ run }) => {
    const result = await run("Refund invoice inv_123");
  });
});
```

This is the right place for customization. The user should not need to
re-implement normalization.

## Spec Changes To Make Explicit

Issue `#39` should say these points plainly:

- A harness replaces `task` as the main runtime contract.
- A built-in harness is responsible for instrumentation and normalization, not
  just judge input preparation.
- A suite binds one harness and lets tests call `run(...)` explicitly.
- Each `run(...)` executes the harness once and reuses that result for judges
  and explicit assertions.
- `run.output` is the app-facing assertion surface, while the normalized session
  trace is the framework-facing reporting surface.
- Existing agents still need a supported injection or observation seam for
  tools, models, or runtime events.
- Built-in harnesses should offer a zero-glue default path plus an escape hatch
  for custom execution and output mapping.
