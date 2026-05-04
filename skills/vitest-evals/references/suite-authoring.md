# Suite Authoring

Open this when writing or reviewing a normal harness-backed eval suite.

## Required Shape

```ts
import { expect } from "vitest";
import { describeEval, toolCalls } from "vitest-evals";

describeEval("refund agent", { harness }, (it) => {
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
});
```

## Suite Rules

| Rule | Why |
|------|-----|
| Use one `harness` per `describeEval(...)` suite. | Core stores one normalized run per explicit execution. |
| Call `run(...)` inside the test body. | The test controls when the system under test executes. |
| Assert domain behavior on `result.output`. | Harnesses preserve app-facing results separately from trace data. |
| Assert trace behavior on `result.session`. | Reporter, replay, tools, and judges consume normalized sessions. |
| Use `metadata` for per-run expectations or harness settings. | Judges receive it without polluting the scenario input. |
| Use `it.for(...)` for case tables. | Keep table-driven suites idiomatic Vitest. |

## Core Options

| Option | Use |
|--------|-----|
| `harness` | Required runtime adapter for the suite. |
| `judges` | Optional automatic judges after each successful `run(...)`. |
| `judgeThreshold` | Optional fail threshold for automatic judges; `null` records without failing. |
| `skipIf` | Optional environment gate for provider-dependent suites. |

## Normalized Run Checklist

- `run.output` is JSON-serializable or omitted.
- `run.session.messages` contains user, assistant, and tool records worth reporting.
- `run.session.outputText` is set deliberately when judges need canonical text.
- `run.usage` includes provider/model/token/tool data when available.
- `run.artifacts` contains only JSON-safe diagnostics set through `context.setArtifact(...)`.
- `run.errors` is an array, even on success.

## Reporter Setup

For direct eval file runs, include the custom reporter:

```sh
pnpm exec vitest run path/to/file.eval.ts -c vitest.config.ts --reporter=./packages/vitest-evals/src/reporter.ts
```
