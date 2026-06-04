import { useState, type ReactNode } from "react";
import {
  formatDuration,
  formatJson,
  type TranscriptEvent,
  type TranscriptMessage,
  type TranscriptSpanEvent,
  type TranscriptToolEvent,
} from "../../model";
import { cx } from "../../ui";
import { TranscriptCodeBlock } from "./TranscriptCodeBlock";
import {
  TranscriptHeadingMeta,
  TranscriptHeadingRow,
} from "./TranscriptHeadingRow";
import { TranscriptToolRun } from "./TranscriptToolView";

export function TranscriptMessages({
  events,
}: {
  events: TranscriptEvent[];
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-ink">
      <TranscriptEventList events={events} />
    </div>
  );
}

function TranscriptEventList({ events }: { events: TranscriptEvent[] }) {
  const rows: ReactNode[] = [];

  for (let index = 0; index < events.length; ) {
    const event = events[index]!;

    if (event.kind === "tool") {
      const tools: TranscriptToolEvent[] = [];
      const startIndex = index;
      while (events[index]?.kind === "tool") {
        tools.push(events[index] as TranscriptToolEvent);
        index += 1;
      }
      rows.push(
        <TranscriptToolRun
          calls={tools}
          key={`tool-run:${startIndex}`}
          keyPrefix={`trace-tool-run:${startIndex}`}
        />,
      );
      continue;
    }

    rows.push(
      event.kind === "message" ? (
        <TranscriptMessageEvent key={event.id} message={event} />
      ) : (
        <TranscriptSpanEventView event={event} key={event.id} />
      ),
    );
    index += 1;
  }

  return <>{rows}</>;
}

function TranscriptMessageEvent({
  message,
}: {
  message: TranscriptMessage;
}) {
  const messageView =
    message.role === "system" ? (
      <SystemMessageView message={message} />
    ) : (
      <TranscriptMessageShell role={message.role}>
        <TranscriptMessageHeader messageRole={message.role} />
        <MessageBody value={message.content} />
      </TranscriptMessageShell>
    );

  return <>{messageView}</>;
}

function TranscriptMessageShell({
  children,
  role,
}: {
  children: ReactNode;
  role: TranscriptMessage["role"];
}) {
  return <article className={transcriptMessageClass(role)}>{children}</article>;
}

function SystemMessageView({ message }: { message: TranscriptMessage }) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className={cx(transcriptMessageClass("system"), !open && "gap-y-0")}
      onToggle={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }
        setOpen(event.currentTarget.open);
      }}
      open={open}
    >
      <summary className="block min-h-6 cursor-pointer list-none outline-none transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-selected-line [&::-webkit-details-marker]:hidden">
        <TranscriptMessageHeader
          messageRole="system"
          meta={[formatContentSize(message.content)]}
        />
      </summary>
      <MessageBody value={message.content} />
    </details>
  );
}

function TranscriptMessageHeader({
  messageRole,
  meta,
}: {
  messageRole: TranscriptMessage["role"];
  meta?: Array<string | undefined>;
}) {
  const metaText = meta?.filter(isString).join(" · ");

  return (
    <TranscriptHeadingRow
      left={
        <span className={transcriptRoleLabelClass(messageRole)}>
          {transcriptRoleLabel(messageRole)}
        </span>
      }
      leftClassName={transcriptRoleClass(messageRole)}
      right={
        metaText ? (
          <TranscriptHeadingMeta className="text-[0.78rem] text-muted">
            {metaText}
          </TranscriptHeadingMeta>
        ) : undefined
      }
    />
  );
}

function MessageBody({ value }: { value: unknown }) {
  if (value === undefined || value === "") {
    return (
      <p className="font-mono text-[0.85rem] leading-snug text-empty">
        No content
      </p>
    );
  }

  if (typeof value === "string") {
    return (
      <p className="max-w-[86ch] whitespace-pre-wrap text-[0.92rem] leading-relaxed">
        {value}
      </p>
    );
  }

  return <TranscriptCodeBlock value={value} />;
}

function formatContentSize(value: unknown) {
  const source = typeof value === "string" ? value : formatJson(value);
  return formatBytes(new TextEncoder().encode(source).length);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function TranscriptSpanEventView({ event }: { event: TranscriptSpanEvent }) {
  const operation = event.operation;

  return (
    <article
      className={cx(
        "min-w-0 border-l-4 py-2 pl-3 pr-3",
        operation.status === "error" || operation.error
          ? "border-l-fail-line bg-panel text-ink"
          : "border-l-line bg-panel text-ink",
      )}
    >
      <TranscriptHeadingRow
        left={
          <span className="font-mono text-[0.86rem] font-bold text-muted-strong">
            {operation.label}
          </span>
        }
        right={
          <TranscriptHeadingMeta className="text-[0.78rem] text-muted">
            {formatDuration(operation.durationMs)}
          </TranscriptHeadingMeta>
        }
      />
      <div className="mt-1 font-mono text-[0.82rem] leading-snug text-ink">
        {operation.name}
      </div>
      {operation.query ? (
        <p className="mt-2 text-[0.9rem] leading-relaxed text-ink">
          {operation.query}
        </p>
      ) : null}
      {operation.error ? (
        <p className="mt-2 text-[0.9rem] leading-relaxed text-fail">
          {operation.error.type ? `${operation.error.type}: ` : ""}
          {operation.error.message}
        </p>
      ) : null}
    </article>
  );
}

function transcriptRoleLabel(role: TranscriptMessage["role"]): string {
  switch (role) {
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    case "user":
      return "User";
  }
}

function transcriptMessageClass(role: TranscriptMessage["role"]): string {
  return cx(
    "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-l-4 py-2 pl-3",
    role === "assistant" && "border-l-trace bg-trace-soft pr-3 text-ink",
    role === "user" && "border-l-ink bg-panel pr-3 text-ink",
    role === "system" && "border-l-warn bg-panel pr-3 text-ink",
    role === "tool" && "border-l-line text-muted-strong",
  );
}

function transcriptRoleClass(role: TranscriptMessage["role"]): string {
  return cx(
    "text-[0.88rem] leading-snug",
    role === "assistant" && "text-trace",
    role === "user" && "text-ink",
    role === "system" && "text-warn",
    role === "tool" && "text-muted-strong",
  );
}

function transcriptRoleLabelClass(role: TranscriptMessage["role"]): string {
  return cx(
    "inline-block max-w-full break-all text-[0.68rem] font-semibold uppercase leading-tight",
    role === "assistant" && "text-trace",
    role === "user" && "text-ink",
    role === "system" && "text-warn",
    role === "tool" && "text-muted-strong",
  );
}
