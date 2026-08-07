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

## Score and Pass-Rate Gates

By default the action reports scores and failures without failing the step.
Use a gate when the report job should own green/red:

- `fail-on-failures: true` requires every eval case to pass
- `min-pass-rate: 0.8` requires at least 80% of eval cases to pass
- `min-score-average: 0.75` requires the average score to stay at or above 0.75

When a gate is configured:

- `status`, Check Run conclusion, and step exit all follow the gate
- the Check Run title / `gate-title` show the decision
  (for example `Eval pass rate 63.7% — required 80.0%`)
- case misses become warnings when the gate still passes, so a green check is
  not flooded with red failure annotations
- non-eval / infrastructure failures still fail hard
- missing scores fail closed when `min-score-average` is set

Without a gate, `status` still mirrors the raw report (`any case failed`), but
the step stays green unless you set `fail-on-failures` / a floor. Use the
`evals-*` count outputs for raw tallies either way.

```yaml
- id: report
  uses: getsentry/vitest-evals@v0
  with:
    results: eval-results/*.json
    publish-check: true
    min-pass-rate: 0.8

# ${{ steps.report.outputs.status }}       # passed | failed (gate decision)
# ${{ steps.report.outputs.gate-title }}   # Eval pass rate 90.0% — floor 80.0%
# ${{ steps.report.outputs.pass-rate }}    # 0.90
# ${{ steps.report.outputs.evals-failed }} # raw miss count
```

`fail-on-failures: true` is equivalent to `min-pass-rate: 1`.

## Sharded Evals

Split evals with a matrix, upload one JSON artifact per shard, then reduce them
in one final reporting job. Keep shard jobs from failing the workflow on
qualitative misses when the reducer owns the gate:

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
        # continue-on-error lets qualitative misses still upload JSON.
        # Missing result files should still fail the shard.
        id: run
        continue-on-error: true
        run: |
          pnpm exec vitest run evals \
            --shard=${{ matrix.shard }}/4 \
            --reporter=vitest-evals/reporter \
            --reporter=json \
            --outputFile.json=vitest-results-${{ matrix.shard }}.json

      - name: Require eval results
        if: steps.run.conclusion != 'skipped'
        run: test -f vitest-results-${{ matrix.shard }}.json

      - uses: actions/upload-artifact@v4
        if: success()
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
          min-pass-rate: 0.8
```

Use `fail-on-failures: true` instead of a pass-rate floor when every case must
pass. If shard jobs are already required and fail on their own, leave gates off
on the reducer.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `results` | `vitest-results.json` | Vitest JSON result files. Supports paths, `*` and `**` globs, and newline-separated entries. |
| `publish-summary` | `true` | Write a GitHub Actions job summary. |
| `publish-annotations` | `true` | Emit GitHub workflow annotations for failed evals. |
| `publish-check` | `false` | Publish one GitHub Check Run for the combined report. |
| `check-name` | `vitest-evals` | Name of the GitHub Check Run. |
| `github-token` | `${{ github.token }}` | Token used for Check Run publishing. |
| `fail-on-failures` | `false` | Fail the action when any eval case failed. Equivalent to `min-pass-rate: 1`. |
| `min-pass-rate` | unset | Minimum fraction of eval cases that must pass (`0`-`1`). |
| `min-score-average` | unset | Minimum average eval score across scored cases (`0`-`1`). |
| `max-annotations` | unset | Maximum number of failure annotations to publish. Check Run annotations are capped at 50 by GitHub. |
| `max-failures` | unset | Maximum number of detailed failures to include in summaries and checks. |

## Outputs

| Output | Description |
| --- | --- |
| `status` | Effective CI status: `passed` or `failed`. Follows the gate when one is configured; otherwise mirrors the raw report. |
| `results-count` | Number of Vitest JSON result files included. |
| `evals-total` | Total eval cases included in the report. |
| `evals-passed` | Passed eval cases included in the report. |
| `evals-failed` | Failed eval cases included in the report. |
| `pass-rate` | Eval pass rate as a 0-1 ratio (`0.80`), or `n/a`. |
| `score-average` | Average eval score across the combined report. |
| `score-minimum` | Minimum eval score across the combined report. |
| `gate-status` | Same value as `status` (kept for explicit gate wiring). |
| `gate-title` | Short gate title used for Check Runs and suite-level annotations. |
| `gate-message` | Human-readable gate decision. |
| `check-url` | URL of the published GitHub Check Run, when available. |

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

## Vitest GitHub Actions Reporter

Vitest auto-adds its built-in `github-actions` reporter when
`GITHUB_ACTIONS=true`. That reporter can write a generic job summary such as
`Test Files: 1 pass · 1 total`, which is usually noise next to the
`vitest-evals` summary. Prefer reading the `vitest-evals` job summary and
Check Run from the report step; silencing Vitest's auto reporter is version-
specific and left to each consumer's Vitest config.
