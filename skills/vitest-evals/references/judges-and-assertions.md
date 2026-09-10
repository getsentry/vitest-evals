# Judges And Assertions

Open this when adding or reviewing judges, suite-level scoring, or explicit `toSatisfyJudge(...)` assertions.

## Judge Context

Every judge receives:

| Field | Meaning |
|-------|---------|
| `input` | Original typed eval input. |
| `output` | Typed app output returned by the harness. |
| `toolCalls` | Flattened calls from the run. |
| `run` | Full normalized `HarnessRun`. |
| `session` | Normalized session from the run. |
| `harness` | App harness for intentional second runs. |
| `runJudge` | Runs the configured judge harness and records its usage. |

## Custom Judge Pattern

```ts
import { aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
import { createJudge } from "vitest-evals";

const judgeHarness = aiSdkJudgeHarness({ model: rubricModel });

const RefundRubricJudge = createJudge({
  name: "RefundRubricJudge",
  judgeHarness,
  async assess(ctx) {
    if (!ctx.runJudge) {
      throw new Error("RefundRubricJudge requires a judge harness.");
    }

    const verdict = await ctx.runJudge({
      prompt: formatRubric({
        input: ctx.input,
        output: ctx.output,
        expectedStatus: ctx.expectedStatus,
      }),
      responseFormat: { type: "json" },
    });

    return parseVerdict(verdict);
  },
});
```

## Automatic Vs Explicit

| Need | Use |
|------|-----|
| Every `run(...)` in a suite must be scored the same way | Suite `judges: [Judge]` |
| A score below a threshold should fail the test | `judgeThreshold` or matcher `threshold` |
| Record a score without failing | `threshold: null` |
| Only one assertion needs the judge | `await expect(result).toSatisfyJudge(Judge)` |
| Judge needs structured app output | Type `JudgeContext<..., TOutput>` and read `ctx.output` |
| Judge needs text | Use a text `TOutput` or explicitly project structured output to text |
| Judge needs a model call | Configure a `judgeHarness`, then call `ctx.runJudge(...)` |

## Built-In Judges

| Judge | Use |
|-------|-----|
| `FactualityJudge({ judgeHarness, expected })` | Model-grade normalized output against suite-wide expected text. |
| `ToolCallJudge({ expectedTools })` | Check suite-wide expected tool names or arguments. |
| `StructuredOutputJudge({ expected })` | Check suite-wide expected fields against `run.output`. |

## Matcher Context Rules

- `expect(result).toSatisfyJudge(...)` reuses the fixture-backed run context.
- `expect(result.output).toSatisfyJudge(...)` can reuse the exact run when the output object came from that run.
- Raw values outside an eval context need explicit `input`, `session`, `run`,
  `harness`, or custom judge params when the judge depends on them.
- Normalized sessions infer output from the latest assistant message content.
- Calling `ctx.harness.run(...)` inside a judge executes the app again; only do this when the judge intentionally needs a second run.

## Judge Usage

- A judge harness is separate from the app harness. Return a full `HarnessRun`
  when the provider exposes usage.
- `ctx.runJudge(...)` returns the judge output, while vitest-evals records the
  complete normalized run under the score's `judgeRuns` field.
- Multiple `runJudge(...)` calls from one judge are retained separately.
- Stable token fields and `costUsd` contribute to separate application, judge,
  and combined report totals. Provider-specific pricing details stay under
  `usage.metadata`.

## Review Checklist

- Custom judges should usually use `createJudge("Name", assess)`.
- Scores are numbers or `null`; failure behavior is controlled by thresholds.
- Rationale or parsed judge output is placed under `metadata`.
- Model-backed judges own the prompt, rubric, and parser. Provider setup belongs
  in a `judgeHarness`, not the app harness.
- Model-backed judge harnesses retain normalized usage instead of returning only
  provider text when usage is available.
