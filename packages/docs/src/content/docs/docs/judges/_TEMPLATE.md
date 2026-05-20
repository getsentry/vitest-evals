---
title: RuntimeJudge
description: Score a specific part of a normalized harness run.
editUrl: false
---

Open with the behavior this judge protects and when it should be preferred over
a plain Vitest assertion or a custom judge.

## Usage

Show the default suite-level configuration first. Add options only after the
reader sees the recommended path.

```ts title="evals/workflow.eval.ts"
describeEval("workflow", {
  harness,
  judges: [RuntimeJudge()],
});
```

## Metadata

Show the per-run metadata the judge expects. Keep expected values near the case
that owns them.

```ts title="evals/workflow.eval.ts"
const result = await run("input", {
  metadata: {
    expected: { status: "approved" },
  },
});
```

## Failure Behavior

Explain what causes the judge to fail, what threshold or score behavior applies,
and what metadata a report will show when it changes.
