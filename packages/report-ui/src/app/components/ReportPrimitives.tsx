import type { ReactNode } from "react";
import type { ReportCase } from "@vitest-evals/core";
import {
  formatJson,
  formatScore,
  scoreTone,
  type summarizeWorkspace,
} from "../model";
import { CodeBlock, EmptyState, cx, toneTextClass, type Tone } from "../ui";

export function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === "") {
    return <EmptyState>n/a</EmptyState>;
  }

  return <CodeBlock value={formatJson(value)} />;
}

export function FactsGrid({
  compact,
  columns = 4,
  children,
}: {
  compact?: boolean;
  columns?: 2 | 4;
  children: ReactNode;
}) {
  return (
    <dl
      className={cx(
        "grid",
        compact
          ? "gap-x-6 gap-y-3 rounded-md border border-line-subtle bg-panel-subtle p-4 sm:grid-cols-2 2xl:grid-cols-4"
          : cx(
              "gap-x-8 gap-y-3 border-b border-line-subtle bg-panel px-5 py-3 sm:grid-cols-2",
              columns === 4 ? "lg:grid-cols-4" : "",
            ),
      )}
    >
      {children}
    </dl>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-semibold uppercase text-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function StatusMark({
  showLabel = true,
  status,
}: {
  showLabel?: boolean;
  status: ReportCase["status"];
}) {
  return (
    <span
      aria-label={showLabel ? undefined : status}
      className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-muted-strong"
    >
      <span
        className={cx(
          "h-2.5 w-2.5 shrink-0 rounded-[2px]",
          statusFillClass(statusTone(status)),
        )}
        aria-hidden="true"
      />
      {showLabel ? <span>{status}</span> : null}
    </span>
  );
}

export function ScoreValue({
  score,
  size = "md",
}: {
  score: number | null | undefined;
  size?: "md" | "lg";
}) {
  const tone = scoreTone(score) as Tone;
  return (
    <span
      className={cx(
        "font-semibold tabular-nums",
        size === "lg" ? "text-2xl" : "text-sm",
        toneTextClass(tone),
      )}
    >
      {formatScore(score)}
    </span>
  );
}

export function passRate(summary: ReturnType<typeof summarizeWorkspace>) {
  if (summary.caseCount === 0) {
    return "n/a";
  }
  return `${Math.round((summary.passed / summary.caseCount) * 100)}%`;
}

export function statusTone(status: ReportCase["status"]): Tone {
  switch (status) {
    case "passed":
      return "good";
    case "failed":
      return "bad";
    case "pending":
    case "todo":
      return "warn";
    default:
      return "empty";
  }
}

export function statusFillClass(tone: Tone) {
  switch (tone) {
    case "good":
      return "bg-pass-line";
    case "warn":
      return "bg-warn";
    case "bad":
      return "bg-fail-line";
    case "trace":
      return "bg-trace";
    default:
      return "bg-muted";
  }
}
