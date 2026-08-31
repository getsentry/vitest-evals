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
import { formatUsd } from "../pricing";
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
  visibleCaseCount,
}: {
  caseCount: number;
  runCount: number;
  visibleCaseCount: number;
}) {
  return (
    <header className="mb-4">
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
          <span>report viewer</span>
        </div>
        <h1 className="mt-1 truncate text-[2rem] font-semibold leading-tight text-ink">
          Run inspection
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            <strong className="font-semibold text-ink">
              {formatNumber(runCount)}
            </strong>{" "}
            runs
          </span>
          <span>
            <strong className="font-semibold text-ink">
              {formatNumber(caseCount)}
            </strong>{" "}
            cases
          </span>
          {visibleCaseCount !== caseCount ? (
            <span>
              showing{" "}
              <strong className="font-semibold text-ink">
                {formatNumber(visibleCaseCount)}
              </strong>{" "}
              of {formatNumber(caseCount)}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function SummaryBar({
  currentStatus,
  estimatedCostUsd,
  runDelta,
  summary,
}: {
  currentStatus: CaseStatusFilter;
  estimatedCostUsd?: number;
  runDelta?: WorkspaceDelta;
  summary: ReturnType<typeof summarizeWorkspace>;
}) {
  const { pricing } = useReportMeta();
  const verdictTone = passRateTone(summary);

  return (
    <section
      className="border-b border-line-subtle bg-panel px-4 py-4"
      aria-label="Report summary"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(240px,0.82fr)_minmax(360px,1.28fr)_minmax(420px,1fr)] xl:items-center">
        <div className="min-w-0 py-1">
          <span className="text-[0.68rem] font-semibold uppercase text-muted-strong">
            Verdict
          </span>
          <div className="mt-1 flex min-w-0 items-end gap-3">
            <strong
              className={cx(
                "text-4xl font-semibold leading-none tabular-nums",
                toneTextClass(verdictTone),
              )}
            >
              {passRate(summary)}
            </strong>
            <span className="pb-1 text-sm font-medium text-muted">
              pass rate
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <StatusFilterLink
              active={currentStatus === "failed"}
              status="failed"
            >
              <strong className="font-semibold text-fail">
                {summary.failed}
              </strong>{" "}
              failed
            </StatusFilterLink>
            <span>
              <strong className="font-semibold text-ink">
                {summary.caseCount}
              </strong>{" "}
              cases
            </span>
            <span>
              avg{" "}
              <strong className="font-semibold text-ink">
                {formatScore(summary.averageScore)}
              </strong>
            </span>
            {runDelta ? (
              <span>
                vs previous{" "}
                <strong className="font-semibold text-ink">
                  {formatSignedScore(runDelta.passRate)}
                </strong>
                <span className="text-muted">
                  {" "}
                  · {formatSignedUsd(runDelta.costUsd)}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.68rem] font-semibold uppercase text-muted-strong">
              Outcome mix
            </span>
            <span className="font-mono text-[0.72rem] text-muted">
              {formatNumber(summary.caseCount)} cases
            </span>
          </div>
          <OutcomeBar summary={summary} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <OutcomeStat
              active={currentStatus === "passed"}
              label="Passed"
              status="passed"
              tone="good"
              value={summary.passed}
            />
            <OutcomeStat
              active={currentStatus === "failed"}
              label="Failed"
              status="failed"
              tone="bad"
              value={summary.failed}
            />
            <OutcomeStat
              active={currentStatus === "skipped"}
              label="Skipped"
              status="skipped"
              tone="empty"
              value={summary.skipped}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line-subtle pt-4 sm:grid-cols-3 xl:border-l xl:border-t-0 xl:grid-cols-5 xl:py-1 xl:pl-5 xl:pt-0">
          <SummaryCounter
            label="Runtime"
            value={formatDuration(summary.durationMs)}
          />
          <SummaryCounter
            label="Tokens"
            value={formatNumber(summary.totalTokens)}
          />
          <SummaryCounter
            hint={<CostHelp align="right" pricing={pricing} />}
            label="Cost"
            value={formatUsd(estimatedCostUsd)}
          />
          <SummaryCounter
            label="Tools"
            value={formatNumber(summary.toolCallCount)}
          />
          <SummaryCounter
            label="Avg score"
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
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 whitespace-nowrap text-[0.68rem] font-semibold uppercase text-muted">
        {label}
        {hint ? <span className="normal-case">{hint}</span> : null}
      </dt>
      <dd className="mt-1 truncate font-mono text-lg font-semibold tabular-nums text-ink">
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
    return <div className="mt-3 h-3 rounded-[3px] bg-line-subtle" />;
  }

  return (
    <div className="mt-3 flex h-2.5 overflow-hidden rounded-[3px] bg-line-subtle">
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

function OutcomeStat({
  active,
  label,
  status,
  tone,
  value,
}: {
  active: boolean;
  label: string;
  status: CaseStatusFilter;
  tone: Tone;
  value: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cx("size-2 shrink-0 rounded-[2px]", statusFillClass(tone))}
        aria-hidden="true"
      />
      <StatusFilterLink
        active={active}
        className="min-w-0 text-xs"
        status={status}
      >
        <strong className={cx("font-semibold", toneTextClass(tone))}>
          {value}
        </strong>{" "}
        {label.toLowerCase()}
      </StatusFilterLink>
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
