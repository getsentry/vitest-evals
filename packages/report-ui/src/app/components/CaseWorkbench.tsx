import type { ReportCase, ReportRun } from "@vitest-evals/core";
import {
  caseToolCallCount,
  caseTotalTokens,
  formatDuration,
  formatNumber,
  type CaseFilters,
  type CaseStatusFilter,
} from "../model";
import { EmptyState, Field, Input, SectionHeader, Select, cx } from "../ui";
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
      <SectionHeader
        title="Case ledger"
        detail={`${cases.length} of ${totalCases} case(s)`}
      />
      <CaseFilterControls
        filters={filters}
        runs={runs}
        onFiltersChange={onFiltersChange}
      />
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
    <div className="grid gap-2 border-b border-line-subtle bg-panel-subtle px-3 py-2.5 md:grid-cols-[minmax(220px,1fr)_150px_220px]">
      <Field label="Search" htmlFor="case-search">
        <Input
          id="case-search"
          value={filters.query}
          onChange={(event) =>
            onFiltersChange({ ...filters, query: event.target.value })
          }
          placeholder="Case, file, judge, harness"
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
    <div className="max-h-[calc(100vh-340px)] min-h-[430px] overflow-auto">
      <table className="w-full min-w-[680px] table-fixed border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-canvas text-left text-[0.68rem] font-semibold uppercase text-muted-strong">
          <tr>
            {CASE_COLUMNS.map((column) => (
              <th
                className={cx(
                  "border-b border-line-subtle px-3 py-2",
                  column.className,
                )}
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
    <tr
      className={cx(
        "border-b border-line-subtle bg-panel hover:bg-panel-subtle",
        selected && "bg-selected",
      )}
    >
      <td
        className={cx(
          "min-w-0 border-l-4 px-3 py-3 align-middle",
          caseRailClass(testCase.status, selected),
        )}
      >
        <StatusMark status={testCase.status} />
      </td>
      <td className="min-w-0 px-3 py-3 align-middle">
        <button
          className="block w-full min-w-0 rounded-md text-left outline-none focus:ring-2 focus:ring-selected-line"
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
      <td className="min-w-0 px-3 py-3 text-right align-middle font-mono text-[0.86rem] tabular-nums">
        <ScoreValue score={testCase.eval?.avgScore} />
      </td>
      <td className="min-w-0 px-3 py-3 text-right align-middle font-mono text-[0.86rem] tabular-nums text-ink">
        {formatDuration(testCase.durationMs)}
      </td>
      <td className="min-w-0 px-3 py-3 text-right align-middle font-mono text-[0.86rem] tabular-nums text-ink">
        {formatNumber(caseTotalTokens(testCase))}
      </td>
      <td className="min-w-0 px-3 py-3 text-right align-middle font-mono text-[0.86rem] tabular-nums text-ink">
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
