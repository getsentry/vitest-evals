import { Fragment, useState, type ReactNode } from "react";
import { formatDuration, type TranscriptToolEvent } from "../../model";
import { cx } from "../../ui";
import { TranscriptCodeBlock } from "./TranscriptCodeBlock";
import {
  TranscriptHeadingMeta,
  TranscriptHeadingRow,
} from "./TranscriptHeadingRow";
import {
  isPreviewableValue,
  previewArgumentValue,
  truncatePreview,
} from "./transcriptPreview";

const TOOL_RUN_REVEAL_THRESHOLD = 4;

type ToolCall = TranscriptToolEvent;

export function TranscriptToolRun({
  calls,
  keyPrefix,
}: {
  calls: ToolCall[];
  keyPrefix: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (calls.length >= TOOL_RUN_REVEAL_THRESHOLD && !revealed) {
    return (
      <ToolRunReveal
        hiddenCount={calls.length}
        onClick={() => setRevealed(true)}
      />
    );
  }

  return (
    <>
      {calls.map((call, index) => (
        <Fragment key={call.id ?? `${keyPrefix}:tool:${index}`}>
          <TranscriptToolView call={call} />
        </Fragment>
      ))}
    </>
  );
}

function TranscriptToolView({ call }: { call: ToolCall }) {
  const payloads = visiblePayloads([
    { label: "arguments", value: call.arguments },
    { label: "result", value: call.result },
    { label: "error", value: call.error },
  ]);
  const duration = formatDuration(call.durationMs);
  const meta = [
    duration !== "n/a" ? duration : undefined,
    call.error ? "error" : undefined,
    call.callId ? `id ${call.callId}` : undefined,
  ].filter(isString);
  const mobileSummaryMeta =
    duration !== "n/a" ? duration : call.error ? "error" : undefined;

  return (
    <ToolFrame
      expandable={payloads.length > 0}
      meta={meta}
      mobileSummaryMeta={mobileSummaryMeta}
      signature={
        <>
          <ToolStatus failed={Boolean(call.error)} />
          <strong className="min-w-0 break-words font-bold text-ink">
            {call.name}
          </strong>
          {isPreviewableValue(call.arguments) ? (
            <code className="min-w-0 break-words font-[inherit] text-muted-strong max-md:hidden">
              (<ToolArgumentsPreview input={call.arguments} />)
            </code>
          ) : null}
        </>
      }
    >
      {payloads.map((payload) => (
        <ToolBodySection key={payload.label} label={payload.label}>
          <TranscriptCodeBlock value={payload.value} />
        </ToolBodySection>
      ))}
    </ToolFrame>
  );
}

function ToolFrame({
  children,
  expandable,
  meta,
  mobileSummaryMeta,
  raw,
  signature,
}: {
  children?: ReactNode;
  expandable?: boolean;
  meta: string[];
  mobileSummaryMeta?: string;
  raw?: boolean;
  signature: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const metaText = meta.join(" · ");
  const interactive = expandable ?? Boolean(children);
  const closedMobileMeta =
    mobileSummaryMeta && (!interactive || !open)
      ? mobileSummaryMeta
      : undefined;
  const header = (
    <TranscriptHeadingRow
      left={
        <>
          {signature}
          {closedMobileMeta ? (
            <>
              <span className="hidden text-muted max-md:inline">·</span>
              <span className="hidden min-w-0 break-words text-muted max-md:inline">
                {closedMobileMeta}
              </span>
            </>
          ) : null}
        </>
      }
      leftClassName="flex-wrap gap-x-1 gap-y-0.5"
      right={
        metaText ? (
          <TranscriptHeadingMeta className="min-w-0 break-words text-[0.8rem] text-muted">
            {metaText}
          </TranscriptHeadingMeta>
        ) : undefined
      }
      rightClassName="min-w-0 max-md:hidden"
      wrapLeft
    />
  );
  const mobileMeta =
    metaText && children ? (
      <div className="hidden min-w-0 break-words py-1 font-mono text-[0.78rem] leading-snug text-muted max-md:block">
        {metaText}
      </div>
    ) : null;

  if (raw || !interactive) {
    return (
      <div className={toolFrameClass()}>
        <div className={toolHeaderClass(false)}>{header}</div>
        {mobileMeta}
        {children}
      </div>
    );
  }

  return (
    <details
      className={toolFrameClass()}
      onToggle={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className={toolHeaderClass(true)}>{header}</summary>
      {mobileMeta}
      {children}
    </details>
  );
}

function ToolBodySection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden border-t border-line-subtle py-2">
      <div className="pb-2 font-mono text-[0.78rem] leading-none text-muted-strong">
        {label}
      </div>
      {children}
    </div>
  );
}

function ToolArgumentsPreview({ input }: { input: unknown }) {
  if (!isPreviewableValue(input)) {
    return null;
  }

  if (typeof input === "string") {
    return <ToolArgValue value={truncatePreview(input, 96)} />;
  }

  if (Array.isArray(input)) {
    return <ToolArgValue value={truncatePreview(JSON.stringify(input), 96)} />;
  }

  if (isRecord(input)) {
    const entries = Object.entries(input).slice(0, 4);
    return (
      <>
        {entries.map(([key, value], index) => (
          <ToolArgEntry
            index={index}
            key={key}
            name={key}
            value={previewArgumentValue(value)}
          />
        ))}
      </>
    );
  }

  return <ToolArgValue value={truncatePreview(String(input), 96)} />;
}

function ToolArgEntry({
  index,
  name,
  value,
}: {
  index: number;
  name: string;
  value: string;
}) {
  return (
    <span>
      {index > 0 ? <span className="text-muted">, </span> : null}
      <span className="text-ink">{name}</span>
      <span className="text-muted">: </span>
      <ToolArgValue value={value} />
    </span>
  );
}

function ToolArgValue({ value }: { value: string }) {
  return <span className="text-muted-strong">{value}</span>;
}

function ToolRunReveal({
  hiddenCount,
  onClick,
}: {
  hiddenCount: number;
  onClick: () => void;
}) {
  return (
    <button
      aria-expanded={false}
      className="group flex w-full cursor-pointer items-center gap-2 py-1.5 text-left font-mono text-[0.78rem] leading-tight text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-selected-line"
      onClick={onClick}
      type="button"
    >
      <span className="h-px min-w-4 flex-1 bg-line-subtle transition-colors group-hover:bg-line" />
      <span className="shrink-0">show {hiddenCount} tool calls</span>
      <span className="h-px min-w-4 flex-1 bg-line-subtle transition-colors group-hover:bg-line" />
    </button>
  );
}

function ToolStatus({ failed }: { failed: boolean }) {
  return (
    <span
      className={cx(
        "mt-0.5 size-1.5 shrink-0 border",
        failed
          ? "border-fail-line bg-fail-line"
          : "border-pass-line bg-pass-line",
      )}
      aria-hidden="true"
    />
  );
}

function toolFrameClass(): string {
  return "min-w-0 max-w-full overflow-hidden";
}

function toolHeaderClass(interactive: boolean): string {
  return cx(
    "block py-1.5 font-mono text-[0.82rem] leading-tight text-muted-strong",
    interactive
      ? "cursor-pointer list-none transition-colors hover:text-ink hover:[&_*]:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-selected-line focus-visible:text-ink focus-visible:[&_*]:text-ink [&::-webkit-details-marker]:hidden"
      : "cursor-default",
  );
}

function visiblePayloads(payloads: Array<{ label: string; value: unknown }>) {
  return payloads.filter(
    (payload) => payload.value !== undefined && payload.value !== "",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
