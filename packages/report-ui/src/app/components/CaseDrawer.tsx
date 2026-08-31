import type { ReportCase, ReportRun } from "@vitest-evals/core";
import { useEffect, useRef } from "react";
import { caseToMarkdown } from "../case-markdown";
import { caseHasCompare } from "../compare";
import { relativeDisplayPath } from "../display-path";
import { judgeTally } from "../judge-score";
import { caseModel, caseScoreTone, formatDuration, formatJson } from "../model";
import { estimateUsageCost, formatUsd } from "../pricing";
import { useReportMeta } from "../report-meta";
import { suggestBetterModel } from "../suggest-model";
import type { DetailTab } from "../types";
import { TabButton } from "../ui";
import { CompareTab } from "./CompareTab";
import { CopyButton } from "./CopyButton";
import { CostHelp } from "./CostHelp";
import { ModelHint } from "./ModelHint";
import { OverviewTab } from "./OverviewTab";
import { PathLabel } from "./PathLabel";
import { RawTab } from "./RawTab";
import { ScoreValue, StatusMark } from "./ReportPrimitives";
import { RerunButton } from "./RerunButton";
import { TranscriptTab } from "./TranscriptTab";

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "transcript", label: "Transcript" },
  { id: "compare", label: "Compare" },
  { id: "raw", label: "Raw" },
];

export function CaseDrawer({
  baselineCases,
  cases,
  detailTab,
  filtersActive,
  open,
  runs,
  testCase,
  onClose,
  onNext,
  onPrev,
  onResetFilters,
  onTabChange,
}: {
  baselineCases: ReportCase[];
  cases: ReportCase[];
  detailTab: DetailTab;
  filtersActive: boolean;
  open: boolean;
  runs: ReportRun[];
  testCase: ReportCase | undefined;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onResetFilters: () => void;
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

  const { pricing, workspaceRoot } = useReportMeta();
  const run = runs.find((candidate) => candidate.id === testCase.runId);
  const harnessRun = testCase.harness?.run;
  const model = caseModel(testCase);
  const usageCost = estimateUsageCost(harnessRun?.usage ?? {}, pricing);
  const failureText = testCase.failureMessages.join("\n\n");
  const suggestion = suggestBetterModel(model, pricing);
  const canCompare = caseHasCompare(testCase, cases, baselineCases);
  const activeTab =
    detailTab === "compare" && !canCompare ? "overview" : detailTab;

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
      <section className="absolute inset-y-0 right-0 z-10 flex h-screen w-full max-w-none flex-col overflow-hidden border-l border-line bg-panel shadow-2xl sm:w-[40rem] xl:w-[48rem]">
        <header className="border-b border-line-subtle bg-panel">
          <div className="flex items-start gap-3 px-5 pt-4">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <StatusMark showLabel={false} status={testCase.status} />
                <h2
                  className="line-clamp-2 text-xl font-semibold leading-tight text-ink"
                  id="case-detail-title"
                  title={testCase.displayName}
                >
                  {testCase.displayName}
                </h2>
              </div>
              <div className="mt-1 min-w-0 text-sm leading-snug text-muted">
                <PathLabel file={testCase.file} path={testCase.displayFile} />
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-x-4 sm:flex">
              {model ? (
                <div className="min-w-0 max-w-[11rem]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="shrink-0 text-[0.68rem] font-semibold uppercase text-muted">
                      Model
                    </span>
                    <span className="truncate font-mono text-xs font-semibold text-ink">
                      {model}
                    </span>
                  </div>
                  {suggestion ? <ModelHint suggestion={suggestion} /> : null}
                </div>
              ) : null}
              {usageCost ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[0.68rem] font-semibold uppercase text-muted">
                    Cost
                  </span>
                  <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                    {formatUsd(usageCost.totalUsd)}
                  </span>
                  <CostHelp align="right" cost={usageCost} pricing={pricing} />
                </div>
              ) : null}
              <div className="flex items-baseline gap-1.5">
                <span className="text-[0.68rem] font-semibold uppercase text-muted">
                  Score
                </span>
                <ScoreValue
                  score={testCase.eval?.avgScore}
                  tally={judgeTally(testCase)}
                  tone={caseScoreTone(testCase)}
                />
              </div>
            </div>
            <button
              className="grid size-8 shrink-0 place-items-center border border-transparent text-xs font-semibold text-muted-strong outline-none hover:border-line-subtle hover:text-ink focus-visible:border-selected-line focus-visible:ring-2 focus-visible:ring-selected"
              type="button"
              aria-label="Previous case"
              onClick={onPrev}
            >
              k
            </button>
            <button
              className="grid size-8 shrink-0 place-items-center border border-transparent text-xs font-semibold text-muted-strong outline-none hover:border-line-subtle hover:text-ink focus-visible:border-selected-line focus-visible:ring-2 focus-visible:ring-selected"
              type="button"
              aria-label="Next case"
              onClick={onNext}
            >
              j
            </button>
            <button
              className="relative grid size-8 shrink-0 place-items-center border border-transparent text-muted-strong outline-none hover:border-line-subtle hover:text-ink focus-visible:border-selected-line focus-visible:ring-2 focus-visible:ring-selected"
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
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {failureText ? (
                <CopyButton
                  emphasis="primary"
                  label="Failure"
                  size="compact"
                  text={failureText}
                />
              ) : (
                <CopyButton
                  emphasis="primary"
                  label="Markdown"
                  size="compact"
                  text={caseToMarkdown(testCase, run)}
                />
              )}
              {failureText ? (
                <CopyButton
                  label="Markdown"
                  size="compact"
                  text={caseToMarkdown(testCase, run)}
                />
              ) : null}
              <CopyButton
                label="Case JSON"
                size="compact"
                text={formatJson(testCase)}
              />
              <RerunButton testCase={testCase} />
              {filtersActive ? (
                <button
                  className="h-6 rounded px-1.5 text-[0.7rem] font-semibold text-muted-strong outline-none hover:bg-panel-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-selected-line"
                  type="button"
                  onClick={onResetFilters}
                >
                  Reset filters
                </button>
              ) : null}
              <span className="max-w-[14rem] truncate text-xs text-muted">
                {formatDuration(testCase.durationMs)}
                {run
                  ? ` · ${relativeDisplayPath(run.source ?? testCase.runId, workspaceRoot) || run.source || testCase.runId}`
                  : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 text-xs text-muted sm:hidden">
              {model ? (
                <span className="truncate font-mono font-semibold text-ink">
                  {model}
                </span>
              ) : null}
              <ScoreValue
                score={testCase.eval?.avgScore}
                tally={judgeTally(testCase)}
                tone={caseScoreTone(testCase)}
              />
            </div>
          </div>
        </header>

        <nav
          className="flex gap-3 border-b border-line-subtle px-5 py-2"
          aria-label="Case detail views"
        >
          {DETAIL_TABS.filter((tab) => tab.id !== "compare" || canCompare).map(
            (tab) => (
              <TabButton
                key={tab.id}
                selected={activeTab === tab.id}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </TabButton>
            ),
          )}
        </nav>

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "overview" ? (
            <OverviewTab testCase={testCase} run={harnessRun} />
          ) : null}
          {activeTab === "transcript" ? (
            <TranscriptTab run={harnessRun} />
          ) : null}
          {activeTab === "compare" && canCompare ? (
            <CompareTab
              baselineCases={baselineCases}
              cases={cases}
              testCase={testCase}
            />
          ) : null}
          {activeTab === "raw" ? <RawTab testCase={testCase} /> : null}
        </div>
      </section>
    </dialog>
  );
}
