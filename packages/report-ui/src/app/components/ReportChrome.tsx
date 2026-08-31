import { Link } from "@tanstack/react-router";
import type { ReportRun } from "@vitest-evals/core";
import type { ReactNode } from "react";
import {
  type WorkspaceDelta,
  formatSignedScore,
  formatSignedUsd,
} from "../compare";
import {
  type CaseStatusFilter,
  formatDuration,
  formatNumber,
  formatScore,
  type summarizeWorkspace,
} from "../model";
import { type UsageCost, formatUsd } from "../pricing";
import { useReportMeta } from "../report-meta";
import { toReportSearch } from "../search";
import { type Tone, cx, toneTextClass } from "../ui";
import { CostHelp } from "./CostHelp";
import { PathLabel } from "./PathLabel";
import {
  executedCaseCount,
  passRate,
  statusFillClass,
} from "./ReportPrimitives";

export function ReportHeader({
  caseCount,
  runCount,
  sourceLabel,
  visibleCaseCount,
  onOpenPalette,
}: {
  caseCount: number;
  runCount: number;
  sourceLabel: string;
  visibleCaseCount: number;
  onOpenPalette: () => void;
}) {
  const shortcut = commandShortcut();
  return (
    <header className="mb-3 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-[0.68rem] font-semibold uppercase text-muted-strong">
          <Link
            className="font-mono text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-selected-line"
            search={() => toReportSearch({})}
            to="/"
          >
            vitest-evals
          </Link>
          <span className="h-1 w-1 rounded-full bg-line" aria-hidden="true" />
          <span>report</span>
        </div>
        <h1
          className="mt-0.5 truncate text-xl font-semibold leading-tight text-ink"
          title={sourceLabel}
        >
          {sourceLabel}
        </h1>
        <p className="mt-1 text-xs text-muted">
          {formatNumber(runCount)} run{runCount === 1 ? "" : "s"}
          {visibleCaseCount !== caseCount
            ? ` · showing ${formatNumber(visibleCaseCount)} of ${formatNumber(caseCount)}`
            : ` · ${formatNumber(caseCount)} cases`}
        </p>
      </div>
      <button
        className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-line-subtle bg-panel px-2.5 text-xs font-semibold text-muted-strong outline-none hover:border-line hover:text-ink focus-visible:ring-2 focus-visible:ring-selected-line"
        type="button"
        title={`Command palette (${shortcut})`}
        onClick={onOpenPalette}
      >
        Commands
        <kbd className="rounded border border-line-subtle px-1.5 py-0.5 font-mono text-[0.65rem] text-muted">
          {shortcut}
        </kbd>
      </button>
    </header>
  );
}

export function SummaryBar({
  currentStatus,
  runDelta,
  summary,
  workspaceCost,
}: {
  currentStatus: CaseStatusFilter;
  runDelta?: WorkspaceDelta;
  summary: ReturnType<typeof summarizeWorkspace>;
  workspaceCost?: UsageCost;
}) {
  const { pricing } = useReportMeta();
  const verdictTone = passRateTone(summary);

  return (
    <section
      className="border-b border-line-subtle bg-panel px-4 py-2.5"
      aria-label="Report summary"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <strong
            className={cx(
              "text-2xl font-semibold leading-none tabular-nums",
              toneTextClass(verdictTone),
            )}
          >
            {passRate(summary)}
          </strong>
          <OutcomeBar summary={summary} />
          <StatusFilterLink
            active={currentStatus === "failed"}
            className="text-xs"
            status="failed"
          >
            <strong className="font-semibold text-fail">
              {summary.failed}
            </strong>{" "}
            failed
          </StatusFilterLink>
          <StatusFilterLink
            active={currentStatus === "passed"}
            className="text-xs"
            status="passed"
          >
            <strong className="font-semibold text-pass">
              {summary.passed}
            </strong>{" "}
            passed
          </StatusFilterLink>
          {summary.skipped > 0 ? (
            <span className="text-xs text-muted">
              <strong className="font-semibold text-ink">
                {summary.skipped}
              </strong>{" "}
              skipped
            </span>
          ) : null}
          {runDelta ? (
            <span className="text-xs text-muted">
              vs previous{" "}
              <strong className="font-semibold text-ink">
                {formatSignedScore(runDelta.passRate)}
              </strong>
              <span> · {formatSignedUsd(runDelta.costUsd)}</span>
            </span>
          ) : null}
        </div>
        <dl className="ml-auto flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <SummaryCounter
            label="Runtime"
            value={formatDuration(summary.durationMs)}
          />
          <SummaryCounter
            hint={
              <CostHelp align="right" cost={workspaceCost} pricing={pricing} />
            }
            label="Cost"
            value={`${formatUsd(workspaceCost?.totalUsd)} · ${formatNumber(summary.totalTokens)}`}
          />
          {summary.toolCallCount > 0 ? (
            <SummaryCounter
              label="Tools"
              value={formatNumber(summary.toolCallCount)}
            />
          ) : null}
          <SummaryCounter
            label="Avg"
            value={formatScore(summary.averageScore)}
          />
        </dl>
      </div>
    </section>
  );
}

export function RunStrip({
  currentStatus,
  runs,
  selectedRunId,
}: {
  currentStatus: CaseStatusFilter;
  runs: ReportRun[];
  selectedRunId: string;
}) {
  return (
    <section
      className="border-b border-line-subtle bg-panel-subtle"
      aria-label="Runs"
    >
      <div className="flex overflow-x-auto">
        {runs.map((run) => (
          <div
            className={cx(
              "flex min-h-12 min-w-[320px] flex-1 items-center justify-between gap-4 border-r border-line-subtle px-4 py-2.5 last:border-r-0",
              selectedRunId === run.id && "bg-selected",
            )}
            key={run.id}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cx(
                  "size-2 shrink-0 rounded-[2px]",
                  statusFillClass(run.status === "passed" ? "good" : "bad"),
                )}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <strong className="block text-sm font-semibold">
                  <PathLabel path={run.source ?? run.id} />
                </strong>
                <span className="block text-xs text-muted">
                  {formatDuration(run.durationMs)}
                </span>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-3 text-right text-xs text-muted">
              <RunStatusLink
                active={selectedRunId === run.id && currentStatus === "passed"}
                runId={run.id}
                status="passed"
              >
                <strong className="block font-semibold text-pass">
                  {run.totals.evalPassed}
                </strong>
                passed
              </RunStatusLink>
              <RunStatusLink
                active={selectedRunId === run.id && currentStatus === "failed"}
                runId={run.id}
                status="failed"
              >
                <strong className="block font-semibold text-fail">
                  {run.totals.evalFailed}
                </strong>
                failed
              </RunStatusLink>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryCounter({
  hint,
  label,
  value,
}: {
  hint?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="flex items-center gap-1 whitespace-nowrap text-[0.68rem] font-semibold uppercase text-muted">
        {label}
        {hint ? <span className="normal-case">{hint}</span> : null}
      </dt>
      <dd className="truncate font-mono text-sm font-semibold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}

function OutcomeBar({
  summary,
}: {
  summary: ReturnType<typeof summarizeWorkspace>;
}) {
  const segments = [
    { key: "passed", tone: "good" as Tone, value: summary.passed },
    { key: "failed", tone: "bad" as Tone, value: summary.failed },
    { key: "skipped", tone: "empty" as Tone, value: summary.skipped },
  ].filter((segment) => segment.value > 0);

  if (summary.caseCount === 0) {
    return (
      <div
        className="h-1.5 w-24 rounded-[3px] bg-line-subtle"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="flex h-1.5 w-24 overflow-hidden rounded-[3px] bg-line-subtle">
      {segments.map((segment) => (
        <span
          aria-hidden="true"
          className={statusFillClass(segment.tone)}
          key={segment.key}
          style={{
            flexBasis: `${(segment.value / summary.caseCount) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

function StatusFilterLink({
  active,
  children,
  className,
  status,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  status: CaseStatusFilter;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-selected-line",
        active && "underline",
        className,
      )}
      search={(previous) =>
        toReportSearch({
          ...previous,
          status: active ? "all" : status,
        })
      }
      to="/"
    >
      {children}
    </Link>
  );
}

function RunStatusLink({
  active,
  children,
  runId,
  status,
}: {
  active: boolean;
  children: ReactNode;
  runId: string;
  status: CaseStatusFilter;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-selected-line",
        active && "underline",
      )}
      search={(previous) =>
        toReportSearch({
          ...previous,
          run: active ? "all" : runId,
          status: active ? "all" : status,
        })
      }
      to="/"
    >
      {children}
    </Link>
  );
}

function commandShortcut() {
  if (typeof navigator === "undefined") {
    return "Ctrl+K";
  }
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K";
}

function passRateTone(summary: ReturnType<typeof summarizeWorkspace>): Tone {
  const executedCases = executedCaseCount(summary);
  if (executedCases === 0) {
    return "empty";
  }

  const rate = summary.passed / executedCases;
  if (rate >= 0.9) {
    return "good";
  }
  if (rate >= 0.6) {
    return "warn";
  }
  return "bad";
}
