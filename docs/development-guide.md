# Development Guide

## Getting Started

### Prerequisites

- Node.js 18+
- `pnpm`
- TypeScript
- familiarity with Vitest

### Setup

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Current Product Shape

The repository is now harness-first:

- new suites should use `describeEval(...)` from `vitest-evals`
- harness adapters live in first-party packages such as
  `@vitest-evals/harness-pi-ai`
- root helper logic should be judge-first
- scorer-first support still exists, but it is isolated under
  `vitest-evals/legacy`

When changing behavior, decide first which surface you are touching:

- root harness/judge API
- reporter output
- a first-party harness package
- legacy scorer compatibility

That split should stay explicit in both code and documentation.

## Workflow

1. Read the relevant package and tests first.
2. Decide whether the change belongs in root, a harness package, or `legacy`.
3. Add or update tests before broad refactors.
4. Keep examples and docs aligned with the change.
5. Run the smallest useful verification set locally before committing.

## Key Package Boundaries

### `packages/vitest-evals`

Owns:

- normalized harness/session types
- root `describeEval(...)`
- judge helpers and matcher APIs
- reporter integration
- legacy compatibility exports

### `packages/harness-ai-sdk`

Owns:

- adapting AI SDK results into `HarnessRun`
- AI SDK specific usage/session normalization

### `packages/harness-openai-agents`

Owns:

- adapting OpenAI Agents SDK `Runner.run(...)` results into `HarnessRun`
- OpenAI Agents specific `RunResult` and function-tool normalization
- replay metadata for opt-in local function tools

### `packages/harness-pi-ai`

Owns:

- adapting `pi-ai` style agents into `HarnessRun`
- wrapped tool runtime injection
- tool replay/VCR behavior

## Demo Apps

`apps/demo-pi`, `apps/demo-ai-sdk`, and `apps/demo-openai-agents` own live demo
eval coverage and any app-local refund fixtures they need. Keep them realistic;
they are part of the product story, not just smoke tests. `packages/` is for
real package surfaces.

## Adding a New Judge

Root-level evaluation logic should usually be implemented as a `JudgeFn`:

```ts
import type { JudgeFn, JudgeOptions } from "vitest-evals";

export const DomainJudge: JudgeFn<
  JudgeOptions<{ expectedTool: string }>
> = async ({ toolCalls, expectedTool }) => ({
  score: toolCalls.some((call) => call.name === expectedTool) ? 1 : 0,
  metadata: {
    rationale: `Expected tool ${expectedTool}`,
  },
});
```

Prefer judges when:

- the logic should work with normalized harness data
- the result should compose with automatic suite-level judges
- the logic should work with `toSatisfyJudge(...)` or suite-level `judges`

## Adding a New Harness Adapter

Keep harness adapters thin. Core should own the generic model. A harness
package should focus on:

- executing the target runtime through its normal seam
- capturing messages, tool calls, usage, timings, and errors
- returning a normalized `HarnessRun`
- exposing narrow escape hatches like `run`, `output`, or `session`

Do not push core reporter or assertion behavior into a harness package unless
the runtime truly requires it.

## Maintaining Legacy Compatibility

If a change only exists to support scorer-first suites, keep it under
`packages/vitest-evals/src/legacy/...` and document it as legacy behavior.

Legacy APIs include:

- `describeEval(...)` from `vitest-evals/legacy`
- `toEval(...)`
- `evaluate(...)`
- scorer implementations such as `ToolCallScorer`

Do not reintroduce scorer-first guidance into the root package docs or examples.

## Verification

Common commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm evals
```

For targeted work, prefer narrow verification:

- reporter changes: run reporter tests
- harness changes: run the relevant harness package tests
- demo app changes: run `pnpm evals` or a filtered app eval command
- legacy changes: run the moved tests under `packages/vitest-evals/src/legacy`

## Documentation Expectations

When the product shape changes, update:

- the repo root `README.md`
- `packages/vitest-evals/README.md`
- the relevant docs in `docs/`
- example apps or packages when the authoring model changes

The repo should read as harness-first even if the legacy compatibility layer
continues to exist.
