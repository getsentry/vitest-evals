# Testing Standards for vitest-evals

## Overview

The repo now has two testing stories:

- harness-first runtime and reporter behavior
- legacy scorer compatibility

New work should default to harness-first tests. Legacy tests still matter, but
they should stay explicitly isolated.

## Test Organization

```text
packages/vitest-evals/src/
  harness.test.ts
  reporter.test.ts
  autoevals-compatibility.test.ts
  ai-sdk-integration.test.ts
  legacy/
    evaluate/index.test.ts
    scorers/*.test.ts
packages/harness-ai-sdk/src/
  index.test.ts
packages/harness-pi-ai/src/
  index.test.ts
apps/demo-pi/evals/
  *.eval.ts
```

## What Must Be Tested

### Root Harness/Judge Changes

Cover:

- normalized run/session behavior
- single-run semantics for automatic judges plus explicit assertions
- matcher behavior for `toBeJudged(...)` and `toSatisfyJudge(...)`
- any task metadata the reporter depends on

### Reporter Changes

Cover:

- compact output
- verbose tiers
- harness summaries
- judge sub-results
- failure formatting
- replay/tool metadata when relevant

### Harness Package Changes

Cover:

- default runtime adaptation
- escape hatches such as custom `run`, `output`, or `session`
- error handling and partial-run attachment
- usage/tool normalization
- replay behavior for `@vitest-evals/harness-pi-ai`

### Legacy Compatibility Changes

If you touch scorer-first code, add tests under
`packages/vitest-evals/src/legacy/...` and verify the legacy entrypoint still
works.

## Example Harness Test Pattern

```ts
describeEval(
  "refund agent",
  {
    harness: piAiHarness(createRefundAgent),
  },
  (it) => {
    it("approves refundable invoice", async ({ run }) => {
      const result = await run("Refund invoice inv_123");
      const calls = toolCalls(result.session);

      expect(calls.map((call) => call.name)).toEqual([
        "lookupInvoice",
        "createRefund",
      ]);
      expect(calls[1]?.arguments).toMatchObject({
        invoiceId: "inv_123",
        amount: 4200,
      });
    });
  },
);
```

## Example Legacy Test Pattern

```ts
import { StructuredOutputScorer } from "vitest-evals/legacy";

test("scores valid JSON output", async () => {
  const scorer = StructuredOutputScorer();
  const result = await scorer({
    input: "Refund invoice inv_123",
    output: JSON.stringify({ status: "approved" }),
    expected: { status: "approved" },
  });

  expect(result.score).toBe(1);
});
```

## Verification Expectations

Before committing, run the smallest meaningful check set for the files touched.
Common commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm evals
```

When working on docs or structure-only changes, at minimum re-scan the repo for
stale references that would mislead contributors or users.
