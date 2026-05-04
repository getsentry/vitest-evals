# Judges And Assertions

Open this when adding or reviewing judges, suite-level scoring, or explicit `toSatisfyJudge(...)` assertions.

## Judge Context

Every judge receives:

| Field | Meaning |
|-------|---------|
| `input` | Canonical text input. |
| `output` | Canonical text output for grading. |
| `inputValue` | Original input value. |
| `metadata` | Readonly per-run metadata. |
| `toolCalls` | Flattened calls from `run.session`. |
| `run` | Full normalized `HarnessRun`. |
| `session` | Normalized session from the run. |
| `harness` | Suite harness, including `prompt(...)`. |

## Custom Judge Pattern

```ts
import { namedJudge, type JudgeContext } from "vitest-evals";

const FactualityJudge = namedJudge(
  "FactualityJudge",
  async ({ harness, input, output, metadata }: JudgeContext<string, CaseMeta>) => {
    const verdict = await harness.prompt(formatRubric({ input, output }), {
      system: "Grade the answer against the rubric.",
      metadata: { expectedStatus: metadata.expectedStatus },
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
| Judge needs structured app output | Read `ctx.run.output` |
| Judge needs canonical text | Read `ctx.output` |
| Judge needs the model setup | Call `ctx.harness.prompt(...)` |

## Built-In Judges

| Judge | Use |
|-------|-----|
| `ToolCallJudge()` | Check expected tool names or arguments from `metadata.expectedTools` or explicit options. |
| `StructuredOutputJudge()` | Check expected fields from `metadata.expected` or explicit options against `run.output`. |

## Matcher Context Rules

- `expect(result).toSatisfyJudge(...)` reuses the fixture-backed run context.
- `expect(result.output).toSatisfyJudge(...)` can reuse the exact run when the output object came from that run.
- Raw values outside an eval context need explicit `inputValue`, `metadata`, `session`, `run`, or `harness` when the judge depends on them.
- Empty `session.outputText` falls back to assistant text, then structured output.
- Calling `ctx.harness.run(...)` inside a judge executes the app again; only do this when the judge intentionally needs a second run.

## Review Checklist

- Custom judges are wrapped in `namedJudge(...)`.
- Scores are numbers or `null`; failure behavior is controlled by thresholds.
- Rationale or parsed judge output is placed under `metadata`.
- LLM-backed judges use `harness.prompt(...)`, not a separate provider setup hidden inside the test.
