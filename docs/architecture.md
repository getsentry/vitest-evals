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
  harness-openai-agents/
  harness-pi-ai/
  github-reporter/
apps/
  demo-ai-sdk/
  demo-openai-agents/
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

- `ToolCallJudge`
- `StructuredOutputJudge`

These are judge-shaped adapters over the legacy comparison logic so new suites
can stay on the harness-first surface while older matching behavior remains
available.

All judges receive `JudgeContext`, which carries normalized run/session data,
typed `input`, typed `output`, and the configured `harness`. The output is only
optional when the harness output type includes `undefined`. LLM-backed judges own
their prompt, rubric text, model call, and parser. Custom judges should use
`createJudge("Name", assess)` for stable reporter labels; the provider-helper
overload is for reusable judge-side setup that needs curried run-scoped options
such as abort signals.

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

## GitHub Reporting

`packages/github-reporter` is the implementation behind the native
`getsentry/vitest-evals` GitHub Action. It reads Vitest's
built-in JSON output instead of attaching directly to the Vitest reporter
lifecycle. That JSON output includes each assertion's `meta` field, so it
preserves the normalized eval and harness metadata recorded by core.

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
derive output, usage, messages, tool calls, and errors from common AI SDK
result objects, while still allowing a custom `run` entrypoint and typed
`output` selector.

### `@vitest-evals/harness-openai-agents`

Adapts `@openai/agents` `Runner.run(agent, input, options)` workflows into the
normalized run/session shape. It accepts existing agents/runners or per-run
`agent`/`runner` factories, supports custom app entrypoints, normalizes
`RunResult` output, messages, usage, tool calls, tool results, errors, trace
metadata, and records replay metadata for opt-in local function tools.

### `@vitest-evals/harness-pi-ai`

Adapts `pi-ai` style agents into the same normalized shape. It also owns the
standard tool replay/VCR behavior for opt-in tools, including:

- `auto`
- `strict`
- `record`
- `off`

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

- execute the target runtime through its normal seam
- capture messages, tool calls, usage, timings, and errors
- normalize them into `HarnessRun`
- avoid inventing harness-specific assertion or reporter behavior in userland

### New Judges

Root-level custom evaluation logic should generally be written as judges over
normalized run/session data:

```ts
import { createJudge, type JudgeOptions } from "vitest-evals";

export const RefundToolJudge = createJudge(
  "RefundToolJudge",
  async ({ expectedTools, toolCalls }: JudgeOptions<{ expectedTools: string[] }>) => ({
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
