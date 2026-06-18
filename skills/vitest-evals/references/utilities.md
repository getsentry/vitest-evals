# Utilities

Open this when assertions need normalized message, tool-call, or span history.

## Session Helpers

Use these helpers with `result.session` or `ctx.session`:

| Helper | Use |
|--------|-----|
| `toolCalls(session)` | Flatten tool calls from normalized messages. |
| `assistantMessages(session)` | Read assistant transcript turns. |
| `userMessages(session)` | Read user transcript turns. |
| `systemMessages(session)` | Read system transcript turns. |
| `toolMessages(session)` | Read tool transcript turns. |
| `messagesByRole(session, role)` | Read messages for any normalized role. |
| `latestAssistantMessageContent(session)` | Read the latest non-empty assistant content. |

```ts
const calls = toolCalls(result.session);

expect(calls.map((call) => call.name)).toEqual([
  "lookupInvoice",
  "createRefund",
]);
expect(latestAssistantMessageContent(result.session)).toContain("approved");
```

## Trace Helpers

Use these helpers with a `HarnessRun` when behavior is represented by spans:

| Helper | Use |
|--------|-----|
| `spans(result)` | Flatten every span from a harness run. |
| `spansByKind(result, kind)` | Filter spans by `run`, `model`, `tool`, or another span kind. |
| `failedSpans(result)` | Read spans with error status or normalized errors. |

```ts
expect(spansByKind(result, "tool").map((span) => span.name)).toContain(
  "lookupInvoice",
);
expect(failedSpans(result)).toHaveLength(0);
```
