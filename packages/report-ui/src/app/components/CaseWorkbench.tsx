import type { ReportCase, ReportRun } from "@vitest-evals/core";
import {
  caseToolCallCount,
  caseTotalTokens,
  formatDuration,
  formatNumber,
  type CaseFilters,
  type CaseStatusFilter,
} from "../model";
import { EmptyState, Field, Input, Select, cx } from "../ui";
import { ScoreValue, StatusMark } from "./ReportPrimitives";

type CaseColumn = {
  id: string;
  header: string;
  className: string;
};

const STATUS_OPTIONS: Array<{ value: CaseStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "passed", label: "Passed" },
  { value: "skipped", label: "Skipped" },
  { value: "pending", label: "Pending" },
  { value: "todo", label: "Todo" },
  { value: "disabled", label: "Disabled" },
];

const CASE_COLUMNS: CaseColumn[] = [
  {
    id: "status",
    header: "Status",
    className: "w-[96px]",
  },
  {
    id: "case",
    header: "Case",
    className: "min-w-[220px]",
  },
  {
    id: "score",
    header: "Score",
    className: "w-[82px] text-right",
  },
  {
    id: "duration",
    header: "Duration",
    className: "w-[92px] text-right",
  },
  {
    id: "tokens",
    header: "Tokens",
    className: "w-[92px] text-right",
  },
  {
    id: "tools",
    header: "Tools",
    className: "w-[72px] text-right",
  },
];

export function CaseWorkbench({
  cases,
  filters,
  runs,
  selectedCaseId,
  totalCases,
  onFiltersChange,
  onSelectCase,
}: {
  cases: ReportCase[];
  filters: CaseFilters;
  runs: ReportRun[];
  selectedCaseId: string | undefined;
  totalCases: number;
  onFiltersChange: (filters: CaseFilters) => void;
  onSelectCase: (testCase: ReportCase) => void;
}) {
  return (
    <section className="min-h-[620px] min-w-0 bg-panel">
      <div className="border-b border-line-subtle px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">
              Case ledger
            </h2>
            <p className="mt-1 text-xs text-muted">
              {cases.length} of {totalCases} case(s)
            </p>
          </div>
        </div>
        <CaseFilterControls
          filters={filters}
          runs={runs}
          onFiltersChange={onFiltersChange}
        />
      </div>
      <CaseTable
        cases={cases}
        selectedCaseId={selectedCaseId}
        onSelectCase={onSelectCase}
      />
    </section>
  );
}

function CaseFilterControls({
  filters,
  runs,
  onFiltersChange,
}: {
  filters: CaseFilters;
  runs: ReportRun[];
  onFiltersChange: (filters: CaseFilters) => void;
}) {
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_220px]">
      <Field label="Search" htmlFor="case-search">
        <Input
          id="case-search"
          value={filters.query}
          onChange={(event) =>
            onFiltersChange({ ...filters, query: event.target.value })
          }
          placeholder="Case, file, judge"
        />
      </Field>
      <Field label="Status" htmlFor="case-status">
        <Select
          id="case-status"
          value={filters.status}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              status: event.target.value as CaseStatusFilter,
            })
          }
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Run" htmlFor="case-run">
        <Select
          id="case-run"
          value={filters.runId}
          onChange={(event) =>
            onFiltersChange({ ...filters, runId: event.target.value })
          }
        >
          <option value="all">All runs</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.source ?? run.id}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function CaseTable({
  cases,
  selectedCaseId,
  onSelectCase,
}: {
  cases: ReportCase[];
  selectedCaseId: string | undefined;
  onSelectCase: (testCase: ReportCase) => void;
}) {
  if (cases.length === 0) {
    return <EmptyState>No matching eval cases</EmptyState>;
  }

  return (
    <div className="h-[clamp(320px,calc(100vh-360px),720px)] overflow-auto">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-panel text-left text-[0.68rem] font-semibold uppercase text-muted-strong shadow-[0_1px_0_var(--color-line-subtle)]">
          <tr>
            {CASE_COLUMNS.map((column) => (
              <th
                className={cx("px-4 py-2.5", column.className)}
                key={column.id}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cases.map((testCase) => (
            <CaseRow
              key={testCase.id}
              selected={selectedCaseId === testCase.id}
              testCase={testCase}
              onSelectCase={onSelectCase}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaseRow({
  selected,
  testCase,
  onSelectCase,
}: {
  selected: boolean;
  testCase: ReportCase;
  onSelectCase: (testCase: ReportCase) => void;
}) {
  return (
    <tr className="group cursor-pointer border-b border-line-subtle">
      <td
        className={cx(
          "min-w-0 border-l-4 bg-panel px-4 py-3 align-middle group-hover:bg-panel-subtle",
          caseRailClass(testCase.status, selected),
        )}
      >
        <StatusMark status={testCase.status} />
      </td>
      <td className="min-w-0 p-0 align-middle">
        <button
          className="block w-full min-w-0 cursor-pointer bg-panel px-4 py-3 text-left outline-none group-hover:bg-panel-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-selected-line"
          type="button"
          aria-pressed={selected}
          onClick={() => onSelectCase(testCase)}
        >
          <span className="block truncate font-medium text-ink">
            {testCase.displayName}
          </span>
          <span className="mt-1 block truncate text-xs text-muted">
            {testCase.displayFile}
          </span>
        </button>
      </td>
      <td className="min-w-0 bg-panel px-4 py-3 text-right align-middle font-mono text-[0.86rem] tabular-nums group-hover:bg-panel-subtle">
        <ScoreValue score={testCase.eval?.avgScore} />
      </td>
      <td className="min-w-0 bg-panel px-4 py-3 text-right align-middle font-mono text-[0.86rem] tabular-nums text-ink group-hover:bg-panel-subtle">
        {formatDuration(testCase.durationMs)}
      </td>
      <td className="min-w-0 bg-panel px-4 py-3 text-right align-middle font-mono text-[0.86rem] tabular-nums text-ink group-hover:bg-panel-subtle">
        {formatNumber(caseTotalTokens(testCase))}
      </td>
      <td className="min-w-0 bg-panel px-4 py-3 text-right align-middle font-mono text-[0.86rem] tabular-nums text-ink group-hover:bg-panel-subtle">
        {formatNumber(caseToolCallCount(testCase))}
      </td>
    </tr>
  );
}

function caseRailClass(status: ReportCase["status"], selected: boolean) {
  if (selected) {
    return "border-l-selected-line";
  }
  if (status === "failed") {
    return "border-l-fail-line";
  }
  return "border-l-transparent";
}
