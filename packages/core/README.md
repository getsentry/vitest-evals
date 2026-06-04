# @vitest-evals/core

Shared primitives and JSON artifact schemas for `vitest-evals`.

This package owns dependency-light data contracts shared by the user-facing
Vitest integration, GitHub reporter, and future report UIs. It validates Vitest
JSON reports, reads `task.meta.eval` and `task.meta.harness`, preserves full
normalized harness runs, and collects one or more JSON reports into a multi-run
workspace model.

```ts
import {
  collectReportWorkspace,
  parseVitestJsonReport,
} from "@vitest-evals/core";

const report = parseVitestJsonReport(JSON.parse(rawJson));
const workspace = collectReportWorkspace(
  {
    report,
    source: "vitest-results.json",
  },
  {
    workspace: process.cwd(),
  },
);
```

Use this package when building report consumers that need the full JSON
artifact shape, such as the GitHub reporter, local report UI, or static CI
report exports. Vitest lifecycle APIs such as `describeEval(...)`, matchers,
and reporters stay in `vitest-evals`.

Node report consumers can use `@vitest-evals/core/node` for shared path, glob,
directory, and JSON file readers without pulling filesystem APIs into the
browser-safe main entry.
