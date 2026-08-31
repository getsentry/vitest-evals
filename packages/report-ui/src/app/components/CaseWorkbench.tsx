import type { ReportCase, ReportRun } from "@vitest-evals/core";
import type { ReactNode } from "react";
import {
  type CaseDelta,
  formatSignedScore,
  formatSignedUsd,
  judgeSpread,
  trialStats,
} from "../compare";
import { relativeDisplayPath, resolveOpenPath } from "../display-path";
import { judgeTally, judgeTallyLabel } from "../judge-score";
import {
  type CaseFilters,
  type CaseSortColumn,
  type CaseSortDirection,
  type CaseStatusFilter,
  caseExpected,
  caseModel,
  caseToolCallCount,
  caseTotalTokens,
  compactValue,
  formatDuration,
  formatNumber,
} from "../model";
import { estimateUsageCost, formatUsd } from "../pricing";
import { useReportMeta } from "../report-meta";
import { suggestBetterModel } from "../suggest-model";
import { EmptyState, Field, Input, Select, cx } from "../ui";
import { CostHelp } from "./CostHelp";
import { FileOpenMenu } from "./FileOpenMenu";
import { InstantTooltip } from "./InstantTooltip";
import { ModelHint } from "./ModelHint";
import { ScoreValue, StatusMark } from "./ReportPrimitives";

type CaseColumn = {
  id: CaseSortColumn;
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
    id: "model",
    header: "Model",
    className: "w-[220px]",
  },
  {
    id: "expected",
    header: "Expected",
    className: "w-[140px]",
  },
  {
    id: "score",
    header: "Score",
    className: "w-[82px] text-right",
  },
  {
    id: "delta",
    header: "Δ",
    className: "w-[72px] text-right",
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
    id: "cost",
    header: "Cost",
    className: "w-[88px] text-right",
  },
  {
    id: "tools",
    header: "Tools",
    className: "w-[72px] text-right",
  },
];

export function CaseWorkbench({
  allCases,
  cases,
  deltas,
  filters,
  modelOptions,
  runs,
  selectedCaseId,
  showDelta,
  sortColumn,
  sortDirection,
  totalCases,
  onFiltersChange,
  onSelectCase,
  onSortChange,
}: {
  allCases: ReportCase[];
  cases: ReportCase[];
  deltas: Map<string, CaseDelta>;
  filters: CaseFilters;
  modelOptions: string[];
  runs: ReportRun[];
  selectedCaseId: string | undefined;
  showDelta: boolean;
  sortColumn: CaseSortColumn | undefined;
  sortDirection: CaseSortDirection;
  totalCases: number;
  onFiltersChange: (filters: CaseFilters) => void;
  onSelectCase: (testCase: ReportCase) => void;
  onSortChange: (column: CaseSortColumn) => void;
}) {
  const columns = CASE_COLUMNS.filter(
    (column) => showDelta || column.id !== "delta",
  );
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
          modelOptions={modelOptions}
          runs={runs}
          onFiltersChange={onFiltersChange}
        />
      </div>
      <CaseTable
        allCases={allCases}
        cases={cases}
        columns={columns}
        deltas={deltas}
        selectedCaseId={selectedCaseId}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSelectCase={onSelectCase}
        onSortChange={onSortChange}
      />
    </section>
  );
}

function CaseFilterControls({
  filters,
  modelOptions,
  runs,
  onFiltersChange,
}: {
  filters: CaseFilters;
  modelOptions: string[];
  runs: ReportRun[];
  onFiltersChange: (filters: CaseFilters) => void;
}) {
  const { workspaceRoot } = useReportMeta();
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_minmax(160px,1fr)_220px]">
      <Field label="Search" htmlFor="case-search">
        <Input
          id="case-search"
          value={filters.query}
          onChange={(event) =>
            onFiltersChange({ ...filters, query: event.target.value })
          }
          placeholder="Case, file, judge, model"
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
      <Field label="Model" htmlFor="case-model">
        <Select
          id="case-model"
          value={filters.model}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              model: event.target.value,
            })
          }
        >
          <option value="all">All models</option>
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
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
              {relativeDisplayPath(run.source ?? run.id, workspaceRoot) ||
                run.id}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function CaseTable({
  allCases,
  cases,
  columns,
  deltas,
  selectedCaseId,
  sortColumn,
  sortDirection,
  onSelectCase,
  onSortChange,
}: {
  allCases: ReportCase[];
  cases: ReportCase[];
  columns: CaseColumn[];
  deltas: Map<string, CaseDelta>;
  selectedCaseId: string | undefined;
  sortColumn: CaseSortColumn | undefined;
  sortDirection: CaseSortDirection;
  onSelectCase: (testCase: ReportCase) => void;
  onSortChange: (column: CaseSortColumn) => void;
}) {
  const { pricing } = useReportMeta();
  if (cases.length === 0) {
    return <EmptyState>No matching eval cases</EmptyState>;
  }

  return (
    <div className="h-[clamp(320px,calc(100vh-360px),720px)] overflow-auto">
      <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-panel text-left text-[0.68rem] font-semibold uppercase text-muted-strong shadow-[0_1px_0_var(--color-line-subtle)]">
          <tr>
            {columns.map((column) => {
              const active = sortColumn === column.id;
              return (
                <th
                  aria-sort={
                    active
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={cx("p-0", column.className)}
                  key={column.id}
                >
                  <div
                    className={cx(
                      "flex w-full items-center gap-1 px-4 py-2.5",
                      column.className.includes("text-right")
                        ? "justify-end"
                        : "justify-start",
                    )}
                  >
                    <button
                      className={cx(
                        "inline-flex items-center gap-1 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-selected-line",
                        active ? "text-ink" : "text-muted-strong",
                      )}
                      type="button"
                      onClick={() => onSortChange(column.id)}
                    >
                      <span>{column.header}</span>
                      <span
                        aria-hidden="true"
                        className="font-mono text-[0.6rem]"
                      >
                        {active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                    {column.id === "cost" ? (
                      <span className="normal-case">
                        <CostHelp align="right" pricing={pricing} />
                      </span>
                    ) : null}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {cases.map((testCase) => (
            <CaseRow
              key={testCase.id}
              allCases={allCases}
              delta={deltas.get(testCase.id)}
              selected={selectedCaseId === testCase.id}
              showDelta={columns.some((column) => column.id === "delta")}
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
  allCases,
  delta,
  selected,
  showDelta,
  testCase,
  onSelectCase,
}: {
  allCases: ReportCase[];
  delta: CaseDelta | undefined;
  selected: boolean;
  showDelta: boolean;
  testCase: ReportCase;
  onSelectCase: (testCase: ReportCase) => void;
}) {
  const { pricing, workspaceRoot } = useReportMeta();
  const model = caseModel(testCase);
  const suggestion = suggestBetterModel(model, pricing);
  const expected = compactValue(caseExpected(testCase));
  const displayFile =
    relativeDisplayPath(testCase.displayFile, workspaceRoot) ||
    testCase.displayFile;
  const usageCost = estimateUsageCost(
    testCase.harness?.run?.usage ?? {},
    pricing,
  );
  const spread = judgeSpread(testCase);
  const trials = trialStats(testCase, allCases);
  const tally = judgeTally(testCase);
  const scoreHint = [
    judgeTallyLabel(tally),
    spread.stdevScore !== undefined
      ? `σ ${Math.round(spread.stdevScore * 100)}pp`
      : undefined,
    trials.count > 1 ? `${trials.count} trials` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const selectCase = () => onSelectCase(testCase);

  return (
    <tr className="group cursor-pointer border-b border-line-subtle">
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className={cx(
            "border-l-4 text-left",
            caseRailClass(testCase.status, selected),
          )}
          label={`Open ${testCase.displayName}`}
          onClick={selectCase}
        >
          <StatusMark status={testCase.status} />
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <div className="flex min-w-0 items-stretch">
          <CaseCellButton
            className="min-w-0 flex-1 text-left"
            label={`Open ${testCase.displayName}`}
            onClick={selectCase}
            selected={selected}
            tabIndex={0}
          >
            <span className="block truncate font-medium text-ink">
              {testCase.displayName}
            </span>
            <span className="mt-1 block truncate text-xs text-muted">
              {displayFile}
            </span>
          </CaseCellButton>
          <div className="flex items-center bg-panel pr-2 group-hover:bg-panel-subtle">
            <FileOpenMenu
              file={
                resolveOpenPath(testCase.file, workspaceRoot) ?? testCase.file
              }
            />
          </div>
        </div>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-left font-mono text-[0.78rem]"
          label={`Open ${testCase.displayName}`}
          onClick={selectCase}
        >
          <span className="block truncate" title={model}>
            {model ?? "n/a"}
          </span>
          {suggestion ? <ModelHint suggestion={suggestion} /> : null}
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-left text-xs text-muted"
          label={`Open ${testCase.displayName}`}
          onClick={selectCase}
        >
          <span className="block truncate" title={expected || undefined}>
            {expected || "n/a"}
          </span>
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums"
          label={`Open ${testCase.displayName}`}
          onClick={selectCase}
        >
          <InstantTooltip content={scoreHint || "No judges"}>
            <ScoreValue score={testCase.eval?.avgScore} />
          </InstantTooltip>
        </CaseCellButton>
      </td>
      {showDelta ? (
        <td className="min-w-0 p-0 align-middle">
          <CaseCellButton
            className="text-right font-mono text-[0.78rem] tabular-nums text-ink"
            label={`Open ${testCase.displayName}`}
            onClick={selectCase}
          >
            {delta ? (
              <InstantTooltip
                content={`${formatSignedUsd(delta.costUsd)}${delta.statusChanged ? " · status changed" : ""}`}
              >
                {formatSignedScore(delta.score)}
              </InstantTooltip>
            ) : (
              "—"
            )}
          </CaseCellButton>
        </td>
      ) : null}
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums text-ink"
          label={`Open ${testCase.displayName}`}
          onClick={selectCase}
        >
          {formatDuration(testCase.durationMs)}
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums text-ink"
          label={`Open ${testCase.displayName}`}
          onClick={selectCase}
        >
          {usageCost ? (
            <InstantTooltip content={formatUsd(usageCost.totalUsd)}>
              {formatNumber(caseTotalTokens(testCase))}
            </InstantTooltip>
          ) : (
            formatNumber(caseTotalTokens(testCase))
          )}
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums text-ink"
          label={`Open ${testCase.displayName}`}
          onClick={selectCase}
        >
          {usageCost ? formatUsd(usageCost.totalUsd) : "n/a"}
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums text-ink"
          label={`Open ${testCase.displayName}`}
          onClick={selectCase}
        >
          {formatNumber(caseToolCallCount(testCase))}
        </CaseCellButton>
      </td>
    </tr>
  );
}

function CaseCellButton({
  children,
  className,
  label,
  selected,
  tabIndex = -1,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  selected?: boolean;
  tabIndex?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        "block h-full w-full min-w-0 cursor-pointer bg-panel px-4 py-3 outline-none group-hover:bg-panel-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-selected-line",
        className,
      )}
      type="button"
      aria-label={label}
      aria-pressed={selected}
      tabIndex={tabIndex}
      onClick={onClick}
    >
      {children}
    </button>
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
