# Custom Harness

Open this when no first-party harness adapter fits the application runtime.

## Contract

```ts
import {
  normalizeContent,
  normalizeMetadata,
  toJsonValue,
  type Harness,
  type HarnessRun,
} from "vitest-evals/harness";

const appHarness: Harness<AppInput, AppMetadata> = {
  name: "app",
  prompt: (input, options) => promptJudgeModel(input, options),
  run: async (input, context): Promise<HarnessRun> => {
    const appResult = await runApp(input, {
      signal: context.signal,
      metadata: context.metadata,
    });

    const output = toJsonValue(appResult.decision);

    return {
      output,
      session: {
        messages: [
          { role: "user", content: normalizeContent(input) },
          {
            role: "assistant",
            content: normalizeContent(appResult.reply),
            metadata: normalizeMetadata({ channel: appResult.channel }),
          },
        ],
        outputText: appResult.reply,
        metadata: normalizeMetadata({ caseId: appResult.caseId }),
      },
      usage: appResult.usage ?? {},
      errors: [],
    };
  },
};
```

## Required Fields

| Field | Requirement |
|-------|-------------|
| `name` | Stable short label shown in reporter output. |
| `prompt` | Provider-agnostic prompt seam for judges; do not run the app here. |
| `run` | Executes the application once and returns a normalized `HarnessRun`. |
| `session.messages` | JSON-safe user, assistant, and tool trace. |
| `usage` | Empty object when unknown; include provider/model/tokens when available. |
| `errors` | Empty array on success; serialized error records on partial results. |

## Implementation Rules

- Run the app through its normal entrypoint.
- Inject `context.signal`, `context.metadata`, and test doubles where the app supports them.
- Use `context.setArtifact(name, value)` for JSON-safe diagnostics that should appear on the run.
- Convert unknown values with `toJsonValue(...)`, `normalizeContent(...)`, or `normalizeMetadata(...)`.
- Attach a partial run to thrown errors with `attachHarnessRunToError(...)` when meaningful trace data exists.
- Define `session.outputText` when LLM-backed judges should grade text rather than structured output.

## Choose A Custom Harness When

| Runtime shape | Why |
|---------------|-----|
| Full product workflow | The app has events, side effects, or domain output beyond a provider result. |
| Non-AI-SDK provider | First-party adapters cannot infer provider steps or tool calls. |
| Existing observability seam | App emits messages or tool records you can normalize directly. |
| Multi-service workflow | A thin adapter can preserve the real app boundary while normalizing one run. |
