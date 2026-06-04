import type { ReportRun } from "@vitest-evals/core";
import {
  formatDuration,
  formatNumber,
  formatScore,
  type summarizeWorkspace,
} from "../model";
import { cx, toneTextClass, type Tone } from "../ui";
import {
  executedCaseCount,
  passRate,
  statusFillClass,
} from "./ReportPrimitives";

export function ReportHeader({
  caseCount,
  runCount,
}: {
  caseCount: number;
  runCount: number;
}) {
  return (
    <header className="mb-4">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-[0.68rem] font-semibold uppercase text-muted-strong">
          <span className="font-mono text-ink">vitest-evals</span>
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
        </div>
      </div>
    </header>
  );
}

export function SummaryBar({
  summary,
}: {
  summary: ReturnType<typeof summarizeWorkspace>;
}) {
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
            <span>
              <strong className="font-semibold text-fail">
                {summary.failed}
              </strong>{" "}
              failed
            </span>
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
            <OutcomeStat label="Passed" tone="good" value={summary.passed} />
            <OutcomeStat label="Failed" tone="bad" value={summary.failed} />
            <OutcomeStat label="Skipped" tone="empty" value={summary.skipped} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line-subtle pt-4 sm:grid-cols-4 xl:border-l xl:border-t-0 xl:py-1 xl:pl-5 xl:pt-0">
          <SummaryCounter
            label="Runtime"
            value={formatDuration(summary.durationMs)}
          />
          <SummaryCounter
            label="Tokens"
            value={formatNumber(summary.totalTokens)}
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
  runs,
  selectedRunId,
}: {
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
                <strong className="block truncate text-sm font-semibold">
                  {run.source ?? run.id}
                </strong>
                <span className="block text-xs text-muted">
                  {formatDuration(run.durationMs)}
                </span>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-3 text-right text-xs text-muted">
              <span>
                <strong className="block font-semibold text-pass">
                  {run.totals.evalPassed}
                </strong>
                passed
              </span>
              <span>
                <strong className="block font-semibold text-fail">
                  {run.totals.evalFailed}
                </strong>
                failed
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryCounter({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-semibold uppercase text-muted">
        {label}
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
  label,
  tone,
  value,
}: {
  label: string;
  tone: Tone;
  value: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cx("size-2 shrink-0 rounded-[2px]", statusFillClass(tone))}
        aria-hidden="true"
      />
      <span className="min-w-0 text-xs text-muted">
        <strong className={cx("font-semibold", toneTextClass(tone))}>
          {value}
        </strong>{" "}
        {label.toLowerCase()}
      </span>
    </div>
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
