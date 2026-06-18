# Utilities

Open this when assertions need normalized message, tool-call, or span history.

## Session Helpers

Use these helpers with a `HarnessRun` such as `result`. They also accept a
normalized session when that is the only value available.

| Helper | Use |
|--------|-----|
| `toolCalls(result)` | Flatten tool calls from normalized messages. |
| `assistantMessages(result)` | Read assistant transcript turns. |
| `userMessages(result)` | Read user transcript turns. |
| `systemMessages(result)` | Read system transcript turns. |
| `toolMessages(result)` | Read tool transcript turns. |
| `messagesByRole(result, role)` | Read messages for any normalized role. |
| `latestAssistantMessageContent(result)` | Read the latest non-empty assistant content. |

```ts
const calls = toolCalls(result);

expect(calls.map((call) => call.name)).toEqual([
  "lookupInvoice",
  "createRefund",
]);
expect(latestAssistantMessageContent(result)).toContain("approved");
```

## Trace Helpers

Use these helpers with a `HarnessRun` such as `result` when behavior is
represented by spans. They also accept a normalized trace array when that is
the only value available.

| Helper | Use |
|--------|-----|
| `spans(result)` | Flatten every span from a run. |
| `spansByKind(result, kind)` | Filter spans by `run`, `model`, `tool`, or another span kind. |
| `failedSpans(result)` | Read spans with error status or normalized errors. |

```ts
expect(spansByKind(result, "tool").map((span) => span.name)).toContain(
  "lookupInvoice",
);
expect(failedSpans(result)).toHaveLength(0);
```
