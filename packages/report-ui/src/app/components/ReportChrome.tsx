import type { ReportRun } from "@vitest-evals/core";
import {
  formatDuration,
  formatNumber,
  formatScore,
  scoreTone,
  type summarizeWorkspace,
} from "../model";
import { Metric, cx, type Tone } from "../ui";
import { passRate } from "./ReportPrimitives";

export function ReportHeader({
  caseCount,
  runCount,
}: {
  caseCount: number;
  runCount: number;
}) {
  return (
    <header className="flex flex-col gap-4 pb-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-muted-strong">
          vitest-evals
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Report</h1>
      </div>
      <div className="flex flex-wrap gap-2 text-sm text-muted">
        <span>{runCount} run(s)</span>
        <span>{caseCount} eval case(s)</span>
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
      className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-6"
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
    <section
      className="my-3 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3"
      aria-label="Runs"
    >
      {runs.map((run) => (
        <div
          className={cx(
            "flex min-h-[68px] min-w-0 items-center justify-between gap-4 rounded-lg border border-line bg-panel p-3",
            run.status === "passed"
              ? "border-l-4 border-l-pass-line"
              : "border-l-4 border-l-fail-line",
            selectedRunId === run.id &&
              "outline outline-2 outline-selected-line",
          )}
          key={run.id}
        >
          <div className="min-w-0">
            <strong className="block truncate text-sm font-semibold">
              {run.source ?? run.id}
            </strong>
            <span className="mt-1 block text-xs text-muted">
              {formatDuration(run.durationMs)}
            </span>
          </div>
          <div className="shrink-0 text-right text-xs text-muted">
            <span className="block">{run.totals.evalPassed} passed</span>
            <span className="block">{run.totals.evalFailed} failed</span>
          </div>
        </div>
      ))}
    </section>
  );
}
