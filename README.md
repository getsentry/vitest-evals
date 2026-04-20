# vitest-evals

Monorepo for the next `vitest-evals` shape:

- `packages/vitest-evals`: core eval runner, reporter, harness/session types, and
  scorer support
- `packages/harness-pi-ai`: `pi-ai`-focused harness adapter
- `packages/foobar`: example package with a small `pi-ai`-style refund agent
- `apps/demo-pi`: end-to-end demo evals wired through the workspace packages

## Workspace Layout

```text
packages/
  vitest-evals/
  harness-pi-ai/
  foobar/
apps/
  demo-pi/
```

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm evals
pnpm evals -- -v
pnpm evals -- -vv
pnpm evals -- -vvv
pnpm evals -- -vvvv
pnpm evals:verbose
pnpm build
```

Verbosity tiers for eval output:

- `-v` or `-vv`: tool summary lines
- `-vvv`: tool headers include summarized arguments
- `-vvvv`: adds raw tool payload lines (`raw in`, `raw out`, `raw err`)

The root Vitest config is intentionally small. Package name resolution comes
from the workspace `tsconfig` paths via `vite-tsconfig-paths`, and package
boundaries are expressed in package manifests rather than hard-coded alias
tables.

## Example

The `apps/demo-pi` app shows the intended harness-first `pi-ai` flow:

```ts
import { createRefundAgent, foobarTools } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, ToolCallScorer, toolCalls } from "vitest-evals";

describeEval("demo pi refund agent", {
  data: async () => [
    {
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
      expectedTools: ["lookupInvoice", "createRefund"],
    },
  ],
  harness: piAiHarness({
    createAgent: () => createRefundAgent(),
    tools: foobarTools,
  }),
  judges: [ToolCallScorer()],
  test: async ({ run, session, caseData }) => {
    expect(run.output).toMatchObject({ status: caseData.expectedStatus });
    expect(toolCalls(session).map((call) => call.name)).toEqual(
      caseData.expectedTools,
    );
  },
});
```

See [apps/demo-pi/README.md](apps/demo-pi/README.md)
for the demo app entrypoint and [packages/foobar/src/index.ts](packages/foobar/src/index.ts)
for the example agent/runtime seam.

Harness-backed suites can also declare automatic `judges`. Those judge
functions run against the same normalized `run`/`session` pair that the
optional `test` callback receives, so the harness still executes exactly once
per case.

`pnpm evals` fans out to each workspace package or app that exposes an `evals`
script. The `apps/demo-pi` example is a live Pi Mono demo backed by
`@mariozechner/pi-ai` and `@mariozechner/pi-agent-core`, so it expects
`ANTHROPIC_API_KEY` in `.env` or `.env.local`. The demo app also includes
intentional failing examples, so `pnpm evals` exits non-zero today.
