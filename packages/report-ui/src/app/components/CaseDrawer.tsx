import { useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }

    const focusFrame = window.requestAnimationFrame(() => {
      dialog
        ?.querySelector<HTMLElement>("[data-dialog-initial-focus]")
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (dialog?.open) {
        if (typeof dialog.close === "function") {
          dialog.close();
        } else {
          dialog.removeAttribute("open");
        }
      }
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || !testCase) {
    return null;
  }

  const run = runs.find((candidate) => candidate.id === testCase.runId);
  const harnessRun = testCase.harness?.run;

  return (
    <dialog
      className="fixed inset-0 z-50 m-0 h-screen max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-transparent"
      aria-labelledby="case-detail-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <button
        className="absolute inset-0 z-0 bg-ink/20"
        type="button"
        aria-label="Close case details"
        tabIndex={-1}
        onClick={onClose}
      />
      <section className="absolute inset-y-0 right-0 z-10 flex h-screen w-full max-w-none flex-col overflow-hidden border-l border-line bg-panel shadow-2xl sm:w-[96vw] xl:w-[84vw] 2xl:w-[80vw]">
        <header className="border-b border-line-subtle bg-panel">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-4 lg:items-start">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <StatusMark showLabel={false} status={testCase.status} />
                <h2
                  className="truncate text-xl font-semibold leading-tight text-ink"
                  id="case-detail-title"
                >
                  {testCase.displayName}
                </h2>
              </div>
              <p className="mt-2 truncate text-sm leading-snug text-muted">
                {testCase.displayFile}
              </p>
              <div className="mt-3 flex items-baseline gap-2 sm:hidden">
                <span className="text-[0.68rem] font-semibold uppercase text-muted">
                  Score
                </span>
                <ScoreValue score={testCase.eval?.avgScore} size="lg" />
              </div>
            </div>
            <div className="flex min-w-0 shrink-0 items-start justify-end gap-4">
              <div className="hidden min-w-16 text-right sm:block">
                <span className="block text-[0.68rem] font-semibold uppercase text-muted">
                  Score
                </span>
                <ScoreValue score={testCase.eval?.avgScore} size="lg" />
              </div>
              <button
                className="relative grid size-8 place-items-center border border-transparent text-muted-strong outline-none hover:border-line-subtle hover:text-ink focus-visible:border-selected-line focus-visible:ring-2 focus-visible:ring-selected"
                type="button"
                aria-label="Close case details"
                data-dialog-initial-focus
                onClick={onClose}
              >
                <span
                  className="absolute h-px w-3 rotate-45 bg-current"
                  aria-hidden="true"
                />
                <span
                  className="absolute h-px w-3 -rotate-45 bg-current"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </header>

        <FactsGrid columns={2}>
          <Fact label="Run" value={run?.source ?? testCase.runId} />
          <Fact label="Duration" value={formatDuration(testCase.durationMs)} />
        </FactsGrid>

        <nav
          className="flex gap-3 border-b border-line-subtle px-5 py-2"
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
      </section>
    </dialog>
  );
}
