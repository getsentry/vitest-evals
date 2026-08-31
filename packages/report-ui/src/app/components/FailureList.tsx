import { parseFailureMessage } from "../failure";
import { EmptyState, cx } from "../ui";
import { CopyButton } from "./CopyButton";

export function FailureList({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return <EmptyState>No failure messages</EmptyState>;
  }

  return (
    <ul className="grid gap-3">
      {messages.map((message) => (
        <FailureCard key={message} message={message} />
      ))}
    </ul>
  );
}

function FailureCard({ message }: { message: string }) {
  const failure = parseFailureMessage(message);

  return (
    <li className="overflow-hidden rounded-md border border-fail-line/40 bg-[#fff7f6]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-fail-line/20 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-fail">
            {failure.name}
          </p>
          <p className="mt-1 text-sm font-medium leading-snug text-ink">
            {failure.headline}
          </p>
        </div>
        <CopyButton label="Copy failure" text={message} />
      </div>
      {failure.diffLines.length > 0 ? (
        <pre className="overflow-auto border-b border-fail-line/20 bg-panel px-3 py-2 font-mono text-xs leading-6">
          {failure.diffLines.map((line, index) => (
            <span
              className={cx(
                "block whitespace-pre-wrap break-words",
                line.type === "add" && "bg-[#e7f6ee] text-pass",
                line.type === "remove" && "bg-[#fdecea] text-fail",
                line.type === "context" && "text-muted-strong",
              )}
              key={`${line.type}-${index}-${line.text}`}
            >
              {line.type === "add"
                ? `+ ${line.text}`
                : line.type === "remove"
                  ? `- ${line.text}`
                  : line.text}
            </span>
          ))}
        </pre>
      ) : null}
      {failure.body ? (
        <pre className="overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-code whitespace-pre-wrap break-words">
          {failure.body}
        </pre>
      ) : null}
      {failure.stack ? (
        <details className="border-t border-fail-line/20">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-muted-strong outline-none hover:text-ink focus-visible:text-ink">
            Stack
          </summary>
          <pre className="overflow-auto px-3 pb-3 font-mono text-[0.72rem] leading-relaxed text-muted whitespace-pre-wrap break-words">
            {failure.stack}
          </pre>
        </details>
      ) : null}
    </li>
  );
}
