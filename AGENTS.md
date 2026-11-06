# Agent Instructions

## Package Manager
- Use **pnpm**: `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm evals`

## Repository Structure
```text
packages/
  core/                   # normalized session/run types, transcript events, report metadata
  vitest-evals/           # root describeEval, judges, matchers, reporter, legacy; re-exports core
  harness-ai-sdk/         # AI SDK adapter into HarnessRun
  harness-openai-agents/  # OpenAI Agents adapter into HarnessRun
  harness-pi-ai/          # pi-ai adapter, wrapped tool runtime, tool replay
  github-reporter/        # GitHub Action reporter: collection, summary, annotations
  report-ui/              # HTML report UI and its transcript/trace model
  docs/                   # docs site, generated API reference, llms.txt
apps/                     # demo-ai-sdk, demo-openai-agents, demo-pi (realistic demo fixtures)
```

## File-Scoped Commands
| Task | Command |
|------|---------|
| Lint file | `pnpm exec biome lint path/to/file.ts` |
| Format file | `pnpm exec biome format --write path/to/file.ts` |
| Test file | `pnpm exec vitest run path/to/file.test.ts -c vitest.config.ts` |
| Eval file | `pnpm exec vitest run path/to/file.eval.ts -c vitest.config.ts --reporter=./packages/vitest-evals/src/reporter.ts` |

## Key Conventions
- Root API work is harness-first and judge-first.
- Legacy scorer-first changes stay under `packages/vitest-evals/src/legacy/...`.
- Keep normalized session and run data JSON-serializable.
- Keep `UsageSummary` to stable usage units such as tokens, USD cost, tools, retries, provider, and model. Set `costUsd` only when cost is known; provider-specific pricing details belong in `usage.metadata`.
- GitHub reporting is action-first: document workflows with `uses: getsentry/vitest-evals@v0`, not CLI commands.
- Sharded eval reporting uses distinct JSON artifacts per matrix job and one reducer job that publishes the combined action report.
- The root GitHub Action bundle `github-reporter/dist/action/index.js` is committed on `main`. CI rebuilds it and commits it back on same-repo PRs; fork PRs, `main`, and the PR merge result fail when it is stale, so run `pnpm build:action` (after merging `main` if only the merge result is stale) and commit the result. Craft tags `vX.Y.Z` on the release commit, and the action tag workflow moves `vX` on stable releases only, to a child commit of the release that `main` never reaches (so `git describe` never returns `vX`). Do not use Craft `floatingTags` for `vX`: it tags the release commit, which breaks `auto` versioning. Keep the Craft `github` target filtered away from package artifacts.
- Update `README.md`, `packages/vitest-evals/README.md`, and relevant docs when product shape changes.
- Follow `policies/code-comments.md` for exported-function JSDoc and non-obvious comments only.

## Read First
- `docs/architecture.md`
- `docs/development-guide.md`
- `docs/github-actions.md`
- `docs/testing.md`
- `policies/README.md`
- `policies/code-comments.md`
