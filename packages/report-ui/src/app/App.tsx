import { useEffect, useMemo, useState } from "react";
import {
  ReportWorkspaceSchema,
  type ReportWorkspace,
} from "@vitest-evals/core";
import { CaseDrawer } from "./components/CaseDrawer";
import { CaseWorkbench } from "./components/CaseWorkbench";
import { ReportHeader, RunStrip, SummaryBar } from "./components/ReportChrome";
import {
  filterReportCases,
  summarizeWorkspace,
  type CaseFilters,
} from "./model";
import type { DetailTab } from "./types";

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
  const [filters, setFilters] = useState<CaseFilters>({
    query: "",
    status: "all",
    runId: "all",
  });
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>(
    () => workspace.cases.find((testCase) => testCase.status === "failed")?.id,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  const summary = useMemo(() => summarizeWorkspace(workspace), [workspace]);
  const filteredCases = useMemo(
    () => filterReportCases(workspace.cases, filters),
    [workspace.cases, filters],
  );
  const selectedCase = resolveSelectedCase(selectedCaseId, filteredCases);

  useEffect(() => {
    const nextSelectedCaseId = resolveSelectedCaseId(
      selectedCaseId,
      filteredCases,
    );
    if (nextSelectedCaseId !== selectedCaseId) {
      setSelectedCaseId(nextSelectedCaseId);
    }
  }, [filteredCases, selectedCaseId]);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto w-full max-w-[1800px] px-3 py-5 md:px-5">
        <ReportHeader
          caseCount={summary.caseCount}
          runCount={summary.runCount}
        />
        <SummaryBar summary={summary} />
        <RunStrip runs={workspace.runs} selectedRunId={filters.runId} />

        <section className="grid gap-3" aria-label="Report workspace">
          <CaseWorkbench
            cases={filteredCases}
            filters={filters}
            runs={workspace.runs}
            selectedCaseId={selectedCase?.id}
            totalCases={workspace.cases.length}
            onFiltersChange={setFilters}
            onSelectCase={(testCase) => {
              setSelectedCaseId(testCase.id);
              setDetailTab("overview");
              setIsDrawerOpen(true);
            }}
          />
        </section>

        <CaseDrawer
          detailTab={detailTab}
          open={isDrawerOpen}
          runs={workspace.runs}
          testCase={selectedCase}
          onClose={() => setIsDrawerOpen(false)}
          onTabChange={setDetailTab}
        />
      </div>
    </main>
  );
}

export function resolveSelectedCase(
  selectedCaseId: string | undefined,
  filteredCases: ReportWorkspace["cases"],
) {
  return filteredCases.find((testCase) => testCase.id === selectedCaseId);
}

export function resolveSelectedCaseId(
  selectedCaseId: string | undefined,
  filteredCases: ReportWorkspace["cases"],
) {
  if (
    selectedCaseId &&
    filteredCases.some((testCase) => testCase.id === selectedCaseId)
  ) {
    return selectedCaseId;
  }
  return filteredCases[0]?.id;
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
