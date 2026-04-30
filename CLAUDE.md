# vitest-evals Development Guidelines

## Read First

Before changing code, read the relevant package and its nearby tests.
The current product shape is harness-first.

Required docs:

- `docs/architecture.md`
- `docs/development-guide.md`
- `docs/testing.md`
- `docs/scorer-examples.md`

## Product Shape

The root package is now:

- harness-first
- judge-first
- reporter-driven from normalized run metadata

Legacy scorer-first support still exists, but it is intentionally isolated
under `vitest-evals/legacy` and `packages/vitest-evals/src/legacy/...`.

Do not reintroduce scorer-first guidance into root APIs, examples, or docs.

## Repository Structure

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
docs/
```

## Package Boundaries

### `packages/vitest-evals`

Owns:

- normalized session/run types
- root `describeEval(...)`
- judge helpers and matcher APIs
- reporter integration
- legacy compatibility entrypoint

### `packages/harness-ai-sdk`

Owns the AI SDK adapter into `HarnessRun`.

### `packages/harness-pi-ai`

Owns the `pi-ai` adapter, wrapped tool runtime, and tool replay behavior.

### `packages/foobar` and `apps/demo-pi`

Own the example runtime seam and live demos. Keep them realistic and aligned
with the public story.

## Core Rules

- Root work should be harness-first and judge-first.
- Legacy changes should stay under `src/legacy/...`.
- New examples should show the actual runtime seam, not placeholders.
- Normalized session data must remain JSON-serializable.
- Reporter changes require reporter tests.
- Harness changes require harness package tests.
- Legacy scorer changes require legacy tests.

## Commands

Use `pnpm`, not `npm`.

Common verification:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm evals
```

Prefer targeted verification when possible.

## Testing Expectations

- Root API changes: test `packages/vitest-evals/src/*.test.ts`
- Reporter changes: test `packages/vitest-evals/src/reporter.test.ts`
- AI SDK harness changes: test `packages/harness-ai-sdk/src/index.test.ts`
- `pi-ai` harness changes: test `packages/harness-pi-ai/src/index.test.ts`
- Legacy changes: test `packages/vitest-evals/src/legacy/...`
- Demo behavior changes: run `pnpm evals` or a filtered demo command

## Documentation Expectations

When behavior or product shape changes, update:

- `README.md`
- `packages/vitest-evals/README.md`
- relevant files in `docs/`
- example apps or packages if the authoring model changed

Keep this file in sync too.
