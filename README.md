# vitest-evals

Monorepo for the explicit-run `vitest-evals` shape:

- `packages/vitest-evals`: core suite API, judges, normalized harness/session
  types, reporter, and legacy compatibility exports
- `packages/harness-ai-sdk`: `ai-sdk`-focused harness adapter
- `packages/harness-pi-ai`: `pi-ai`-focused harness adapter with tool replay
- `apps/demo-pi`: end-to-end Pi Mono demo evals with an app-local refund agent
- `apps/demo-ai-sdk`: end-to-end AI SDK demo evals with app-local refund tools

## Workspace Layout

```text
packages/
  vitest-evals/
  harness-ai-sdk/
  harness-pi-ai/
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

## Releases

Use the manual Release workflow for stable releases. Select `patch`, `minor`,
or `major` for the normal version bump.

For a preview release that should not become the main stable version, set
`prerelease` to `true` and leave `prerelease_id` as `beta` unless you want an
`rc` or `alpha` line. From `0.8.0`, `bump=minor` produces `0.9.0-beta.0` and
`bump=major` produces `1.0.0-beta.0`; running prerelease again from
`1.0.0-beta.0` produces `1.0.0-beta.1`. Craft publishes npm prereleases under a
prerelease dist-tag so the stable `latest` line is not moved.

## Example

The `apps/demo-pi` app shows the intended explicit-run flow:

```ts
import { expect } from "vitest";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  namedJudge,
  toolCalls,
  type JudgeContext,
} from "vitest-evals";
import { createRefundAgent, judgePrompt } from "../src/refundAgent";

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
      prompt: judgePrompt,
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
- every judge receives `JudgeContext`, including the configured harness with its
  required `prompt` function
- per-run judge parameters should usually live under `metadata`
- reporter output, replay, usage, and tool traces come from the normalized run

Built-in judges like `StructuredOutputJudge()` are still available for
deterministic contract checks, but the more realistic explicit-judge path is a
custom factuality or rubric judge over `output`, with `JudgeContext` available
when the judge needs richer run/session data or the suite's configured model
prompt seam.

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
script. The demo apps expect provider keys in `.env` or `.env.local`. The
intentional failing examples remain under the `evals:fail` scripts.
