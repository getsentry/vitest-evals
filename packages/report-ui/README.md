# @vitest-evals/report-ui

Local React report UI for `vitest-evals` JSON artifacts.

```bash
pnpm exec vitest-evals serve vitest-results.json
pnpm exec vitest-evals serve "eval-results/*.json"
pnpm exec vitest-evals serve eval-results/
```

The product CLI accepts Vitest JSON result files, simple `*` and `**` globs,
and directories containing JSON files. It collects them into the shared
`ReportWorkspace` model from `@vitest-evals/core`, serves the SPA locally, and
exposes the collected data at `/data/workspace.json`. The viewer separates
application, judge, and total token and cost usage at workspace and case level.

For visual QA, run the browser scenes. They build the UI, render each scene
from `visual/scenes.ts` in Chromium, fail on page errors or overlapping
controls, and write screenshots to `.visual/`:

```bash
pnpm exec playwright install chromium   # once
pnpm run test:visual
```

To click around the same fixtures yourself, serve them:

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
