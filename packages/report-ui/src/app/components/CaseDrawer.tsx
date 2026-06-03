import { useEffect } from "react";
import type { ReportCase, ReportRun } from "@vitest-evals/core";
import { formatDuration } from "../model";
import type { DetailTab } from "../types";
import { TabButton } from "../ui";
import { OverviewTab } from "./OverviewTab";
import { RawTab } from "./RawTab";
import { Fact, FactsGrid, ScoreValue, StatusMark } from "./ReportPrimitives";
import { TranscriptTab } from "./TranscriptTab";

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "transcript", label: "Transcript" },
  { id: "raw", label: "Raw" },
];

export function CaseDrawer({
  detailTab,
  open,
  runs,
  testCase,
  onClose,
  onTabChange,
}: {
  detailTab: DetailTab;
  open: boolean;
  runs: ReportRun[];
  testCase: ReportCase | undefined;
  onClose: () => void;
  onTabChange: (tab: DetailTab) => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || !testCase) {
    return null;
  }

  const run = runs.find((candidate) => candidate.id === testCase.runId);
  const harnessRun = testCase.harness?.run;

  return (
    <>
      <button
        className="fixed inset-0 z-40 bg-ink/20"
        type="button"
        aria-label="Close case details"
        onClick={onClose}
      />
      <dialog
        className="fixed inset-y-0 left-auto right-0 z-50 m-0 flex h-screen max-h-none w-full max-w-none flex-col overflow-hidden border-0 border-l border-line bg-panel p-0 text-ink shadow-2xl backdrop:bg-transparent sm:w-[96vw] xl:w-[84vw] 2xl:w-[80vw]"
        aria-labelledby="case-detail-title"
        open
      >
        <header className="flex min-w-0 items-start justify-between gap-4 border-b border-line-subtle p-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <StatusMark status={testCase.status} />
              <h2
                className="truncate text-lg font-semibold text-ink"
                id="case-detail-title"
              >
                {testCase.displayName}
              </h2>
            </div>
            <p className="mt-2 truncate text-sm text-muted">
              {testCase.displayFile}
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-4">
            <div className="text-right">
              <span className="block text-xs text-muted">Score</span>
              <ScoreValue score={testCase.eval?.avgScore} size="lg" />
            </div>
            <button
              className="h-8 border-b-2 border-transparent px-2 text-sm font-semibold text-muted-strong outline-none hover:border-line hover:text-ink focus:border-selected-line"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </header>

        <FactsGrid>
          <Fact label="Run" value={run?.source ?? testCase.runId} />
          <Fact label="Duration" value={formatDuration(testCase.durationMs)} />
          <Fact label="Harness" value={testCase.harness?.name ?? "n/a"} />
          <Fact label="Location" value={formatLocation(testCase)} />
        </FactsGrid>

        <nav
          className="flex gap-3 border-b border-line-subtle px-4 py-2"
          aria-label="Case detail views"
        >
          {DETAIL_TABS.map((tab) => (
            <TabButton
              key={tab.id}
              selected={detailTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </TabButton>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-hidden">
          {detailTab === "overview" ? (
            <OverviewTab testCase={testCase} run={harnessRun} />
          ) : null}
          {detailTab === "transcript" ? (
            <TranscriptTab run={harnessRun} />
          ) : null}
          {detailTab === "raw" ? <RawTab testCase={testCase} /> : null}
        </div>
      </dialog>
    </>
  );
}

function formatLocation(testCase: ReportCase) {
  if (!testCase.location) {
    return "n/a";
  }
  return `${testCase.location.line}:${testCase.location.column}`;
}
