# vitest-evals

Monorepo for the explicit-run `vitest-evals` shape:

- `packages/vitest-evals`: core suite API, judges, normalized harness/session
  types, reporter, and legacy compatibility exports
- `packages/harness-ai-sdk`: `ai-sdk`-focused harness adapter
- `packages/harness-pi-ai`: `pi-ai`-focused harness adapter with tool replay
- `examples/refund-agent`: private demo runtime with a small refund agent
- `apps/demo-pi`: end-to-end Pi Mono demo evals wired through the workspace
  runtime
- `apps/demo-ai-sdk`: end-to-end AI SDK demo evals wired through the workspace
  runtime

## Workspace Layout

```text
packages/
  vitest-evals/
  harness-ai-sdk/
  harness-pi-ai/
examples/
  refund-agent/
apps/
  demo-ai-sdk/
  demo-pi/
```

## Development

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm evals
pnpm evals -- -v
pnpm evals -- -vv
pnpm evals -- -vvv
pnpm evals -- -vvvv
pnpm evals:verbose
```

Verbosity tiers for eval output:

- `-v` or `-vv`: tool summary lines
- `-vvv`: tool headers include summarized arguments
- `-vvvv`: adds raw tool payload lines (`raw in`, `raw out`, `raw err`)

The root Vitest config is intentionally small. Package name resolution comes
from the workspace `tsconfig` paths via `vite-tsconfig-paths`, and package
boundaries are expressed in package manifests rather than hard-coded alias
tables.

Pull request CI runs the same core safety checks: release config validation,
lint, typecheck, the CI test suite, and the workspace build.

## Example

The `apps/demo-pi` app shows the intended explicit-run flow:

```ts
import { expect } from "vitest";
import { createRefundAgent } from "@demo/refund-agent";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  namedJudge,
  toolCalls,
  type JudgeContext,
} from "vitest-evals";

type RefundEvalMetadata = {
  expectedStatus: "approved" | "denied";
  expectedTools: string[];
};

const FactualityJudge = namedJudge(
  "FactualityJudge",
  async ({
    input,
    output,
    metadata,
  }: JudgeContext<string, RefundEvalMetadata>) => {
    const verdict = await judgeFactuality({
      question: input,
      answer: output,
      expectedStatus: metadata.expectedStatus,
    });

    return {
      score: verdict.score,
      metadata: {
        rationale: verdict.rationale,
      },
    };
  },
);

describeEval(
  "demo pi refund agent",
  {
    harness: piAiHarness({
      createAgent: () => createRefundAgent(),
    }),
    judges: [FactualityJudge],
  },
  (it) => {
    it.for([
      {
        name: "approves refundable invoice",
        input: "Refund invoice inv_123",
        expectedStatus: "approved",
        expectedTools: ["lookupInvoice", "createRefund"],
      },
    ])("$name", async ({ input, ...metadata }, { run }) => {
      const result = await run(input, {
        metadata,
      });

      expect(result.output).toMatchObject({
        status: metadata.expectedStatus,
      });
      expect(toolCalls(result.session).map((call) => call.name)).toEqual(
        metadata.expectedTools,
      );
    });
  },
);
```

Harness-backed suites stay close to plain Vitest:

- `describeEval(...)` binds a suite-level harness
- tests call `run(...)` explicitly
- ordinary `expect(...)` assertions stay first-class
- judges layer in through `expect(...).toSatisfyJudge(...)`
- per-run judge parameters should usually live under `metadata`
- reporter output, replay, usage, and tool traces come from the normalized run

Built-in judges like `StructuredOutputJudge()` are still available for
deterministic contract checks, but the more realistic explicit-judge path is a
custom factuality or rubric judge over `output`, with `JudgeContext` available
when the judge needs richer run/session data.

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
      "examples/**/*.test.ts",
      "examples/**/*.eval.ts",
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
script. The demo apps expect provider keys in `.env` or `.env.local`. The
intentional failing examples remain under the `evals:fail` scripts.
