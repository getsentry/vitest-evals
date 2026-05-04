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
- every judge receives `JudgeContext`, including the configured `harness` with
  its required `prompt` function
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
  "refund agent",
  {
    harness: piAiHarness({
      createAgent: () => createRefundAgent(),
      prompt: judgePrompt,
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
`@vitest-evals/harness-openai-agents` with an existing `Agent` or
`createAgent()` factory and a `Runner` / `createRunner()` callback. The harness
calls `Runner.run(agent, input, options)` by default and exposes the same
normalization and replay hooks when the app needs a custom entrypoint or
structured domain output mapping.

## Custom App Harnesses

First-party harness packages are conveniences, not the only supported path. If
you need to test a full application flow, define a harness that runs your app
through its normal entrypoint and returns a normalized `HarnessRun`. The same
harness should also expose `prompt`, which LLM-backed judges can reuse through
`JudgeContext.harness.prompt`.

```ts
import {
  describeEval,
  namedJudge,
  type JudgeContext,
} from "vitest-evals";
import {
  normalizeContent,
  normalizeMetadata,
  toJsonValue,
  type Harness,
  type HarnessRun,
} from "vitest-evals/harness";

type AppEvent = {
  type: string;
  payload: Record<string, unknown>;
};

type AppEvalInput = {
  events: AppEvent[];
  criteria: {
    contract: string;
    pass: string[];
    fail?: string[];
  };
};

const appHarness: Harness<AppEvalInput> = {
  name: "custom-app",
  prompt: (input, options) => promptJudgeModel(input, options),
  run: async (input, context): Promise<HarnessRun> => {
    const result = await replayAppEvents(input.events, {
      signal: context.signal,
    });
    const output = {
      replies: result.replies,
      sideEffects: result.sideEffects,
    };

    return {
      output: toJsonValue(output),
      session: {
        messages: [
          ...input.events.map((event) => ({
            role: "user" as const,
            content: normalizeContent(event),
          })),
          ...result.replies.map((reply) => ({
            role: "assistant" as const,
            content: normalizeContent(reply.text),
            metadata: normalizeMetadata({
              target: reply.target,
            }),
          })),
        ],
        outputText: result.replies.map((reply) => reply.text).join("\n\n"),
        metadata: normalizeMetadata({
          replyCount: result.replies.length,
        }),
      },
      usage: {},
      artifacts:
        Object.keys(context.artifacts).length > 0
          ? context.artifacts
          : undefined,
      errors: [],
    };
  },
};

const AppRubricJudge = namedJudge(
  "AppRubricJudge",
  async (
    ctx: JudgeContext<AppEvalInput, Record<string, unknown>, typeof appHarness>,
  ) => {
    const verdict = await ctx.harness.prompt(
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

Use `Harness.run(...)` for the application under test and `Harness.prompt(...)`
for judge model calls. Calling `ctx.harness.run(...)` from inside a judge runs
the application a second time, so reserve that for judges that intentionally
need a second execution. Put criteria on `inputValue` when they are part of the
scenario itself; use per-run `metadata` for harness configuration or
expectations that are not part of the scenario payload. `session.outputText` is
the canonical text sent to judges, so define it deliberately when your app
returns structured artifacts.

Provider setup and rubric parsing stay in your harness and judge. The core
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

LLM-backed judges can reuse the suite harness prompt by calling
`harness.prompt(...)`. `vitest-evals` does not prescribe a rubric schema,
scoring scale, model provider, or parser; those stay in the judge. Calling
`harness.run(...)` from a judge executes the application again, so use that
only when a second run is intentional.

For an `EvalHarnessRun` returned by fixture `run(...)`,
`toSatisfyJudge(...)` uses the run's canonical text output and reuses the
registered input, metadata, and harness prompt. Inside an eval test,
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
