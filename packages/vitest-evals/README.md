# vitest-evals

Harness-backed AI testing on top of Vitest.

Use this package README for the core authoring model. For a guided setup path,
runtime-specific harness examples, replay, and GitHub Actions reporting, start
with the docs site: `https://vitest-evals.sentry.dev/docs`.

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

For GitHub Actions summaries and annotations, emit Vitest JSON and use the
native `getsentry/vitest-evals` action. No extra npm package is needed in the
workflow.

## Core Model

- `describeEval(...)` binds exactly one harness to a suite
- the suite callback receives a fixture-backed Vitest `it`
- `run(input, { metadata? })` executes the harness explicitly and returns a
  normalized `HarnessRun`
- the returned `result.output` is the app-facing value you assert on directly
- the returned `result.session` is the canonical JSON-serializable transcript for
  reporting, replay, tool assertions, and judges
- the returned `result.traces` contains JSON-serializable operation spans; the
  first-party harnesses attach run, model, and tool spans automatically, while
  `createHarness(...)` attaches fallback run and tool spans for custom harnesses
  that do not return traces themselves. Span attributes include typed
  OpenTelemetry GenAI semantic keys while still allowing provider-specific
  metadata
- scenario-specific judge criteria can live in `input`; use `metadata` for
  per-run expectations or harness configuration that are not part of the
  scenario payload
- suite-level `judges` are optional and run automatically after each `run(...)`
- suite-level `judgeThreshold` controls fail-on-score for those automatic judges
- every judge is a named object with `assess(ctx)`
- every judge receives `JudgeContext` with typed `input`, typed `output`, the
  normalized run/session, tool calls, and metadata; `output` is only optional
  when the harness output type includes `undefined`
- judges own their prompt, rubric, and parsing; LLM-backed judges use
  `ctx.runJudge(...)` from a configured `judgeHarness`
- explicit judge assertions use
  `await expect(result).toSatisfyJudge(judge, context)`

## Explicit Run Example

```ts
import { getModel } from "@mariozechner/pi-ai";
import { expect } from "vitest";
import { piAiHarness, piAiJudgeHarness } from "@vitest-evals/harness-pi-ai";
import {
  describeEval,
  FactualityJudge,
  toolCalls,
} from "vitest-evals";
import { createRefundAgent } from "../src/refundAgent";

const judgeHarness = piAiJudgeHarness({
  model: getModel("anthropic", "claude-sonnet-4-5"),
  temperature: 0,
});

describeEval(
  "refund agent",
  {
    harness: piAiHarness({
      agent: () => createRefundAgent(),
    }),
    judgeHarness,
    judges: [FactualityJudge()],
    judgeThreshold: 0.6,
  },
  (it) => {
    it("approves a refundable invoice", async ({ run }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          expected: "The refund request is approved.",
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

## Terminal Reporting

The terminal reporter has two eval report levels. Normal mode prints compact
test, score, usage, and tool-count summaries. Info mode adds per-tool summaries,
arguments, timing/size metadata, replay status, and final output summaries.
Set `VITEST_EVALS_REPORT_LEVEL=info`, or pass `--info` through the workspace
eval scripts, to enable it. `--verbose` and `-v` remain aliases for
compatibility.

Full transcripts and spans are preserved in the Vitest JSON report metadata.

## GitHub Actions Reporting

Use Vitest JSON as the eval report artifact. It preserves the `meta` field that
contains eval scores and normalized harness runs.

```sh
vitest run --config vitest.evals.config.ts \
  --reporter=vitest-evals/reporter \
  --reporter=json \
  --outputFile.json=vitest-results.json
```

```yaml
- uses: getsentry/vitest-evals@v0
  if: always()
  with:
    results: vitest-results.json
```

The GitHub reporter action writes a job summary, emits short failure
annotations, can publish a separate Check Run, and can reduce sharded eval JSON
artifacts into one combined report.

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
their prompt/rubric text separately from the system under test.
When generics are needed, use `createHarness<Input, Output, Metadata>(...)`.

```ts
import {
  createHarness,
  createJudge,
  createJudgeHarness,
  describeEval,
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

type AppEvalMetadata = Record<string, never>;

type AppOutput = {
  replies: Array<{ text: string }>;
  sideEffects: string[];
};

const appHarness = createHarness<AppEvalInput, AppOutput, AppEvalMetadata>({
  name: "custom-app",
  run: async ({ input, signal }) => {
    const result = await replayAppEvents(input.events, {
      signal,
    });

    return {
      output: {
        replies: result.replies,
        sideEffects: result.sideEffects,
      },
      artifacts: {
        replyCount: result.replies.length,
      },
      usage: {},
    };
  },
});

const judgeHarness = createJudgeHarness({
  name: "app-rubric-judge-model",
  run: async ({ prompt }, { signal }) =>
    promptJudgeModel({ prompt, signal }),
});

const AppRubricJudge = createJudge(
  "AppRubricJudge",
  async (ctx: JudgeContext<AppEvalInput, AppOutput, AppEvalMetadata>) => {
    if (!ctx.runJudge) {
      throw new Error("AppRubricJudge requires a configured judgeHarness.");
    }

    const verdict = await ctx.runJudge({
      prompt: formatRubricPrompt({
        output: ctx.output,
        criteria: ctx.input.criteria,
      }),
      responseFormat: { type: "json" },
    });

    return parseRubricVerdict(verdict);
  },
);

describeEval(
  "app behavior",
  {
    harness: appHarness,
    judgeHarness,
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

Use `Harness.run(...)` for the application under test. Calling
`ctx.harness.run(...)` from inside a judge runs the application a second time,
so reserve that for judges that intentionally need a second execution. Put
criteria on `input` when they are part of the scenario itself; use per-run
`metadata` for harness configuration or expectations that are not part of the
scenario payload. `createHarness(...)` builds a default user/assistant session
from `input` and typed `output`; return a full `HarnessRun` only when you need
exact session control.

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
import { openai } from "@ai-sdk/openai";
import { aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
import { expect } from "vitest";
import { FactualityJudge } from "vitest-evals";

const judgeHarness = aiSdkJudgeHarness({
  model: openai("gpt-4.1-mini"),
  temperature: 0,
});
const factualityJudge = FactualityJudge({ judgeHarness });

await expect(result).toSatisfyJudge(factualityJudge, {
  expected: "Paris is the capital of France.",
  threshold: 0.6,
});
```

For lower-level cases, the matcher also accepts raw values and synthetic judge
context. Pass every context field the judge needs when the value did not come
from eval fixture `run(...)`:

```ts
await expect({ status: "approved" }).toSatisfyJudge(MyJudge, {
  input: "Refund invoice inv_123",
});
```

Use the built-in factuality judge when you want a model-backed factuality grade
over the normalized run:

```ts
import { openai } from "@ai-sdk/openai";
import { aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
import { FactualityJudge } from "vitest-evals";

export const judgeHarness = aiSdkJudgeHarness({
  model: openai("gpt-4.1-mini"),
  temperature: 0,
});
export const factualityJudge = FactualityJudge({ judgeHarness });
```

For custom judge providers, create a dedicated judge harness with the same
prompt contract:

```ts
import {
  createJudgeHarness,
  FactualityJudge,
  type JudgeHarness,
} from "vitest-evals";
import { callJudgeModel } from "./judgeModel";

export const judgeHarness: JudgeHarness = createJudgeHarness({
  name: "factuality-judge-model",
  run: async ({ system, prompt }, { signal }) =>
    callJudgeModel({ system, prompt, signal }),
});

export const factualityJudge = FactualityJudge({ judgeHarness });
```

Configure that judge harness once and reuse the same judge with any app
harness:

```ts
import { describeEval } from "vitest-evals";
import { aiSdkRefundHarness } from "./aiSdkRefundHarness";
import { piRefundHarness } from "./piRefundHarness";
import { factualityJudge } from "./sharedJudges";

describeEval("ai sdk refund agent", {
  harness: aiSdkRefundHarness,
  judges: [factualityJudge],
});

describeEval("pi refund agent", {
  harness: piRefundHarness,
  judges: [factualityJudge],
});
```

Use `createJudge(...)` for custom judges so reporter output gets a stable
label. Custom LLM-backed judges should provide their own judge prompt, rubric
text, and parser, then call `ctx.runJudge(...)` for the provider-specific model
request. Bind a reusable default with `createJudge({ name, judgeHarness,
assess })` or pass `judgeHarness` on the matcher or suite. Core curries the
matcher, judge, or explicit suite `judgeHarness` into that function with the
current run's abort signal. Matcher options win over a judge default, and a
judge default wins over the suite default. Explicit matcher calls can also
reuse a single unambiguous judge-level harness from the suite's automatic
judges, but automatic judges do not inherit inferred harnesses from sibling
judges. That inference requires those judges to share the same judge harness
instance. Leave `judgeHarness` unset for suites that only use deterministic
judges. Calling `harness.run(...)` from a judge executes the application again,
so use that only when a second run is intentional.

For an `EvalHarnessRun` returned by fixture `run(...)`,
`toSatisfyJudge(...)` uses the run's typed `output` and reuses the registered
input and metadata. It requires any custom judge params and rejects judges whose
output type cannot assess the received value. Inside an eval test,
matcher calls on registered output objects or session objects reuse that exact
run context when the value can be registered by reference, so
`expect(result.output).toSatisfyJudge(judge)` stays concise for structured
outputs. Other raw values fall back to the current test's most recent
`run(...)` context. For
manually-created runs or values outside an eval context, pass any required
`input`, `metadata`, or `harness` in matcher options. Structured or
programmatic result checks should usually assert on `result.output` directly.
When a judge needs richer normalized context or the configured suite harness,
type it with `JudgeContext`.

When you only need deterministic contract checks, built-ins such as
`StructuredOutputJudge()` and `ToolCallJudge()` are still available.
