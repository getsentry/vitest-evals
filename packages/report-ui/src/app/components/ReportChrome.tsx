import type { ReportRun } from "@vitest-evals/core";
import {
  formatDuration,
  formatNumber,
  formatScore,
  scoreTone,
  type summarizeWorkspace,
} from "../model";
import { Metric, cx, type Tone } from "../ui";
import { passRate, statusFillClass } from "./ReportPrimitives";

export function ReportHeader({
  caseCount,
  runCount,
}: {
  caseCount: number;
  runCount: number;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-line pb-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xs font-semibold uppercase text-muted-strong">
          vitest-evals
        </p>
        <h1 className="text-2xl font-semibold text-ink">Eval report</h1>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          <strong className="font-semibold text-ink">{runCount}</strong> runs
        </span>
        <span>
          <strong className="font-semibold text-ink">{caseCount}</strong> cases
        </span>
      </div>
    </header>
  );
}

export function SummaryBar({
  summary,
}: {
  summary: ReturnType<typeof summarizeWorkspace>;
}) {
  return (
    <section
      className="grid grid-cols-2 gap-px border-b border-line bg-line-subtle sm:grid-cols-3 lg:grid-cols-6"
      aria-label="Report summary"
    >
      <Metric label="Pass rate" value={passRate(summary)} tone="good" />
      <Metric
        label="Average score"
        value={formatScore(summary.averageScore)}
        tone={scoreTone(summary.averageScore) as Tone}
      />
      <Metric
        label="Failed"
        value={String(summary.failed)}
        tone={summary.failed > 0 ? "bad" : "good"}
      />
      <Metric label="Tokens" value={formatNumber(summary.totalTokens)} />
      <Metric label="Tools" value={formatNumber(summary.toolCallCount)} />
      <Metric label="Runtime" value={formatDuration(summary.durationMs)} />
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
    <section className="border-b border-line bg-panel-subtle" aria-label="Runs">
      <div className="flex overflow-x-auto">
        {runs.map((run) => (
          <div
            className={cx(
              "flex min-h-12 min-w-[320px] flex-1 items-center justify-between gap-4 border-r border-line-subtle px-3 py-2 last:border-r-0",
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
