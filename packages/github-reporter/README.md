# @vitest-evals/github-reporter

GitHub Actions reporting internals for `vitest-evals` runs.

The user-facing API is the native GitHub Action:

```yaml
- uses: getsentry/vitest-evals@v0
  if: always()
  with:
    results: vitest-results.json
```

The action reads Vitest's built-in JSON report. Vitest JSON includes each test's
`meta` field, which is where `vitest-evals` records harness runs, scores, judge
rationales, usage, and tool calls.

JUnit XML can still be emitted for CI systems that expect it, but it is not the
source of truth for eval reporting.

## Check Run

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
      min-pass-rate: 0.8
```

On `pull_request`, the Check Run attaches to the PR head SHA (not the temporary
merge `GITHUB_SHA`) so it shows on the PR checks list. Override with the `sha`
input when needed.

When a Check Run publishes successfully with a gate, the action step soft-fails
by default so the Check Run owns green/red. If publishing is skipped, the step
still fails on a rejected gate. Set `soft-fail: false` to also fail the job.

If configuration or permission is missing, the action keeps the job summary and
workflow annotations and warns instead of failing solely for the missing check.

## Score and Pass-Rate Gates

```yaml
- id: report
  uses: getsentry/vitest-evals@v0
  with:
    results: eval-results/*.json
    publish-check: true
    min-pass-rate: 0.8
```

- `fail-on-failures: true` requires every eval case to pass
- `min-pass-rate` and `min-score-average` set aggregate floors in the `0`-`1` range
- `status` and Check Run conclusion/title follow the gate
- quality misses become warnings when the gate still passes
- non-eval / infrastructure failures still fail hard
- published Check Runs soft-fail the step by default; set `soft-fail: false` to
  also fail the workflow job
- use `evals-failed` / `pass-rate` for raw tallies (`pass-rate` is a 0-1 ratio)

## Sharded Reports

Upload one JSON artifact per shard, then publish one combined report from a
final reducer job:

```yaml
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

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `results` | `vitest-results.json` | Vitest JSON result files. Supports paths, `*` and `**` globs, and newline-separated entries. |
| `publish-summary` | `true` | Write a GitHub Actions job summary. |
| `publish-annotations` | `true` | Emit GitHub workflow annotations for failed evals. |
| `publish-check` | `false` | Publish one GitHub Check Run for the combined report. Attaches to PR head on `pull_request`. |
| `check-name` | `vitest-evals` | Name of the GitHub Check Run. |
| `github-token` | `${{ github.token }}` | Token used for Check Run publishing. |
| `sha` | PR head, else `GITHUB_SHA` | Commit SHA for the Check Run. |
| `fail-on-failures` | `false` | Fail the action when any eval case failed. Equivalent to `min-pass-rate: 1`. |
| `soft-fail` | auto | Keep the step green when a published Check Run owns a failed gate. |
| `min-pass-rate` | unset | Minimum fraction of eval cases that must pass (`0`-`1`). |
| `min-score-average` | unset | Minimum average eval score across scored cases (`0`-`1`). |
| `max-annotations` | unset | Maximum number of failure annotations to publish. Check Run annotations are capped at 50 by GitHub. |
| `max-failures` | unset | Maximum number of detailed failures to include in summaries and checks. |

## CLI

The package still ships `vitest-evals-github-report` for local debugging and
backward compatibility. GitHub workflows should use the native action.
