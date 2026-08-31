import {
  type ReportCase,
  type ReportWorkspace,
  ReportWorkspaceSchema,
} from "@vitest-evals/core";
import { useEffect, useMemo, useState } from "react";
import { caseToMarkdown } from "./case-markdown";
import { formatJunitXml, formatPullRequestComment } from "./ci-artifacts";
import {
  type CaseDelta,
  caseDelta,
  resolveBaselineRun,
  workspaceDelta,
} from "./compare";
import { CaseDrawer } from "./components/CaseDrawer";
import { CaseWorkbench } from "./components/CaseWorkbench";
import {
  CommandPalette,
  type PaletteCommand,
  downloadTextFile,
} from "./components/CommandPalette";
import { ReportHeader, RunStrip, SummaryBar } from "./components/ReportChrome";
import { relativeDisplayPath, resolveOpenPath } from "./display-path";
import { editorTargets } from "./file-open";
import {
  type CaseFilters,
  type CaseSortColumn,
  filterReportCases,
  formatJson,
  hasActiveCaseFilters,
  sortReportCases,
  summarizeWorkspace,
  uniqueCaseModels,
} from "./model";
import { estimateWorkspaceUsageCost } from "./pricing";
import {
  DEFAULT_REPORT_META,
  type ReportMeta,
  ReportMetaContext,
  readReportMeta,
} from "./report-meta";
import { useReportSearch } from "./report-state";
import { postRerun } from "./rerun";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; workspace: ReportWorkspace; meta: ReportMeta };

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

  return <ReportApp meta={loadState.meta} workspace={loadState.workspace} />;
}

function ReportApp({
  meta,
  workspace,
}: {
  meta: ReportMeta;
  workspace: ReportWorkspace;
}) {
  const { search, setSearch } = useReportSearch();
  const filters = useMemo<CaseFilters>(
    () => ({
      query: search.q,
      status: search.status,
      runId: search.run,
      model: search.model,
    }),
    [search.model, search.q, search.run, search.status],
  );

  const filteredCases = useMemo(
    () => filterReportCases(workspace.cases, filters),
    [workspace.cases, filters],
  );
  const baselineRun = useMemo(
    () => resolveBaselineRun(workspace.runs, search.vs),
    [search.vs, workspace.runs],
  );
  const baselineCases = useMemo(
    () =>
      baselineRun
        ? workspace.cases.filter(
            (testCase) => testCase.runId === baselineRun.id,
          )
        : [],
    [baselineRun, workspace.cases],
  );
  const deltas = useMemo(() => {
    const next = new Map<string, CaseDelta>();
    if (!baselineRun) {
      return next;
    }
    for (const testCase of workspace.cases) {
      if (testCase.runId === baselineRun.id) {
        continue;
      }
      const delta = caseDelta(testCase, baselineCases, meta.pricing);
      if (delta) {
        next.set(testCase.id, delta);
      }
    }
    return next;
  }, [baselineCases, baselineRun, meta.pricing, workspace.cases]);
  const scoreDeltas = useMemo(() => {
    const next = new Map<string, number>();
    for (const [id, delta] of deltas) {
      if (delta.score !== undefined) {
        next.set(id, delta.score);
      }
    }
    return next;
  }, [deltas]);
  const visibleCases = useMemo(
    () =>
      sortReportCases(
        filteredCases,
        search.sort,
        search.dir,
        meta.pricing,
        scoreDeltas,
      ),
    [filteredCases, meta.pricing, scoreDeltas, search.sort, search.dir],
  );
  const runDelta = useMemo(
    () => workspaceDelta(workspace, meta.pricing),
    [meta.pricing, workspace],
  );
  const workspaceSummary = useMemo(
    () => summarizeWorkspace(workspace),
    [workspace],
  );
  const workspaceCost = useMemo(
    () =>
      estimateWorkspaceUsageCost(
        workspace.cases.map((testCase) => testCase.harness?.run?.usage ?? {}),
        meta.pricing,
      ),
    [meta.pricing, workspace.cases],
  );
  const sourceLabel =
    relativeDisplayPath(
      workspace.runs[0]?.source ?? workspace.runs[0]?.id,
      meta.workspaceRoot,
    ) || "Eval report";
  const selectedCase = resolveSelectedCase(search.case, workspace.cases);
  const isDrawerOpen = Boolean(search.case && selectedCase);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const clearFilters = () =>
    setSearch({
      q: "",
      status: "all",
      run: "all",
      model: "all",
    });

  const openCase = (testCase: ReportCase | undefined, tab = search.tab) => {
    if (!testCase) {
      return;
    }
    setSearch({ case: testCase.id, tab }, { replace: false });
  };

  const moveVisibleCase = (delta: 1 | -1) => {
    openCase(adjacentVisibleCase(visibleCases, selectedCase?.id, delta));
  };

  const paletteCommands: PaletteCommand[] = (() => {
    const selectedFile =
      resolveOpenPath(selectedCase?.file, meta.workspaceRoot) ??
      selectedCase?.file;
    const selectedRun = workspace.runs.find(
      (run) => run.id === selectedCase?.runId,
    );
    const commands: PaletteCommand[] = [
      {
        id: "filter-failed",
        group: "Filters",
        label: "Show failed cases",
        run: () => setSearch({ status: "failed" }),
      },
      {
        id: "filter-passed",
        group: "Filters",
        label: "Show passed cases",
        run: () => setSearch({ status: "passed" }),
      },
      {
        id: "filter-all",
        group: "Filters",
        label: "Show all cases",
        run: () => setSearch({ status: "all" }),
      },
      {
        id: "clear-filters",
        group: "Filters",
        label: "Reset filters",
        run: clearFilters,
      },
      {
        id: "focus-search",
        group: "Navigation",
        label: "Focus search",
        hint: "/",
        run: () => document.getElementById("case-search")?.focus(),
      },
      {
        id: "next-case",
        group: "Navigation",
        label: "Next case",
        hint: "j",
        run: () => moveVisibleCase(1),
      },
      {
        id: "prev-case",
        group: "Navigation",
        label: "Previous case",
        hint: "k",
        run: () => moveVisibleCase(-1),
      },
      {
        id: "download-junit",
        group: "Export",
        label: "Download JUnit XML",
        run: () =>
          downloadTextFile(
            "vitest-evals.junit.xml",
            formatJunitXml(workspace),
            "application/xml",
          ),
      },
      {
        id: "download-comment",
        group: "Export",
        label: "Download PR comment",
        run: () =>
          downloadTextFile(
            "vitest-evals.comment.md",
            formatPullRequestComment(workspace, meta.pricing),
            "text/markdown",
          ),
      },
    ];
    if (selectedCase) {
      commands.push({
        id: "rerun-selected",
        group: "Actions",
        label: "Re-run selected case",
        run: () => {
          void postRerun(selectedCase).then((result) => {
            if (result.ok) {
              window.location.reload();
            }
          });
        },
      });
      commands.push({
        id: "open-selected",
        group: "Navigation",
        label: "Open selected case",
        run: () => openCase(selectedCase, "overview"),
      });
      commands.push({
        id: "compare-tab",
        group: "Navigation",
        label: "Open Compare tab",
        run: () => openCase(selectedCase, "compare"),
      });
      commands.push({
        id: "copy-markdown",
        group: "Copy",
        label: "Copy as Markdown",
        run: () => {
          void navigator.clipboard.writeText(
            caseToMarkdown(selectedCase, selectedRun),
          );
        },
      });
      commands.push({
        id: "copy-json",
        group: "Copy",
        label: "Copy JSON",
        run: () => {
          void navigator.clipboard.writeText(formatJson(selectedCase));
        },
      });
      if (selectedCase.failureMessages.length > 0) {
        commands.push({
          id: "copy-failure",
          group: "Copy",
          label: "Copy failure",
          run: () => {
            void navigator.clipboard.writeText(
              selectedCase.failureMessages.join("\n\n"),
            );
          },
        });
      }
      if (selectedFile) {
        for (const target of editorTargets({ file: selectedFile })) {
          commands.push({
            id: `open-${target.id}`,
            group: "Editor",
            label: target.label,
            hint: selectedCase.displayName,
            run: () => {
              window.location.href = target.href;
            },
          });
        }
      }
    }
    for (const testCase of visibleCases.slice(0, 80)) {
      commands.push({
        id: `case-${testCase.id}`,
        group: "Cases",
        label: testCase.displayName,
        hint: testCase.status,
        run: () => openCase(testCase),
      });
    }
    return commands;
  })();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (paletteOpen) {
        return;
      }
      if (event.key === "Escape") {
        if (isDrawerOpen) {
          return;
        }
        if (hasActiveCaseFilters(filters)) {
          event.preventDefault();
          setSearch({
            q: "",
            status: "all",
            run: "all",
            model: "all",
          });
        }
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        document.getElementById("case-search")?.focus();
        return;
      }
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const next = adjacentVisibleCase(
          visibleCases,
          selectedCase?.id,
          event.key === "j" ? 1 : -1,
        );
        if (next) {
          setSearch({ case: next.id }, { replace: false });
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    filters,
    isDrawerOpen,
    paletteOpen,
    selectedCase,
    setSearch,
    visibleCases,
  ]);

  return (
    <ReportMetaContext.Provider value={meta}>
      <main className="min-h-screen bg-canvas text-ink">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-4 md:px-6">
          <ReportHeader
            caseCount={workspaceSummary.caseCount}
            runCount={workspaceSummary.runCount}
            sourceLabel={sourceLabel}
            visibleCaseCount={visibleCases.length}
            onOpenPalette={() => setPaletteOpen(true)}
          />
          <section
            className="overflow-hidden rounded-lg border border-line-subtle bg-panel shadow-[0_14px_34px_rgba(23,32,28,0.06)]"
            aria-label="Report workspace"
          >
            <SummaryBar
              currentStatus={search.status}
              runDelta={runDelta}
              summary={workspaceSummary}
              workspaceCost={workspaceCost}
            />
            {workspace.runs.length > 1 ? (
              <RunStrip
                currentStatus={search.status}
                runs={workspace.runs}
                selectedRunId={search.run}
              />
            ) : null}
            <CaseWorkbench
              allCases={workspace.cases}
              cases={visibleCases}
              deltas={deltas}
              filters={filters}
              modelOptions={uniqueCaseModels(workspace.cases)}
              runs={workspace.runs}
              selectedCaseId={selectedCase?.id}
              showDelta={Boolean(baselineRun)}
              sortColumn={search.sort}
              sortDirection={search.dir}
              totalCases={workspace.cases.length}
              onFiltersChange={(nextFilters) =>
                setSearch({
                  q: nextFilters.query,
                  model: nextFilters.model,
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
            baselineCases={baselineCases}
            cases={workspace.cases}
            detailTab={search.tab}
            filtersActive={hasActiveCaseFilters(filters)}
            open={isDrawerOpen}
            runs={workspace.runs}
            testCase={selectedCase}
            onClose={() =>
              setSearch(
                { case: undefined, tab: "overview" },
                { replace: false },
              )
            }
            onNext={() => moveVisibleCase(1)}
            onPrev={() => moveVisibleCase(-1)}
            onResetFilters={clearFilters}
            onTabChange={(tab) => setSearch({ tab })}
          />
          <CommandPalette
            commands={paletteCommands}
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
          />
        </div>
      </main>
    </ReportMetaContext.Provider>
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
  return column === "case" ||
    column === "model" ||
    column === "status" ||
    column === "expected"
    ? "asc"
    : "desc";
}

export function resolveSelectedCase(
  selectedCaseId: string | undefined,
  cases: ReportWorkspace["cases"],
) {
  return cases.find((testCase) => testCase.id === selectedCaseId);
}

export function adjacentVisibleCase(
  cases: ReportCase[],
  currentId: string | undefined,
  delta: 1 | -1,
) {
  if (cases.length === 0) {
    return undefined;
  }
  const index = cases.findIndex((testCase) => testCase.id === currentId);
  if (index < 0) {
    return cases[delta === 1 ? 0 : cases.length - 1];
  }
  const next = index + delta;
  if (next < 0 || next >= cases.length) {
    return cases[index];
  }
  return cases[next];
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
    const [workspaceResponse, metaResponse] = await Promise.all([
      fetch("/data/workspace.json", { signal }),
      fetch("/data/meta.json", { signal }),
    ]);
    if (!workspaceResponse.ok) {
      throw new Error(`HTTP ${workspaceResponse.status}`);
    }
    const workspace = ReportWorkspaceSchema.parse(
      await workspaceResponse.json(),
    );
    const meta = metaResponse.ok
      ? readReportMeta(await metaResponse.json())
      : DEFAULT_REPORT_META;
    return { status: "ready", meta, workspace };
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

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
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
