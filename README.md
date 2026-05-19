# vitest-evals

Monorepo for the explicit-run `vitest-evals` shape:

- `packages/vitest-evals`: core suite API, judges, normalized harness/session
  types, and reporter
- `packages/harness-ai-sdk`: `ai-sdk`-focused harness adapter
- `packages/harness-openai-agents`: `@openai/agents`-focused harness adapter
- `packages/harness-pi-ai`: `pi-ai`-focused harness adapter with tool replay
- `packages/github-reporter`: GitHub Actions summary, annotation, and optional
  Check Run publishing from Vitest JSON output
- `apps/demo-pi`: end-to-end Pi Mono demo evals with an app-local refund agent
- `apps/demo-ai-sdk`: end-to-end AI SDK demo evals with app-local refund tools
- `apps/demo-openai-agents`: end-to-end OpenAI Agents demo evals with
  app-local refund tools

## Workspace Layout

```text
packages/
  vitest-evals/
  harness-ai-sdk/
  harness-openai-agents/
  harness-pi-ai/
  github-reporter/
apps/
  demo-ai-sdk/
  demo-openai-agents/
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

## Docs Site

The public docs site lives in `packages/docs` and is built with Astro for
Vercel. It is configured for `https://vitest-evals.sentry.dev`.

```sh
pnpm run docs
pnpm run docs:build
```

## GitHub Reporting

For GitHub Actions, emit Vitest JSON and let the GitHub reporter read that file.
The JSON report preserves `task.meta`, including eval scores, harness runs,
usage, and tool calls. JUnit can still be emitted alongside it for CI systems
that expect XML.

```yaml
steps:
  - name: Run evals
    run: |
      pnpm exec vitest run apps packages \
        --config=./vitest.config.ts \
        --reporter=vitest-evals/reporter \
        --reporter=json \
        --outputFile.json=vitest-results.json

  - uses: getsentry/vitest-evals@v0
    if: always()
    with:
      results: vitest-results.json
      publish-check: true
```

The reporter action writes a plain ASCII job summary through
`GITHUB_STEP_SUMMARY`, emits terse annotations for failed evals, and publishes a
separate Check Run when `publish-check` is enabled and `checks: write`
permission is configured. It can also reduce sharded eval JSON artifacts into
one combined report.
See [docs/github-actions.md](docs/github-actions.md) for the minimal workflow.

## Releases

Use the manual Release workflow for stable releases. Select `patch`, `minor`,
or `major` for the normal version bump.

For a preview release that should not become the main stable version, set
`prerelease` to `true` and leave `prerelease_id` as `beta` unless you want an
`rc` or `alpha` line. From `0.8.0`, `bump=minor` produces `0.9.0-beta.0` and
`bump=major` produces `1.0.0-beta.0`; running prerelease again from
`1.0.0-beta.0` produces `1.0.0-beta.1`. Craft publishes npm prereleases under a
prerelease dist-tag so the stable `latest` line is not moved.

Release tags are updated after publish with the bundled `github-reporter`
action so workflows can use `getsentry/vitest-evals@v0`. The release workflow
keeps `vX.Y.Z-src` on the source commit for Craft's next changelog baseline,
then moves `vX.Y.Z` and the stable `vX` tag to the bundled action commit. The
Craft GitHub target creates the release but is filtered away from package
artifacts so it does not upload npm package contents as release assets.

## Example

The `apps/demo-pi` app shows the intended explicit-run flow:

```ts
import { expect } from "vitest";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  createJudge,
  describeEval,
  toolCalls,
  type JudgeContext,
} from "vitest-evals";
import { createRefundAgent } from "../src/refundAgent";

type RefundEvalMetadata = {
  expectedStatus: "approved" | "denied";
  expectedTools: string[];
};

type RefundOutput = {
  status: "approved" | "denied";
};

const FactualityJudge = createJudge(
  "FactualityJudge",
  async ({
    input,
    output,
    metadata,
  }: JudgeContext<string, RefundOutput, RefundEvalMetadata>) => {
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
      agent: () => createRefundAgent(),
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
- every judge is a named object with `assess(ctx)`
- every judge receives `JudgeContext` with typed `input`, typed `output`, the
  normalized run/session, tool calls, and metadata; `output` is only optional
  when the harness output type includes `undefined`
- judges own their prompt, rubric, model call, and parsing; use
  `createJudge(...)` for custom judges and its provider-helper overload only
  when multiple judges share setup
- scenario-specific judge criteria can live in `input`; use `metadata` for
  per-run expectations or harness configuration that are not part of the
  scenario payload
- reporter output, replay, usage, and tool traces come from the normalized run

Built-in judges like `StructuredOutputJudge()` are still available for
deterministic contract checks, but the more realistic explicit-judge path is a
custom factuality or rubric judge over `output`, with `JudgeContext` available
when the judge needs richer run/session data.

Tool replay is available for opt-in tools in the first-party harnesses.
Configure the replay mode and directory globally in Vitest, then opt individual
tools in from the harness with `toolReplay: { toolName: true }`.

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
script. The shared eval CLI defaults replay to `auto` and writes recordings
under `.vitest-evals/recordings`, unless those environment variables are
already set. Demo apps expect provider keys in `.env` or `.env.local`. The
intentional failing examples remain under the `evals:fail` scripts.
