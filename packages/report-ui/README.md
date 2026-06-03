# @vitest-evals/report-ui

Local React report UI for `vitest-evals` JSON artifacts.

```bash
pnpm exec vitest-evals-view vitest-results.json
pnpm exec vitest-evals-view "eval-results/*.json"
pnpm exec vitest-evals-view eval-results/
```

The CLI accepts Vitest JSON result files, simple `*` and `**` globs, and
directories containing JSON files. It collects them into the shared
`ReportWorkspace` model from `@vitest-evals/core`, serves the SPA locally, and
exposes the collected data at `/data/workspace.json`.

For visual QA, build and serve the intentionally awkward fixture:

```bash
pnpm --filter @vitest-evals/report-ui run visual:fixture
```

```ts
import { serveReportUi } from "@vitest-evals/report-ui";

const server = await serveReportUi({
  inputs: ["vitest-results.json"],
  workspace: process.cwd(),
});

console.log(server.url);
```
