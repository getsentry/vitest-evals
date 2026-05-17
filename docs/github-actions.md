# GitHub Actions Reporting

`@vitest-evals/github-reporter` reads Vitest JSON output and publishes the
GitHub-facing report. Use JSON as the eval artifact because it preserves
`task.meta.eval` and `task.meta.harness`; JUnit XML does not carry the full eval
metadata.

## Install

```sh
pnpm add -D @vitest-evals/github-reporter
```

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
          node-version: 20
          cache: pnpm
      - run: pnpm install

      - name: Run evals
        run: |
          pnpm exec vitest run evals \
            --reporter=vitest-evals/reporter \
            --reporter=json \
            --outputFile.json=vitest-results.json

      - name: Publish eval report
        if: always()
        run: pnpm exec vitest-evals-github-report
```

The publish step still runs after failed evals because of `if: always()`. The
job remains failed when the eval step fails.

## Optional Check Run

Add `checks: write`, pass the GitHub token as an environment variable, and opt
in with `--check-run`.

```yaml
permissions:
  contents: read
  checks: write

steps:
  - name: Publish eval report
    if: always()
    env:
      GITHUB_TOKEN: ${{ github.token }}
    run: pnpm exec vitest-evals-github-report --check-run
```

If the token or permission is missing, the command keeps the job summary and
workflow annotations and warns instead of failing the job.

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
