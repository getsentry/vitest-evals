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
  caseScoreTone,
  caseToolCallCount,
  caseTotalTokens,
  compactValue,
  formatDuration,
  formatNumber,
  hasActiveCaseFilters,
} from "../model";
import { estimateUsageCost, formatUsd } from "../pricing";
import { useReportMeta } from "../report-meta";
import { formatElapsed, jobElapsedMs, runningJobForCase } from "../rerun";
import { suggestBetterModel } from "../suggest-model";
import { EmptyState, Input, Select, cx } from "../ui";
import { FileOpenMenu } from "./FileOpenMenu";
import { InstantTooltip } from "./InstantTooltip";
import { ModelHint } from "./ModelHint";
import { ScoreValue, StatusMark } from "./ReportPrimitives";
import { RerunButton } from "./RerunButton";
import { TaskSpinner, useRerunSession } from "./RerunSession";

type CaseColumn = {
  id: CaseSortColumn;
  header: string;
  className: string;
};

const EMPTY_FILTERS: CaseFilters = {
  query: "",
  status: "all",
  runId: "all",
  model: "all",
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
    className: "w-[44px]",
  },
  {
    id: "case",
    header: "Case",
    className: "min-w-[220px]",
  },
  {
    id: "model",
    header: "Model",
    className: "w-[160px]",
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
    className: "w-[88px] text-right",
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
  const showExpected = allCases.some(
    (testCase) => caseExpected(testCase) !== undefined,
  );
  const columns = CASE_COLUMNS.filter((column) => {
    if (column.id === "delta") {
      return showDelta;
    }
    if (column.id === "expected") {
      return showExpected;
    }
    return true;
  });
  return (
    <section className="min-w-0 bg-panel">
      <div className="border-b border-line-subtle px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-sm font-semibold text-ink">
            Ledger
            <span className="ml-1.5 font-normal text-muted">
              {cases.length}/{totalCases}
            </span>
          </h2>
          <CaseFilterControls
            filters={filters}
            modelOptions={modelOptions}
            runs={runs}
            onFiltersChange={onFiltersChange}
          />
          <button
            className={cx(
              "h-8 shrink-0 rounded-md px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-selected-line",
              hasActiveCaseFilters(filters)
                ? "border border-ink text-ink hover:bg-panel-subtle"
                : "border border-line-subtle text-muted",
            )}
            type="button"
            disabled={!hasActiveCaseFilters(filters)}
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
          >
            Reset
          </button>
        </div>
        <FilterChips filters={filters} onFiltersChange={onFiltersChange} />
      </div>
      <CaseTable
        allCases={allCases}
        cases={cases}
        columns={columns}
        deltas={deltas}
        query={filters.query}
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
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        className="min-w-0 flex-1"
        id="case-search"
        value={filters.query}
        onChange={(event) =>
          onFiltersChange({ ...filters, query: event.target.value })
        }
        placeholder="Case, file, judge, model — /"
      />
      <Select
        aria-label="Status"
        className="w-[8.5rem]"
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
      {modelOptions.length > 1 ? (
        <Select
          aria-label="Model"
          className="w-[11rem]"
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
      ) : null}
      {runs.length > 1 ? (
        <Select
          aria-label="Run"
          className="w-[12rem]"
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
      ) : null}
    </div>
  );
}

function CaseTable({
  allCases,
  cases,
  columns,
  deltas,
  query,
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
  query: string;
  selectedCaseId: string | undefined;
  sortColumn: CaseSortColumn | undefined;
  sortDirection: CaseSortDirection;
  onSelectCase: (testCase: ReportCase) => void;
  onSortChange: (column: CaseSortColumn) => void;
}) {
  if (cases.length === 0) {
    return <EmptyState>No matching eval cases</EmptyState>;
  }

  return (
    <div className="h-[clamp(360px,calc(100vh-180px),860px)] overflow-auto">
      <table
        className="w-full table-fixed border-collapse text-sm"
        style={{ minWidth: `${ledgerMinWidth(columns)}px` }}
      >
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
                      "flex w-full items-center gap-1 px-3 py-1.5",
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
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="font-mono text-[0.6rem]"
                        >
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      ) : null}
                    </button>
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
              query={query}
              selected={selectedCaseId === testCase.id}
              showDelta={columns.some((column) => column.id === "delta")}
              showExpected={columns.some((column) => column.id === "expected")}
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
  query,
  selected,
  showDelta,
  showExpected,
  testCase,
  onSelectCase,
}: {
  allCases: ReportCase[];
  delta: CaseDelta | undefined;
  query: string;
  selected: boolean;
  showDelta: boolean;
  showExpected: boolean;
  testCase: ReportCase;
  onSelectCase: (testCase: ReportCase) => void;
}) {
  const { jobs, now } = useRerunSession();
  const runningJob = runningJobForCase(jobs, testCase);
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
  const fileHit = includesIgnoreCase(displayFile, query);
  const cellSelected = selected;

  return (
    <tr className="group cursor-pointer border-b border-line-subtle">
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className={cx(
            "border-l-4 text-left",
            caseRailClass(testCase.status, selected),
          )}
          label={`Open ${testCase.displayName}`}
          selected={cellSelected}
          onClick={selectCase}
        >
          {runningJob ? (
            <TaskSpinner className="text-warn" />
          ) : (
            <StatusMark showLabel={false} status={testCase.status} />
          )}
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
            <span
              className="block truncate font-medium text-ink"
              title={displayFile}
            >
              <HighlightQuery text={testCase.displayName} query={query} />
            </span>
            {fileHit ? (
              <span className="mt-1 block truncate text-xs text-muted">
                <HighlightQuery text={displayFile} query={query} />
              </span>
            ) : null}
          </CaseCellButton>
          <div
            className={cx(
              "flex items-center gap-0.5 pr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100",
              selected
                ? "bg-selected group-hover:bg-selected"
                : "bg-panel group-hover:bg-panel-subtle",
            )}
          >
            <RerunButton compact testCase={testCase} />
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
          selected={cellSelected}
          onClick={selectCase}
        >
          <span className="inline-flex max-w-full items-center gap-1">
            <span className="truncate" title={model}>
              <HighlightQuery text={model ?? "n/a"} query={query} />
            </span>
            {suggestion ? <ModelHint suggestion={suggestion} /> : null}
          </span>
        </CaseCellButton>
      </td>
      {showExpected ? (
        <td className="min-w-0 p-0 align-middle">
          <CaseCellButton
            className="text-left text-xs text-muted"
            label={`Open ${testCase.displayName}`}
            selected={cellSelected}
            onClick={selectCase}
          >
            <span className="block truncate" title={expected || undefined}>
              {expected || "n/a"}
            </span>
          </CaseCellButton>
        </td>
      ) : null}
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums"
          label={`Open ${testCase.displayName}`}
          selected={cellSelected}
          onClick={selectCase}
        >
          <InstantTooltip content={scoreHint || "No judges"}>
            <ScoreValue
              score={testCase.eval?.avgScore}
              tone={caseScoreTone(testCase)}
            />
          </InstantTooltip>
        </CaseCellButton>
      </td>
      {showDelta ? (
        <td className="min-w-0 p-0 align-middle">
          <CaseCellButton
            className="text-right font-mono text-[0.78rem] tabular-nums text-ink"
            label={`Open ${testCase.displayName}`}
            selected={cellSelected}
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
          selected={cellSelected}
          onClick={selectCase}
        >
          {runningJob ? (
            <span className="text-warn">
              {formatElapsed(jobElapsedMs(runningJob, now))}
            </span>
          ) : (
            formatDuration(testCase.durationMs)
          )}
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums text-ink"
          label={`Open ${testCase.displayName}`}
          selected={cellSelected}
          onClick={selectCase}
        >
          {formatNumber(caseTotalTokens(testCase))}
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums text-ink"
          label={`Open ${testCase.displayName}`}
          selected={cellSelected}
          onClick={selectCase}
        >
          {usageCost ? formatUsd(usageCost.totalUsd) : "n/a"}
        </CaseCellButton>
      </td>
      <td className="min-w-0 p-0 align-middle">
        <CaseCellButton
          className="text-right font-mono text-[0.86rem] tabular-nums text-ink"
          label={`Open ${testCase.displayName}`}
          selected={cellSelected}
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
        "block h-full w-full min-w-0 cursor-pointer px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-selected-line",
        selected
          ? "bg-selected group-hover:bg-selected"
          : "bg-panel group-hover:bg-panel-subtle",
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

function FilterChips({
  filters,
  onFiltersChange,
}: {
  filters: CaseFilters;
  onFiltersChange: (filters: CaseFilters) => void;
}) {
  if (!hasActiveCaseFilters(filters)) {
    return null;
  }
  const chips: Array<{ id: string; label: string; clear: CaseFilters }> = [];
  if (filters.query.trim()) {
    chips.push({
      id: "q",
      label: `“${filters.query.trim()}”`,
      clear: { ...filters, query: "" },
    });
  }
  if (filters.status !== "all") {
    chips.push({
      id: "status",
      label: filters.status,
      clear: { ...filters, status: "all" },
    });
  }
  if (filters.model !== "all") {
    chips.push({
      id: "model",
      label: filters.model,
      clear: { ...filters, model: "all" },
    });
  }
  if (filters.runId !== "all") {
    chips.push({
      id: "run",
      label: filters.runId,
      clear: { ...filters, runId: "all" },
    });
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          className="inline-flex h-7 items-center gap-1 rounded-full border border-line-subtle bg-panel-subtle px-2.5 text-xs font-medium text-ink outline-none hover:border-line focus-visible:ring-2 focus-visible:ring-selected-line"
          key={chip.id}
          type="button"
          onClick={() => onFiltersChange(chip.clear)}
        >
          {chip.label}
          <span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}

function HighlightQuery({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) {
    return text;
  }
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) {
    return text;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-selected text-ink">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

function includesIgnoreCase(text: string, query: string) {
  const needle = query.trim();
  return needle.length > 0 && text.toLowerCase().includes(needle.toLowerCase());
}

function ledgerMinWidth(columns: CaseColumn[]) {
  return columns.reduce((total, column) => {
    if (column.id === "case") {
      return total + 220;
    }
    if (column.id === "model") {
      return total + 160;
    }
    if (column.id === "expected") {
      return total + 140;
    }
    return total + 90;
  }, 0);
}
