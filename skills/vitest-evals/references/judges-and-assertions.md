# Judges And Assertions

Open this when adding or reviewing judges, suite-level scoring, or explicit `toSatisfyJudge(...)` assertions.

## Judge Context

Every judge receives:

| Field | Meaning |
|-------|---------|
| `input` | Original typed eval input. |
| `output` | Typed app output returned by the harness. |
| `metadata` | Readonly per-run metadata. |
| `toolCalls` | Flattened calls from `run.session`. |
| `run` | Full normalized `HarnessRun`. |
| `session` | Normalized session from the run. |
| `harness` | Suite harness for intentional second runs. |

## Custom Judge Pattern

```ts
import {
  createJudge,
  type JudgeContext,
} from "vitest-evals";

const RefundRubricJudge = createJudge(
  "RefundRubricJudge",
  async (ctx: JudgeContext<string, RefundOutput, CaseMeta>) => {
    const verdict = await callJudgeModel({
      prompt: formatRubric({
        input: ctx.input,
        output: ctx.output,
        expectedStatus: ctx.metadata.expectedStatus,
      }),
    });

    return parseVerdict(verdict);
  },
);
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
| Judge needs shared model setup | Keep a local helper in the judge module, or use the provider-helper overload of `createJudge(...)` when curried run options are needed |

## Built-In Judges

| Judge | Use |
|-------|-----|
| `FactualityJudge({ model })` | Model-grade normalized output against `metadata.expected` or explicit `expected`. |
| `ToolCallJudge()` | Check expected tool names or arguments from `metadata.expectedTools` or explicit options. |
| `StructuredOutputJudge()` | Check expected fields from `metadata.expected` or explicit options against `run.output`. |

## Matcher Context Rules

- `expect(result).toSatisfyJudge(...)` reuses the fixture-backed run context.
- `expect(result.output).toSatisfyJudge(...)` can reuse the exact run when the output object came from that run.
- Raw values outside an eval context need explicit `input`, `metadata`, `session`, `run`, or `harness` when the judge depends on them.
- Normalized sessions infer output from the latest assistant message content.
- Calling `ctx.harness.run(...)` inside a judge executes the app again; only do this when the judge intentionally needs a second run.

## Review Checklist

- Custom judges should usually use `createJudge("Name", assess)`.
- Scores are numbers or `null`; failure behavior is controlled by thresholds.
- Rationale or parsed judge output is placed under `metadata`.
- LLM-backed judges provide the judge prompt/rubric text. Shared provider setup
  belongs in a judge-side helper, not on the app harness.
