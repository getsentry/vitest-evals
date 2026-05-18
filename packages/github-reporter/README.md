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
```

If configuration or permission is missing, the action keeps the job summary and
workflow annotations and warns instead of failing.

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
```

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

## CLI

The package still ships `vitest-evals-github-report` for local debugging and
backward compatibility. GitHub workflows should use the native action.
