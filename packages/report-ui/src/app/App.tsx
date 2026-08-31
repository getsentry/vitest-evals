import {
  type ReportWorkspace,
  ReportWorkspaceSchema,
} from "@vitest-evals/core";
import { useEffect, useMemo, useState } from "react";
import { CaseDrawer } from "./components/CaseDrawer";
import { CaseWorkbench } from "./components/CaseWorkbench";
import { ReportHeader, RunStrip, SummaryBar } from "./components/ReportChrome";
import {
  type CaseFilters,
  type CaseSortColumn,
  filterReportCases,
  sortReportCases,
  summarizeWorkspace,
} from "./model";
import { useReportSearch } from "./report-state";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; workspace: ReportWorkspace };

export function App() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const abortController = new AbortController();
    loadWorkspace(abortController.signal).then((nextState) => {
      if (!abortController.signal.aborted && nextState) {
        setLoadState(nextState);
      }
    });
    return () => abortController.abort();
  }, []);

  if (loadState.status === "loading") {
    return <CenteredState title="Loading report" detail="Reading workspace" />;
  }

  if (loadState.status === "error") {
    return (
      <CenteredState title="Unable to load report" detail={loadState.message} />
    );
  }

  return <ReportApp workspace={loadState.workspace} />;
}

function ReportApp({ workspace }: { workspace: ReportWorkspace }) {
  const { search, setSearch } = useReportSearch();
  const filters = useMemo<CaseFilters>(
    () => ({
      query: search.q,
      status: search.status,
      runId: search.run,
    }),
    [search.q, search.run, search.status],
  );

  const filteredCases = useMemo(
    () => filterReportCases(workspace.cases, filters),
    [workspace.cases, filters],
  );
  const visibleCases = useMemo(
    () => sortReportCases(filteredCases, search.sort, search.dir),
    [filteredCases, search.sort, search.dir],
  );
  const visibleRuns = useMemo(
    () => visibleWorkspaceRuns(workspace.runs, filters, visibleCases),
    [workspace.runs, filters, visibleCases],
  );
  const summary = useMemo(
    () =>
      summarizeWorkspace({
        ...workspace,
        cases: visibleCases,
        runs: visibleRuns,
      }),
    [workspace, visibleCases, visibleRuns],
  );
  const selectedCase = resolveSelectedCase(search.case, workspace.cases);
  const isDrawerOpen = Boolean(search.case && selectedCase);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6 md:px-6">
        <ReportHeader
          caseCount={summary.caseCount}
          runCount={summary.runCount}
        />
        <section
          className="overflow-hidden rounded-lg border border-line-subtle bg-panel shadow-[0_14px_34px_rgba(23,32,28,0.06)]"
          aria-label="Report workspace"
        >
          <SummaryBar currentStatus={search.status} summary={summary} />
          <RunStrip
            currentStatus={search.status}
            runs={visibleRuns}
            selectedRunId={search.run}
          />
          <CaseWorkbench
            cases={visibleCases}
            filters={filters}
            runs={workspace.runs}
            selectedCaseId={selectedCase?.id}
            sortColumn={search.sort}
            sortDirection={search.dir}
            totalCases={workspace.cases.length}
            onFiltersChange={(nextFilters) =>
              setSearch({
                q: nextFilters.query,
                run: nextFilters.runId,
                status: nextFilters.status,
              })
            }
            onSelectCase={(testCase) =>
              setSearch(
                { case: testCase.id, tab: "overview" },
                { replace: false },
              )
            }
            onSortChange={(column) =>
              setSearch(nextSortSearch(search.sort, search.dir, column))
            }
          />
        </section>

        <CaseDrawer
          detailTab={search.tab}
          open={isDrawerOpen}
          runs={workspace.runs}
          testCase={selectedCase}
          onClose={() =>
            setSearch({ case: undefined, tab: "overview" }, { replace: false })
          }
          onTabChange={(tab) => setSearch({ tab })}
        />
      </div>
    </main>
  );
}

export function nextSortSearch(
  currentColumn: CaseSortColumn | undefined,
  currentDirection: "asc" | "desc",
  column: CaseSortColumn,
) {
  if (currentColumn !== column) {
    return {
      sort: column,
      dir: defaultSortDirection(column),
    };
  }

  return {
    sort: column,
    dir: currentDirection === "asc" ? ("desc" as const) : ("asc" as const),
  };
}

function defaultSortDirection(column: CaseSortColumn): "asc" | "desc" {
  return column === "case" || column === "status" ? "asc" : "desc";
}

export function resolveSelectedCase(
  selectedCaseId: string | undefined,
  cases: ReportWorkspace["cases"],
) {
  return cases.find((testCase) => testCase.id === selectedCaseId);
}

export function resolveSelectedCaseId(
  selectedCaseId: string | undefined,
  filteredCases: ReportWorkspace["cases"],
) {
  if (selectedCaseId === undefined) {
    return undefined;
  }

  if (filteredCases.some((testCase) => testCase.id === selectedCaseId)) {
    return selectedCaseId;
  }
  return filteredCases[0]?.id;
}

export function summarizeVisibleWorkspace(
  workspace: ReportWorkspace,
  filters: CaseFilters,
  filteredCases: ReportWorkspace["cases"],
) {
  return summarizeWorkspace({
    ...workspace,
    cases: filteredCases,
    runs: visibleWorkspaceRuns(workspace.runs, filters, filteredCases),
  });
}

export function visibleWorkspaceRuns(
  runs: ReportWorkspace["runs"],
  filters: CaseFilters,
  filteredCases: ReportWorkspace["cases"],
) {
  if (!hasActiveCaseFilters(filters)) {
    return runs;
  }

  return visibleRunsForCases(runs, filteredCases);
}

function hasActiveCaseFilters(filters: CaseFilters) {
  return (
    filters.query.trim().length > 0 ||
    filters.status !== "all" ||
    filters.runId !== "all"
  );
}

function visibleRunsForCases(
  runs: ReportWorkspace["runs"],
  filteredCases: ReportWorkspace["cases"],
) {
  const visibleRunIds = new Set(
    filteredCases.map((testCase) => testCase.runId),
  );
  return runs.filter((run) => visibleRunIds.has(run.id));
}

export async function loadWorkspace(
  signal: AbortSignal,
): Promise<LoadState | undefined> {
  try {
    const response = await fetch("/data/workspace.json", { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const workspace = ReportWorkspaceSchema.parse(await response.json());
    return { status: "ready", workspace };
  } catch (error) {
    if (signal.aborted) {
      return undefined;
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function CenteredState({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="grid min-h-screen place-content-center bg-canvas p-6 text-center text-ink">
      <p className="text-xs font-semibold uppercase text-muted-strong">
        vitest-evals
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </main>
  );
}
