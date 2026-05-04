# Demo OpenAI Agents App

This app demonstrates an `@openai/agents` harness wired into `vitest-evals`
through the workspace packages:

- `vitest-evals`
- `@vitest-evals/harness-openai-agents`

The passing live eval lives in `evals/refund.eval.ts`.
It demonstrates a real OpenAI Agents `Agent`, `Runner`, local function tools,
tool replay configured from the harness, and explicit Vitest assertions on
`run.output` and the normalized session trace.

The intentionally failing examples live in `evals/refund.fail.eval.ts`.
One fails an automatic harness-backed judge, and one fails explicit assertions
after the harness completes.

Run them with:

```sh
pnpm --filter @demo/demo-openai-agents run evals
pnpm --filter @demo/demo-openai-agents run evals -- -v
pnpm --filter @demo/demo-openai-agents run evals -- -vv
pnpm --filter @demo/demo-openai-agents run evals -- -vvv
pnpm --filter @demo/demo-openai-agents run evals -- -vvvv
pnpm --filter @demo/demo-openai-agents run evals:verbose
pnpm --filter @demo/demo-openai-agents run evals:fail
```

`pnpm --filter @demo/demo-openai-agents run evals` runs only the passing eval.
Use `pnpm --filter @demo/demo-openai-agents run evals:fail` to run just the
intentional failures.

Both scripts expect `OPENAI_API_KEY` to be present in `.env` or `.env.local`.
