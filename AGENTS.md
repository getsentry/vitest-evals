# Agent Instructions

## Package Manager
- Use **pnpm**: `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm evals`

## Commit Attribution
- AI commits MUST include:
```text
Co-Authored-By: OpenAI Codex <codex@openai.com>
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
- Update `README.md`, `packages/vitest-evals/README.md`, and relevant docs when product shape changes.
- Follow `policies/code-comments.md` for exported-function JSDoc and non-obvious comments only.

## Read First
- `docs/architecture.md`
- `docs/development-guide.md`
- `docs/testing.md`
- `policies/README.md`
- `policies/code-comments.md`
