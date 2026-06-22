# vitest-evals Architecture

## Overview

`vitest-evals` is organized around a harness-first execution model.
Vitest still runs the suite, but the primary contract is no longer
`input -> task -> scorer`. The primary contract is:

- one explicit `harness` per suite
- named eval tests that call the instrumented `run(input)` fixture
- one normalized `HarnessRun` per eval test
- optional normalized traces and spans on the harness run
- optional automatic `judges`
- optional explicit Vitest assertions over the returned result and session

Legacy scorer-first support still exists, but it lives under
`vitest-evals/legacy` and under `packages/vitest-evals/src/legacy/...`.

## Monorepo Layout

```text
packages/
  vitest-evals/
    src/
      harness.ts
      index.ts
      reporter.ts
      judges/
      legacy/
  core/
  harness-ai-sdk/
  harness-openai-agents/
  harness-pi-ai/
  github-reporter/
apps/
  demo-ai-sdk/
  demo-openai-agents/
  demo-pi/
```

## Vitest Package

### `packages/vitest-evals/src/harness.ts`

Defines the harness runtime integration and re-exports normalized model pieces
from `packages/core`:

- `Harness`
- `HarnessRun`
- `NormalizedSession`
- `TranscriptEvent`
- `TranscriptToolCallEvent`
- `TranscriptToolResultEvent`
- `UsageSummary`
- `NormalizedTrace` and `NormalizedSpan`
- helper accessors such as `toolCalls(result)`, `assistantMessages(result)`,
  and `spans(result)`

The normalized session model lives in `packages/core` and is intentionally
JSON-serializable so it can be persisted, attached to errors, and emitted by
reporters without custom serialization logic.

`NormalizedSession` stores one ordered transcript field: `events`. The stored
event stream is flat:

- `type: "message"` for system, user, and assistant content
- `type: "tool_call"` for a tool request
- `type: "tool_result"` for a completed or failed tool execution

This is the reporter and judge contract. Provider-shaped messages are allowed
only at harness input boundaries. For example, custom harnesses may return
Chat Completions-style `messages` with assistant `toolCalls` and `role: "tool"`
results, and first-party harnesses may consume provider message/run-item data,
but those shapes are normalized into `session.events` before storage. Downstream
code should not read both `messages` and `events`, and should not treat traces
as a transcript fallback.

Assertions and judges should use helper projections instead of inspecting raw
event internals unless the test is explicitly about transcript ordering:

- `toolCalls(result)` returns clean tool inputs/results/status for assertions
- `toolMessages(result)` returns normalized tool-result events
- `userMessages(result)` and `assistantMessages(result)` return message events
- `spans(result)` and related helpers return trace/span data only

Normalized traces are also JSON-serializable. First-party harnesses attach
native spans when provider/runtime data exposes real operations.
`createHarness(...)` attaches a fallback run span for custom harnesses that do
not return traces themselves. Span attributes include typed OpenTelemetry GenAI
semantic keys for common model, agent, tool, and token fields while still
allowing provider-specific attributes.

`UsageSummary` is intentionally limited to stable usage units such as tokens,
tool counts, retries, provider, and model. Provider-specific cost estimates are
not normalized because pricing semantics vary by runtime and can be stale; if a
harness needs to retain them, store them under `usage.metadata`.

### `packages/vitest-evals/src/index.ts`

Defines the harness-first public API:

- `describeEval(...)`
- `expect(...).toSatisfyJudge(...)`
- harness/judge types
- exports for built-in judges and harness helpers

The root `describeEval(...)` executes the harness exactly once per eval test.
Automatic judges and the per-test assertion callback reuse the same normalized
run.

### `packages/vitest-evals/src/judges/*`

Contains root judge helpers such as:

- `FactualityJudge`
- `ToolCallJudge`
- `StructuredOutputJudge`

`FactualityJudge` is a factuality judge over normalized
`input`/`output`/`expected` context. It uses the curried `runJudge` function
from `JudgeContext` when it needs an LLM call, so provider configuration stays
on the matcher, judge, or suite `judgeHarness`. The deterministic judges are
judge-shaped adapters over the legacy comparison logic so new suites can stay
on the harness-first surface while older matching behavior remains available.

Dedicated judge harnesses are separate from the app harness under test. They
adapt provider-specific judge-model configuration to the core judge prompt
contract, which lets one judge implementation run across multiple app
harnesses.

All judges receive `JudgeContext`, which carries normalized run/session data,
typed `input`, typed `output`, the configured app `harness`, and `runJudge`
when a judge harness is configured. The output is only optional when the
harness output type includes `undefined`. LLM-backed judges own their prompt,
rubric text, and parser; provider-specific model calls live in judge harness
adapters. Custom judges should use `createJudge("Name", assess)` for stable
reporter labels, or `createJudge({ name, judgeHarness, assess })` when the
judge should carry a reusable judge-side harness default.
`createJudgeHarness(...)` is the shared abstraction for judge-side provider
shims.

### `packages/vitest-evals/src/legacy/*`

Contains the compatibility layer for scorer-first suites:

- legacy `describeEval(...)`
- `toEval(...)`
- `evaluate(...)`
- scorer implementations and their tests

This keeps the root package surface clean without deleting older workflows.

### `packages/vitest-evals/src/reporter.ts`

Provides the custom Vitest reporter that reads normalized run metadata from
`task.meta` and renders:

- per-test pass/fail status
- duration
- usage summaries
- tool activity
- judge sub-results
- richer failure diagnostics

## Shared Core Package

`packages/core` owns dependency-light primitives shared by the Vitest
integration, GitHub reporter, and report UI. Its main entry stays browser-safe,
while `@vitest-evals/core/node` exposes filesystem helpers for local and CI
report consumers. It exports stable schemas, TypeScript types, and helpers for:

- JSON-safe values
- normalized harness runs, sessions, transcript-derived tool calls, usage,
  timings, traces, spans, span events, errors, and artifacts
- `task.meta.eval`
- `task.meta.harness`
- Vitest JSON reports
- a full-fidelity multi-run workspace model for rich report UIs
- path, glob, and directory resolution for Node report consumers

The schemas are tolerant of provider-specific JSON metadata, but the known
normalized fields are explicitly typed so the artifact contract can be shared
long term. Consumers that read report artifacts should validate and collect
through this package instead of duplicating Vitest JSON or metadata shapes.
Vitest lifecycle APIs such as `describeEval(...)`, matchers, and the terminal
reporter stay in `packages/vitest-evals`.

## Report UI

`packages/report-ui` is the implementation package behind `vitest-evals serve`,
the local browser surface for Vitest JSON artifacts. It accepts files, simple
globs, or directories; collects them through `@vitest-evals/core/node`; serves
the collected `ReportWorkspace` at `/data/workspace.json`; and renders a React
SPA for run summaries, eval cases, scores, harness output, sessions, tool
calls, and trace trees.

The React app consumes the shared `ReportWorkspace` schema from
`@vitest-evals/core` instead of inventing a UI-only data shape. Server-only
filesystem and HTTP behavior stays in `packages/report-ui` and the core Node
subpath.

## GitHub Reporting

`packages/github-reporter` is the implementation behind the native
`getsentry/vitest-evals` GitHub Action. It reads Vitest's
built-in JSON output through `packages/core` instead of attaching directly to
the Vitest reporter lifecycle. That JSON output includes each assertion's
`meta` field, so it preserves the normalized eval and harness metadata recorded
by the Vitest integration.

This split keeps the terminal reporter focused on local output and gives CI a
stable artifact to process:

1. Vitest runs evals and writes `--reporter=json` to `vitest-results.json`.
2. The GitHub reporter action reads one or more JSON result files.
3. It merges sharded reports when multiple result files are provided.
4. It writes an ASCII job summary to `GITHUB_STEP_SUMMARY`.
5. It emits terse workflow-command annotations for failed evals.
6. When explicitly configured, it publishes a separate GitHub Check Run.

JUnit XML can be emitted alongside JSON, but it is not used as the source of
truth for eval reporting because it does not carry the full harness metadata.

## Harness Lifecycle

For each eval test in a harness-backed suite:

1. `describeEval(...)` configures one instrumented harness for the suite.
2. The suite callback registers named eval tests.
3. The eval test calls `run(input)` at the point execution should happen.
4. The configured harness runs the system under test exactly once.
5. The harness returns a `HarnessRun` with `result.output`, `result.session`,
   `usage`, `timings`, `artifacts`, and `errors`.
6. Core stores that run on `task.meta.harness` for the reporter.
7. Automatic suite-level judges run against the normalized run/session pair.
8. The eval test asserts on the same returned result and session.
9. The reporter renders the recorded metadata without re-executing the harness.

Explicit `expect(result).toSatisfyJudge(...)` calls use the run's typed output
and reuse registered input, metadata, and harness context
when `result` came from the fixture-backed `run(...)`. Inside an eval test,
calls on registered output objects or session objects reuse that exact run
context; other raw values fall back to the current test's most recent
`run(...)` context. Calls outside that context, or on manually-created runs,
must pass the context required by the judge in matcher options.

## First-Party Harness Packages

Replay/VCR policy is configured at the harness boundary with `toolReplay` and
global Vitest environment settings. Tool definitions should describe tool
behavior only.

### `@vitest-evals/harness-ai-sdk`

Adapts `ai-sdk`-style results into the normalized run/session shape. It can
derive output, usage, transcript events, and errors from common AI SDK result
objects. Successful tool-call transcripts come from AI SDK `steps`; custom
`run` entrypoints that do not return steps should return a normalized
`session` explicitly when tests need message or tool-call assertions. It
preserves native trace spans from AI SDK steps when they are available;
tool-call assertions should use the normalized session helpers.
It exposes `aiSdkJudgeHarness(...)`, a thin adapter from AI SDK model
configuration to the core judge harness interface.

### `@vitest-evals/harness-openai-agents`

Adapts `@openai/agents` `Runner.run(agent, input, options)` workflows into the
normalized run/session shape. It accepts existing agents/runners or per-run
`agent`/`runner` factories, supports custom app entrypoints, normalizes
`RunResult` output, transcript events, usage, errors, trace metadata,
records run/model spans when data is available, and records replay metadata for
opt-in local function tools. Successful tool-call transcripts come from
OpenAI Agents run items; runtime wrappers can enrich those items but do not
create replacement transcript events. It also exposes
`openaiAgentsJudgeHarness(...)` for judge-side model calls.

### `@vitest-evals/harness-pi-ai`

Adapts `pi-ai` style agents into the same normalized shape. It automatically
adds run/model spans when runtime usage data is available. Its runtime event
stream and wrapped tool calls are the transcript source for Pi workflows. It
also owns the standard tool replay/VCR behavior for opt-in tools and exposes
`piAiJudgeHarness(...)` for judge-side model calls. Replay modes include:

- `auto` (default)
- `record`
- `off`
- `strict`

Replay metadata becomes part of the normalized tool record so the reporter can
surface it.

## Demo Apps

`apps/demo-pi`, `apps/demo-ai-sdk`, and `apps/demo-openai-agents` own their demo
fixtures locally. They stay under `apps/` because they are product demos, while
`packages/` is reserved for real package surfaces that can be published or
consumed independently.

## Extension Points

### New Harnesses

New runtime integrations should be implemented as thin adapter packages that:

- execute the target runtime through its normal entrypoint
- capture transcript events, usage, timings, and errors
- normalize them into `HarnessRun`
- avoid inventing harness-specific assertion or reporter behavior in userland

### New Judges

Root-level custom evaluation logic should generally be written as judges over
normalized run/session data:

```ts
import { createJudge, type JudgeOptions, type JsonValue } from "vitest-evals";

export const RefundToolJudge = createJudge(
  "RefundToolJudge",
  async ({
    expectedTools,
    toolCalls,
  }: JudgeOptions<
    unknown,
    JsonValue | undefined,
    { expectedTools: string[] }
  >) => ({
    score: expectedTools.every(
      (name, index) => toolCalls[index]?.name === name,
    )
      ? 1
      : 0,
    metadata: {
      rationale: `Expected ${expectedTools.join(" -> ")}`,
    },
  },
);
```

### Legacy Support

If you need the older scorer-first model, keep changes isolated to
`packages/vitest-evals/src/legacy/...` and document them as legacy behavior.
