# vitest-evals

Monorepo for the harness-first `vitest-evals` shape:

- `packages/vitest-evals`: core suite API, judges, normalized harness/session
  types, reporter, and legacy compatibility exports
- `packages/harness-ai-sdk`: `ai-sdk`-focused harness adapter
- `packages/harness-pi-ai`: `pi-ai`-focused harness adapter with tool replay
- `packages/foobar`: example package with a small `pi-ai`-style refund agent
- `apps/demo-pi`: end-to-end `pi-ai` demo evals wired through the workspace packages
- `apps/demo-ai-sdk`: end-to-end AI SDK demo evals wired through the workspace packages

## Workspace Layout

```text
packages/
  vitest-evals/
  harness-ai-sdk/
  harness-pi-ai/
  foobar/
apps/
  demo-ai-sdk/
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
import { expect } from "vitest";
import { createRefundAgent, foobarTools } from "@demo/foobar";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
} from "vitest-evals";

const harness = piAiHarness({
  agent: createRefundAgent,
  tools: foobarTools,
});

describeEval(
  "demo pi refund agent",
  {
    harness,
    judges: [ToolCallJudge()],
  },
  (it) => {
    it("approves refundable invoice", async ({ agent, run }) => {
      const result = await run("Refund invoice inv_123", {
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      });

      expect(agent).toBeDefined();
      expect(result.output).toMatchObject({
        status: result.caseData.expectedStatus,
      });
      await result.judge(StructuredOutputJudge(), {
        expected: { status: result.caseData.expectedStatus },
      });
      expect(toolCalls(result.session).map((call) => call.name)).toEqual(
        result.caseData.expectedTools,
      );
    });
  },
);
```

See [apps/demo-pi/README.md](apps/demo-pi/README.md) for the demo app entrypoint
and [packages/foobar/src/index.ts](packages/foobar/src/index.ts) for the
example agent/runtime integration point.

Harness-backed suites configure the instrumented runtime once, then register
normal-looking eval tests inside the callback. Each test gets the resolved
agent and an instrumented `run(input)` fixture. Calling `run(...)` executes the
agent once and returns the normalized `run`/`session` plus a pre-bound
`judge(...)` helper. Suite-level `judges` run against the same recorded run.

For explicit judge assertions inside an eval test, use the pre-bound
`judge(...)` helper. It reuses the current `run`, `session`, `rawInput`, and
`caseData` automatically:

```ts
it("denies non-refundable invoice", async ({ run }) => {
  const result = await run("Refund invoice inv_404", {
    expectedStatus: "denied",
  });

  await result.judge(StructuredOutputJudge(), {
    expected: { status: result.caseData.expectedStatus },
  });
});
```

The lower-level matcher still exists as
`await expect(value).toSatisfyJudge(judge, context)` when you need to judge a
raw value or a custom synthetic run.

If you need a custom judge name in reporter output, wrap it with
`namedJudge("MyJudge", fn)`.

Older scorer-first APIs now live under `vitest-evals/legacy`. The root package
is intentionally harness-first and judge-first.

Tool replay is available for opt-in tools in the first-party harnesses.
Configure it globally in Vitest and then mark individual tools with
`replay: true`:

```ts
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.eval.ts",
      "apps/**/*.test.ts",
      "apps/**/*.eval.ts",
    ],
    env: {
      VITEST_EVALS_REPLAY_MODE: "auto",
      VITEST_EVALS_REPLAY_DIR: ".vitest-evals/recordings",
    },
  },
});
```

`auto` replays when a recording exists and writes a new one otherwise. `strict`
errors on missing recordings. Recordings are stored under
`.vitest-evals/recordings/<tool-name>/`.

`pnpm evals` fans out to each workspace package or app that exposes an `evals`
script. Use `pnpm evals:fail` to run the intentional failure examples. The
`apps/demo-pi` example is a live `pi-ai` demo backed by
`@mariozechner/pi-ai` and `@mariozechner/pi-agent-core`, so it expects
`ANTHROPIC_API_KEY` in `.env` or `.env.local`.
