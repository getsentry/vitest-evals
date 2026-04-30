# vitest-evals Architecture

## Overview

`vitest-evals` is organized around a harness-first execution model.
Vitest still runs the suite, but the primary contract is no longer
`input -> task -> scorer`. The primary contract is:

- one explicit `harness` per suite
- named eval tests that call the instrumented `run(input)` fixture
- one normalized `HarnessRun` per eval test
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
  harness-ai-sdk/
  harness-pi-ai/
  foobar/
apps/
  demo-pi/
```

## Core Package

### `packages/vitest-evals/src/harness.ts`

Defines the normalized runtime model:

- `Harness`
- `HarnessRun`
- `NormalizedSession`
- `ToolCallRecord`
- `UsageSummary`
- helper accessors such as `toolCalls(session)` and `assistantMessages(session)`

The normalized session is intentionally JSON-serializable so it can be
persisted, attached to errors, and emitted by reporters without custom
serialization logic.

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

- `ToolCallJudge`
- `StructuredOutputJudge`

These are judge-shaped adapters over the legacy comparison logic so new suites
can stay on the harness-first surface while older matching behavior remains
available.

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

## Harness Lifecycle

For each eval test in a harness-backed suite:

1. `describeEval(...)` configures one instrumented harness for the suite.
2. The suite callback registers named eval tests.
3. The eval test calls `run(input)` at the point execution should happen.
4. The configured harness runs the system under test exactly once.
5. The harness returns a `HarnessRun` with `run.output`, `run.session`,
   `usage`, `timings`, `artifacts`, and `errors`.
6. Core stores that run on `task.meta.harness` for the reporter.
7. Automatic suite-level judges run against the normalized run/session pair.
8. The eval test asserts on the same returned result, session, and agent.
9. The reporter renders the recorded metadata without re-executing the harness.

## First-Party Harness Packages

### `@vitest-evals/harness-ai-sdk`

Adapts `ai-sdk`-style results into the normalized run/session shape. It can
derive output, usage, messages, tool calls, and errors from common AI SDK
result objects, while still allowing custom `run`, `session`, `output`, and
`usage` overrides.

### `@vitest-evals/harness-pi-ai`

Adapts `pi-ai` style agents into the same normalized shape. It also owns the
standard tool replay/VCR behavior for opt-in tools, including:

- `auto`
- `strict`
- `record`
- `off`

Replay metadata becomes part of the normalized tool record so the reporter can
surface it.

## Extension Points

### New Harnesses

New runtime integrations should be implemented as thin adapter packages that:

- execute the target runtime through its normal seam
- capture messages, tool calls, usage, timings, and errors
- normalize them into `HarnessRun`
- avoid inventing harness-specific assertion or reporter behavior in userland

### New Judges

Root-level custom evaluation logic should generally be written as judges over
normalized run/session data:

```ts
import type { JudgeFn } from "vitest-evals";

export const RefundToolJudge: JudgeFn<{ expectedTools: string[] }> = async ({
  expectedTools,
  toolCalls,
}) => ({
  score: expectedTools.every(
    (name, index) => toolCalls[index]?.name === name,
  )
    ? 1
    : 0,
  metadata: {
    rationale: `Expected ${expectedTools.join(" -> ")}`,
  },
});
```

### Legacy Support

If you need the older scorer-first model, keep changes isolated to
`packages/vitest-evals/src/legacy/...` and document them as legacy behavior.
