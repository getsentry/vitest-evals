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
- named eval tests inside the suite callback
- `harness.run(input, context)`
- normalized run/session artifacts
- optional judges and explicit Vitest assertions

That means the harness replaces `task` as the primary extension point.
The user should not have to manually transform provider or framework output
inside every test file.

The user still gets a task-shaped entrypoint when they need one. First-party
harnesses expose `task: ({ input }) => ...` as the place to call an existing
custom app entrypoint. Use `agent` for the zero-glue native agent path or
`task` for a custom entrypoint; examples should not require both at once.

## What The User Wires Up

For an existing agent, the user should only need to supply:

- the existing app or agent instance, or a factory that creates it per test
- the normal entrypoint for running one eval task
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
2. For each eval test, core creates a `HarnessContext` containing replay policy,
   artifact hooks, and reporter plumbing.
3. The harness creates or receives the existing agent/application instance.
4. The harness runs the application with the test input and any injected test
   dependencies.
5. The harness captures runtime events and converts them into a normalized
   session.
6. The harness returns `HarnessRun`, including `run.output`, diagnostics, and
   any artifacts.
7. Core runs suite-level judges and the explicit eval test callback against that
   normalized result.

The harness runs the system once. Judges and assertions consume the recorded
result rather than re-executing the agent.

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
    harness: piAiHarness(createRefundAgent),
  },
  (it) => {
    it("approves refundable invoice", async ({ agent, run }) => {
      const result = await run("Refund invoice inv_123");
      const calls = toolCalls(result.session);

      expect(agent).toBeDefined();
      expect(calls.map((call) => call.name)).toEqual([
        "lookupInvoice",
        "createRefund",
      ]);
    });
  },
);
```

The important behavior is:

- the user passes their existing `pi-agent-core` agent through the harness setup
- each eval test calls the instrumented `run(input)` fixture where execution
  should happen
- the harness wraps the agent's native `AgentTool[]` for trace and replay
- the agent executes normally
- the harness returns both the domain result and the normalized trace

## Zero-Glue Path vs Escape Hatch

The built-in harness should support two authoring levels.

The default path should be close to zero glue for standard apps:

```ts
harness: piAiHarness(createRefundAgent);
```

That path should work for a normal `Agent` that already owns normal
`AgentTool[]` in `state.tools`.

There should also be an explicit escape hatch for applications with a custom
entrypoint or custom result shape:

```ts
harness: piAiHarness({
  task: async ({ input }) => {
    const agent = createRefundAgent();
    await agent.prompt(input);
    return {
      outputText: getFinalText(agent.state.messages),
    };
  },
});
```

This is the right place for customization. The user should not need to
re-implement normalization.

## Spec Changes To Make Explicit

Issue `#39` should say these points plainly:

- A harness replaces `task` as the main runtime contract.
- A built-in harness is responsible for instrumentation and normalization, not
  just judge input preparation.
- A suite executes the harness once per eval test and reuses that run for
  judges and explicit assertions.
- `run.output` is the app-facing assertion surface, while the normalized session
  trace is the framework-facing reporting surface.
- Existing agents still need a supported injection or observation seam for
  tools, models, or runtime events.
- Built-in harnesses should offer a zero-glue default path plus an escape hatch
  for custom execution and output mapping.
