# Tool Replay

Open this when configuring or debugging tool recording and replay.

## Vitest Env

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      VITEST_EVALS_REPLAY_MODE: "auto",
      VITEST_EVALS_REPLAY_DIR: ".vitest-evals/recordings",
    },
  },
});
```

## Modes

| Mode | Behavior |
|------|----------|
| `off` | Never read or write recordings. This is the default. |
| `auto` | Replay when a recording exists, otherwise call live and write one. |
| `strict` | Require an existing recording and fail when missing. |
| `record` | Always call live and overwrite the recording. |

## Tool Opt-In

AI SDK:

```ts
const tools = {
  lookupInvoice: {
    replay: true,
    inputSchema,
    execute: lookupInvoice,
  },
};
```

Pi AI:

```ts
const tools = {
  lookupInvoice: {
    replay: true,
    execute: lookupInvoice,
  },
};
```

## Replay Config

Use an object when the default cache key or recording needs adjustment:

```ts
replay: {
  version: "v2",
  key: (args, context) => ({
    args,
    tenant: context.metadata.tenant,
  }),
  sanitize: (recording) => ({
    ...recording,
    metadata: undefined,
  }),
}
```

## Recording Rules

- Recordings live under `<replay-dir>/<tool-name>/<cache-key>.json`.
- Cache keys include tool name, normalized key input, and optional version.
- Inputs and outputs must be JSON-serializable.
- Tool errors are recorded and replayed as errors.
- Replay metadata is attached to tool call metadata as `metadata.replay`.
- Recorded metadata includes `status`, `recordingPath`, and `cacheKey`.

## Harness Notes

| Harness | Notes |
|---------|-------|
| AI SDK | Replay only wraps tools with `execute(...)`; provider-executed tools cannot be recorded automatically. |
| Pi AI | Replay works for explicit runtime tools and instrumented native tool arrays. Native tool recordings preserve both agent-facing and normalized results. |
| Custom harness | Call `executeWithReplay(...)` from `vitest-evals/replay` directly if replay should be part of the adapter. |
