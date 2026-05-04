---
name: vitest-evals
description: Use when authoring, reviewing, or debugging harness-backed vitest-evals suites, custom Harness adapters, first-party ai-sdk or pi-ai harness integrations, judges, replay, reporter-facing normalized run data, or examples and docs for these APIs.
---

# vitest-evals

Use the harness-backed API as the only authoring model.

## First Steps

1. Read the package, app, or eval file being changed.
2. Identify the runtime target, then open only the needed reference.
3. Keep suites close to Vitest: one harness per `describeEval(...)`, explicit `run(...)` inside each test, ordinary `expect(...)` assertions over the returned result.

## Reference Router

| Need | Open |
|------|------|
| Write or review a normal eval suite | `references/suite-authoring.md` |
| Build a custom app `Harness` without a first-party adapter | `references/custom-harness.md` |
| Integrate AI SDK `generateText`, `generateObject`, tools, or an AI SDK-style agent | `references/harness-ai-sdk.md` |
| Integrate a Pi AI or Pi Mono-style agent | `references/harness-pi-ai.md` |
| Add custom judges, suite judges, built-in judges, or `toSatisfyJudge(...)` assertions | `references/judges-and-assertions.md` |
| Configure tool recording or replay | `references/tool-replay.md` |
| Diagnose failures, missing traces, odd output, or choose verification commands | `references/troubleshooting.md` |

## Runtime Defaults

- Import `describeEval(...)`, judges, and helpers from `vitest-evals`.
- Bind exactly one `harness` to a suite.
- Call `run(input, { metadata? })` where the test should execute the system.
- Assert on `result.output` for app-facing behavior.
- Use `result.session` and helpers such as `toolCalls(session)` for trace assertions.
- Keep `HarnessRun`, `NormalizedSession`, usage, artifacts, and tool records JSON-serializable.
- Expose `harness.prompt(...)` so LLM-backed judges can reuse the suite's provider and model setup.
- Put scenario-owned criteria on the input value; put per-run expectations or harness settings in `metadata`.
- Use `namedJudge(...)` for custom judges that should have stable reporter labels.

## Verification

Prefer the smallest command that covers the edited files:

| Task | Command |
|------|---------|
| Lint file | `pnpm exec biome lint path/to/file.ts` |
| Format file | `pnpm exec biome format --write path/to/file.ts` |
| Test file | `pnpm exec vitest run path/to/file.test.ts -c vitest.config.ts` |
| Eval file | `pnpm exec vitest run path/to/file.eval.ts -c vitest.config.ts --reporter=./packages/vitest-evals/src/reporter.ts` |
| Type surface | `pnpm typecheck` |
| Package build | `pnpm build` |
