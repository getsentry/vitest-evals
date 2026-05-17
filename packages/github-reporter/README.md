# @vitest-evals/github-reporter

GitHub Actions reporting for `vitest-evals` runs.

This package reads Vitest's built-in JSON report. Vitest JSON includes each
test's `meta` field, which is where `vitest-evals` records harness runs,
scores, judge rationales, usage, and tool calls.

JUnit XML can still be emitted for CI systems that expect it, but it is not the
source of truth for eval reporting.

## Usage

```sh
pnpm exec vitest run apps packages \
  --config=./vitest.config.ts \
  --reporter=vitest-evals/reporter \
  --reporter=json \
  --outputFile.json=vitest-results.json

pnpm exec vitest-evals-github-report
```

In GitHub Actions, the reporter writes to `GITHUB_STEP_SUMMARY` when available
and emits terse workflow-command annotations for failed evals.

## Check Run

To publish a separate `vitest-evals` Check Run, opt in explicitly:

```sh
GITHUB_TOKEN=... pnpm exec vitest-evals-github-report --check-run
```

The Check Run path requires the normal GitHub Actions environment plus a token
with `checks: write`. If configuration or permission is missing, the command
keeps the job summary and workflow annotations and warns instead of failing.

```yaml
permissions:
  contents: read
  checks: write
```

## Recommended Workflow

```yaml
jobs:
  evals:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install

      - name: Run evals
        run: |
          pnpm exec vitest run apps packages \
            --config=./vitest.config.ts \
            --reporter=vitest-evals/reporter \
            --reporter=json \
            --outputFile.json=vitest-results.json

      - name: Publish eval report
        if: always()
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: |
          pnpm exec vitest-evals-github-report --check-run
```

## Output Rules

- Job summary is the primary human-readable report.
- Failure lists use numbered key/value blocks, not wide tables.
- Long judge reasons live inside `<details>` blocks and fenced text.
- Workflow annotations include only the first useful failure line.
- Check Run annotations include richer `raw_details` when available.
- Output is plain ASCII markdown.
