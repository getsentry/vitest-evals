# Troubleshooting

Open this for failing evals, missing reporter data, or uncertain verification.

## Failure Matrix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Test has no `run` fixture | Suite is not inside `describeEval(...)`. | Wrap the suite with `describeEval(name, { harness }, (it) => { ... })`. |
| App executes more than once per test | Judge or assertion calls the app directly. | Use the returned `result`; reserve `harness.run(...)` inside a judge for intentional second runs. |
| Reporter shows little harness detail | `HarnessRun.session`, `usage`, or `errors` is sparse. | Return a richer normalized run and set `session.outputText` deliberately. |
| Tool calls are missing | Tools were not passed through the harness runtime or native tool inference missed them. | Use wrapped `runtime.tools`, explicit `tools`, or emit events from the app seam. |
| Tool arguments/results disappear | Values are not JSON-serializable or normalize to `undefined`. | Convert to records, arrays, strings, numbers, booleans, or `null`. |
| Judge receives blank text | `session.outputText` and assistant content are empty. | Set `session.outputText` or ensure the assistant message has content. |
| Structured output judge fails unexpectedly | `run.output` is not the parsed domain object. | Add `output` or `normalize.output` to the harness. |
| Replay misses an existing recording | Cache key input, version, tool name, or replay dir changed. | Inspect `metadata.replay.recordingPath` and update `key` or `version`. |
| `strict` replay fails | Recording does not exist for the current key. | Run `auto` or `record` once, or commit the expected recording. |
| Replay rejects a tool output | Tool returned a non-JSON value or async iterable. | Return JSON-safe values from recorded tools. |
| Failed run loses trace data | Error was thrown without an attached partial run. | First-party harnesses attach partial runs; custom harnesses should use `attachHarnessRunToError(...)`. |
| Provider-dependent eval is skipped locally | Missing API key or app env. | Keep `skipIf` explicit and run deterministic unit tests for adapter logic. |

## Verification Map

| Change | Minimum useful command |
|--------|------------------------|
| One eval file | `pnpm exec vitest run path/to/file.eval.ts -c vitest.config.ts --reporter=./packages/vitest-evals/src/reporter.ts` |
| Core harness or judge API | `pnpm exec vitest run packages/vitest-evals/src/harness.test.ts -c vitest.config.ts` |
| Reporter formatting | `pnpm exec vitest run packages/vitest-evals/src/reporter.test.ts -c vitest.config.ts` |
| AI SDK harness | `pnpm exec vitest run packages/harness-ai-sdk/src/index.test.ts -c vitest.config.ts` |
| Pi AI harness | `pnpm exec vitest run packages/harness-pi-ai/src/index.test.ts -c vitest.config.ts` |
| Public type surface | `pnpm typecheck` |
| Package output | `pnpm build` |

## Review Checklist

- New exported functions have brief JSDoc when code is added.
- Docs and examples use the same import paths as package exports.
- Provider-key-dependent evals are gated with `skipIf`.
- Test assertions cover output, tool traces, and usage when the change affects them.
- Normalized data can be serialized with `JSON.stringify(...)`.
