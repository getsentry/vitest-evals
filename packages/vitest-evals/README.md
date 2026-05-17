# vitest-evals

Harness-backed AI testing on top of Vitest.

## Install

```sh
npm install -D vitest-evals
```

Install a first-party harness package for the runtime you want to test:

```sh
npm install -D @vitest-evals/harness-pi-ai
# or
npm install -D @vitest-evals/harness-ai-sdk
# or
npm install -D @vitest-evals/harness-openai-agents
```

For GitHub Actions summaries and annotations, install the JSON post-processor:

```sh
npm install -D @vitest-evals/github-reporter
```

## Core Model

- `describeEval(...)` binds exactly one harness to a suite
- the suite callback receives a fixture-backed Vitest `it`
- `run(input, { metadata? })` executes the harness explicitly and returns a
  normalized `HarnessRun`
- the returned `result.output` is the app-facing value you assert on directly
- the returned `result.session` is the canonical JSON-serializable trace for
  reporting, replay, tool assertions, and judges
- scenario-specific judge criteria can live in `inputValue`; use `metadata` for
  per-run expectations or harness configuration that are not part of the
  scenario payload
- suite-level `judges` are optional and run automatically after each `run(...)`
- suite-level `judgeThreshold` controls fail-on-score for those automatic judges
- every judge receives `JudgeContext` with the normalized run and harness
  context
- harnesses may expose a real `query(...)` helper for judges that should reuse
  the same provider library or credentials without running the app agent
- explicit judge assertions use
  `await expect(result).toSatisfyJudge(judge, context)`

## Explicit Run Example

```ts
import { expect } from "vitest";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  namedJudge,
  toolCalls,
  type JudgeContext,
} from "vitest-evals";
import { createRefundAgent } from "../src/refundAgent";

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
  "refund agent",
  {
    harness: piAiHarness({
      agent: () => createRefundAgent(),
    }),
    judges: [FactualityJudge],
  },
  (it) => {
    it("approves a refundable invoice", async ({ run }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          expectedStatus: "approved",
          expectedTools: ["lookupInvoice", "createRefund"],
        },
      });

      expect(result.output).toMatchObject({ status: "approved" });
      expect(toolCalls(result.session).map((call) => call.name)).toEqual([
        "lookupInvoice",
        "createRefund",
      ]);
    });
  },
);
```

## Table-Driven Vitest Style

If you want case tables, use Vitest's own `it.for(...)` and call `run(...)`
inside the test body:

```ts
describeEval("refund agent", { harness }, (it) => {
  it.for([
    {
      name: "approves refundable invoice",
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
    },
    {
      name: "denies non-refundable invoice",
      input: "Refund invoice inv_404",
      expectedStatus: "denied",
    },
  ])("$name", async ({ input, ...metadata }, { run }) => {
    const result = await run(input, {
      metadata,
    });

    expect(result.output).toMatchObject({
      status: metadata.expectedStatus,
    });
  });
});
```

## GitHub Actions Reporting

Use Vitest JSON as the eval report artifact. It preserves the `meta` field that
contains eval scores and normalized harness runs.

```sh
vitest run evals \
  --reporter=vitest-evals/reporter \
  --reporter=json \
  --outputFile.json=vitest-results.json

vitest-evals-github-report
```

The GitHub reporter writes a job summary when `GITHUB_STEP_SUMMARY` is present,
emits short failure annotations in Actions, and can publish a separate Check Run
with `--check-run` when `checks: write` permission is configured.

## Existing Agents

For an existing agent, the intended contract is:

- pass the agent instance or per-test factory through the harness
- optionally pass `run` when the app entrypoint is not `run(input, runtime)`
- let the harness infer native tools from the existing agent by default
- only pass an explicit `tools` override when the agent hides its tool surface

The harness owns normalization, diagnostics, tool capture, replay plumbing, and
reporter-facing artifacts. Your app just needs one runtime seam where those
wrapped pieces can be injected.

Replay opt-in belongs on the harness, via `toolReplay`, while replay mode and
recording directory can live in Vitest environment config. Tool definitions
should stay free of VCR policy.

For the Pi-specific harness, output/session/usage normalization should usually
be inferred automatically. Treat low-level normalization callbacks as an escape
hatch, not part of the primary authoring path.

For OpenAI Agents SDK apps, use
`@vitest-evals/harness-openai-agents` with an existing `Agent` or an `agent`
factory and a `Runner` or `runner` factory. The harness calls
`Runner.run(agent, input, options)` by default and exposes the same
normalization and replay hooks when the app needs a custom entrypoint or
structured domain output mapping.

## Custom App Harnesses

First-party harness packages are conveniences, not the only supported path. If
you need to test a full application flow, use `createHarness(...)` to run your
app through its normal entrypoint and return the app-facing output. Judges own
their prompt/rubric text separately from the system under test. When multiple
judges should reuse the same provider setup or credentials, pass a real
`query(...)` helper; otherwise the harness simply has no query capability.

```ts
import {
  createHarness,
  describeEval,
  namedJudge,
  type JudgeContext,
} from "vitest-evals";

type AppEvent = {
  type: string;
  payload: Record<string, string>;
};

type AppEvalInput = {
  events: AppEvent[];
  criteria: {
    contract: string;
    pass: string[];
    fail?: string[];
  };
};

const appHarness = createHarness<AppEvalInput>({
  name: "custom-app",
  query: promptJudgeModel,
  run: async ({ input, signal, setArtifact }) => {
    const result = await replayAppEvents(input.events, {
      signal,
    });
    setArtifact("replyCount", result.replies.length);

    return {
      output: {
        replies: result.replies,
        sideEffects: result.sideEffects,
      },
      outputText: result.replies.map((reply) => reply.text).join("\n\n"),
      usage: {},
    };
  },
});

const AppRubricJudge = namedJudge(
  "AppRubricJudge",
  async (
    ctx: JudgeContext<AppEvalInput, Record<string, unknown>, typeof appHarness>,
  ) => {
    const verdict = await ctx.harness.query(
      formatRubricPrompt({
        output: ctx.output,
        criteria: ctx.inputValue.criteria,
      }),
      {
        metadata: {
          judge: "AppRubricJudge",
        },
      },
    );

    return parseRubricVerdict(verdict);
  },
);

describeEval(
  "app behavior",
  {
    harness: appHarness,
    judges: [AppRubricJudge],
    judgeThreshold: 0.75,
  },
  (it) => {
    it("handles an event flow", async ({ run }) => {
      await run({
        events: [
          {
            type: "message.created",
            payload: {
              text: "Summarize the current incident.",
            },
          },
        ],
        criteria: {
          contract: "The app posts one user-visible incident summary.",
          pass: ["The reply names the incident status."],
          fail: ["The reply exposes internal metadata."],
        },
      });
    });
  },
);
```

Use `Harness.run(...)` for the application under test. If a harness exposes
`query(...)`, judges can use it as a separate judge-model helper that shares
provider setup without inheriting the app agent's tools or runtime. Calling
`ctx.harness.run(...)` from inside a judge runs the application a second time,
so reserve that for judges that intentionally need a second execution. Put
criteria on `inputValue` when they are part of the scenario itself; use per-run
`metadata` for harness configuration or expectations that are not part of the
scenario payload. `createHarness(...)` builds a default user/assistant session
from `input`, `output`, and `outputText`; return a full `HarnessRun` only when
you need exact session control.

Provider setup and rubric parsing stay in your judge. The core
package only requires the judge to return a `JudgeResult` with a score and
optional metadata.

Automatic suite-level judges are a good fit when every `run(...)` should get
the same scoring. For cases where only some runs need an LLM judge, keep the
suite free of automatic judges and use an explicit matcher:

```ts
await expect(result).toSatisfyJudge(AppRubricJudge, {
  threshold: 0.75,
});
```

## Judge Matchers

Use the matcher when a judge should behave like a normal Vitest assertion.
In practice, this is usually most useful for factuality, rubric, or grounded
answer checks:

```ts
await expect(result).toSatisfyJudge(FactualityJudge);
```

For lower-level cases, the matcher also accepts raw values and synthetic judge
context:

```ts
await expect({ status: "approved" }).toSatisfyJudge(MyJudge, {
  inputValue: "Refund invoice inv_123",
});
```

If you are writing a custom judge, wrap it with `namedJudge(...)` so reporter
output uses a stable label:

```ts
import { namedJudge } from "vitest-evals";

const FactualityJudge = namedJudge(
  "FactualityJudge",
  async ({ output }) => {
    const answer = output;
    const verdict = await judgeFactuality(answer);

    return {
      score: verdict.score,
      metadata: {
        rationale: verdict.rationale,
      },
    };
  },
);
```

LLM-backed judges should provide their own judge prompt and rubric text.
`vitest-evals` does not prescribe a rubric schema, scoring scale, model
provider, or parser; those stay in the judge. When a harness exposes
`query(...)`, that helper is for the judge model call, not the system under
test. Calling `harness.run(...)` from a judge executes the application again,
so use that only when a second run is intentional.

For an `EvalHarnessRun` returned by fixture `run(...)`,
`toSatisfyJudge(...)` uses the run's canonical text output and reuses the
registered input and metadata. Inside an eval test,
matcher calls on registered raw output or session objects reuse that exact run
context; raw output values are serialized as the judge `output`, so
`expect(result.output).toSatisfyJudge(judge)` stays concise. Other raw values
fall back to the current test's most recent `run(...)` context. For
manually-created runs or values outside an eval context, pass any required
`inputValue`, `metadata`, or `harness` in matcher options. Structured or
programmatic result checks should usually assert on `result.output` directly.
When a judge needs richer normalized context or the configured suite harness,
type it with `JudgeContext`.

When you only need deterministic contract checks, built-ins such as
`StructuredOutputJudge()` and `ToolCallJudge()` are still available. The primary
documentation examples intentionally use factuality/rubric judges because those
match the product's LLM-as-a-judge direction.

## Legacy Compatibility

The root package is harness-first and judge-first. Legacy scorer-first suites
and `evaluate(...)` live under `vitest-evals/legacy`.

```ts
import {
  describeEval,
  StructuredOutputScorer,
  ToolCallScorer,
} from "vitest-evals/legacy";
```
