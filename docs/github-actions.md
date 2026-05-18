# GitHub Actions Reporting

`getsentry/vitest-evals` is the GitHub Actions reporting
surface for `vitest-evals`. It reads Vitest JSON output and publishes GitHub
job summaries, workflow annotations, and optional Check Runs.

Use JSON as the eval artifact because it preserves `task.meta.eval` and
`task.meta.harness`; JUnit XML does not carry the full eval metadata.

## Minimal Workflow

```yaml
jobs:
  evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install

      - name: Run evals
        run: |
          pnpm exec vitest run evals \
            --reporter=vitest-evals/reporter \
            --reporter=json \
            --outputFile.json=vitest-results.json

      - uses: getsentry/vitest-evals@v0
        if: always()
        with:
          results: vitest-results.json
```

The report step still runs after failed evals because of `if: always()`. The
job remains failed when the eval step fails.

## Check Run

Add `checks: write` and enable `publish-check`.

```yaml
permissions:
  contents: read
  checks: write

steps:
  - uses: getsentry/vitest-evals@v0
    if: always()
    with:
      results: vitest-results.json
      publish-check: true
```

If the token or permission is missing, the action keeps the job summary and
workflow annotations and warns instead of failing the job.

## Sharded Evals

Split evals with a matrix, upload one JSON artifact per shard, then reduce them
in one final reporting job.

```yaml
jobs:
  evals:
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install

      - name: Run eval shard
        run: |
          pnpm exec vitest run evals \
            --shard=${{ matrix.shard }}/4 \
            --reporter=vitest-evals/reporter \
            --reporter=json \
            --outputFile.json=vitest-results-${{ matrix.shard }}.json

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: vitest-evals-${{ matrix.shard }}
          path: vitest-results-${{ matrix.shard }}.json

  report:
    if: always()
    needs: [evals]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: vitest-evals-*
          path: eval-results
          merge-multiple: true

      - uses: getsentry/vitest-evals@v0
        with:
          results: eval-results/*.json
          publish-check: true
          fail-on-failures: true
```

`fail-on-failures` is useful when the reducer job should be the final required
check. If shard jobs are already required and fail on their own, leave it off.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `results` | `vitest-results.json` | Vitest JSON result files. Supports paths, `*` and `**` globs, and newline-separated entries. |
| `publish-summary` | `true` | Write a GitHub Actions job summary. |
| `publish-annotations` | `true` | Emit GitHub workflow annotations for failed evals. |
| `publish-check` | `false` | Publish one GitHub Check Run for the combined report. |
| `check-name` | `vitest-evals` | Name of the GitHub Check Run. |
| `github-token` | `${{ github.token }}` | Token used for Check Run publishing. |
| `fail-on-failures` | `false` | Fail the action when the combined report failed. |
| `max-annotations` | unset | Maximum number of failure annotations to publish. Check Run annotations are capped at 50 by GitHub. |
| `max-failures` | unset | Maximum number of detailed failures to include in summaries and checks. |

## JUnit

Emit JUnit only when another CI tool needs XML:

```sh
pnpm exec vitest run evals \
  --reporter=vitest-evals/reporter \
  --reporter=json \
  --reporter=junit \
  --outputFile.json=vitest-results.json \
  --outputFile.junit=tests.junit.xml
```
