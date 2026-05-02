# Demo Pi App

This app demonstrates a `pi-ai` style harness wired into `vitest-evals`
through the workspace packages:

- `vitest-evals`
- `@vitest-evals/harness-pi-ai`
- `@demo/foobar`

The passing live eval lives in `evals/refund.eval.ts`.
It demonstrates an automatic harness-backed tool judge plus explicit Vitest
assertions on `run.output` and the normalized session trace.

The intentionally failing examples live in `evals/refund.fail.eval.ts`.
One fails an automatic harness-backed judge, and one fails explicit assertions
after the harness completes.

Run them with:

```sh
pnpm --filter @demo/demo-pi run evals
pnpm --filter @demo/demo-pi run evals -- -v
pnpm --filter @demo/demo-pi run evals -- -vv
pnpm --filter @demo/demo-pi run evals -- -vvv
pnpm --filter @demo/demo-pi run evals -- -vvvv
pnpm --filter @demo/demo-pi run evals:verbose
pnpm --filter @demo/demo-pi run evals:fail
```

`pnpm --filter @demo/demo-pi run evals` runs only the passing eval. Use
`pnpm --filter @demo/demo-pi run evals:fail` to run just the intentional
failures.

Both scripts expect `ANTHROPIC_API_KEY` to be present in `.env` or `.env.local`.
