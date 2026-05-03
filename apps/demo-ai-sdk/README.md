# Demo AI SDK App

This app demonstrates an `ai-sdk` harness wired into `vitest-evals`
through the workspace packages:

- `vitest-evals`
- `@vitest-evals/harness-ai-sdk`
- `@demo/refund-agent`

The passing live eval lives in `evals/refund.eval.ts`.
It demonstrates an automatic harness-backed tool judge plus explicit Vitest
assertions on `run.output` and the normalized session trace.

The intentionally failing examples live in `evals/refund.fail.eval.ts`.
One fails an automatic harness-backed judge, and one fails explicit assertions
after the harness completes.

Run them with:

```sh
pnpm --filter @demo/demo-ai-sdk run evals
pnpm --filter @demo/demo-ai-sdk run evals -- -v
pnpm --filter @demo/demo-ai-sdk run evals -- -vv
pnpm --filter @demo/demo-ai-sdk run evals -- -vvv
pnpm --filter @demo/demo-ai-sdk run evals -- -vvvv
pnpm --filter @demo/demo-ai-sdk run evals:verbose
pnpm --filter @demo/demo-ai-sdk run evals:fail
```

`pnpm --filter @demo/demo-ai-sdk run evals` runs only the passing eval. Use
`pnpm --filter @demo/demo-ai-sdk run evals:fail` to run just the intentional
failures.

Both scripts expect `ANTHROPIC_API_KEY` to be present in `.env` or `.env.local`.
