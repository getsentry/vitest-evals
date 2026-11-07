import type { ReportCase } from "@vitest-evals/core";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useReportMeta } from "../report-meta";
import {
  type HubEvent,
  type RerunJobView,
  formatElapsed,
  jobElapsedMs,
  postCancel,
  postReload,
  postRerun,
  previewRerunCommand,
  trimRerunLog,
} from "../rerun";
import { cx } from "../ui";
import { formatVitestLog } from "../vitest-log";
import { CopyButton } from "./CopyButton";

type RerunActions = {
  /** False when the server refuses re-runs (non-loopback or no workspace). */
  enabled: boolean;
  requestRerun: (testCase: ReportCase) => void;
  /**
   * Renders the task tray inside this element while it is set. The case
   * drawer is a modal dialog, so a tray outside it would be inert.
   */
  setTrayHost: (host: HTMLElement | null) => void;
};

const RerunActionsContext = createContext<RerunActions>({
  enabled: false,
  requestRerun: () => undefined,
  setTrayHost: () => undefined,
});

const RerunJobsContext = createContext<RerunJobView[]>([]);

/** Stable re-run actions; reading them never re-renders on job updates. */
export function useRerunActions(): RerunActions {
  return useContext(RerunActionsContext);
}

/** Current re-run jobs, without their logs. Changes when a job changes. */
export function useRerunJobs(): RerunJobView[] {
  return useContext(RerunJobsContext);
}

/** Wall clock that ticks every 500ms while `active` is true. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Live elapsed time for one job. Only this text re-renders each tick. */
export function JobElapsed({ job }: { job: RerunJobView }) {
  const now = useNow(job.status === "running");
  return <>{formatElapsed(jobElapsedMs(job, now))}</>;
}

export function RerunSessionProvider({
  children,
  onDump,
}: {
  children: ReactNode;
  onDump: () => void;
}) {
  const meta = useReportMeta();
  const enabled = meta.rerunEnabled === true;
  const [jobs, setJobs] = useState<RerunJobView[]>([]);
  // Logs live apart from jobs so streaming output re-renders only the tray.
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<ReportCase>();
  const [trayHost, setTrayHost] = useState<HTMLElement | null>(null);

  const applyJob = useCallback((job: RerunJobView) => {
    setJobs((current) => upsertJob(current, { ...job, log: "" }));
    if (job.log) {
      setLogs((current) => ({ ...current, [job.id]: job.log }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const source = new EventSource("/api/events");
    source.onmessage = (message) => {
      let event: HubEvent;
      try {
        event = JSON.parse(message.data) as HubEvent;
      } catch {
        return;
      }
      if (event.type === "hello") {
        setJobs(event.jobs.map((job) => ({ ...job, log: "" })));
        setLogs(Object.fromEntries(event.jobs.map((job) => [job.id, job.log])));
        return;
      }
      if (event.type === "job") {
        applyJob(event.job);
        return;
      }
      if (event.type === "log") {
        setLogs((current) => ({
          ...current,
          [event.jobId]: trimRerunLog(
            `${current[event.jobId] ?? ""}${event.chunk}`,
          ),
        }));
        return;
      }
      if (event.type === "dump") {
        onDump();
      }
    };
    return () => source.close();
  }, [applyJob, enabled, onDump]);

  const requestRerun = useCallback((testCase: ReportCase) => {
    setPending(testCase);
  }, []);
  const cancelPending = useCallback(() => setPending(undefined), []);

  const actions = useMemo(
    () => ({ enabled, requestRerun, setTrayHost }),
    [enabled, requestRerun],
  );

  const confirmPending = async () => {
    const testCase = pending;
    setPending(undefined);
    if (!testCase) {
      return;
    }
    const result = await postRerun(testCase);
    if (result.job) {
      applyJob(result.job);
    }
    if (!result.ok && !result.job) {
      const failedAt = Date.now();
      applyJob({
        id: `local-${failedAt}`,
        caseId: testCase.id,
        title: testCase.displayName,
        command: previewRerunCommand(testCase, meta),
        status: "err",
        log: "",
        startedAt: failedAt,
        endedAt: failedAt,
        error: result.error,
      });
    }
  };

  return (
    <RerunActionsContext.Provider value={actions}>
      <RerunJobsContext.Provider value={jobs}>
        {children}
        {pending ? (
          <RerunConfirm
            testCase={pending}
            onCancel={cancelPending}
            onConfirm={() => void confirmPending()}
          />
        ) : null}
        {jobs.length > 0
          ? createPortal(
              <TaskTray
                // Remount when the host moves so the popover re-opens on top.
                key={trayHost ? "drawer" : "page"}
                jobs={jobs}
                logs={logs}
                onCancel={async (jobId) => {
                  const result = await postCancel(jobId);
                  if (result.job) {
                    applyJob(result.job);
                  }
                }}
                onClearDone={() => {
                  setJobs((current) =>
                    current.filter((job) => job.status === "running"),
                  );
                }}
                onReload={() => {
                  void postReload();
                }}
              />,
              trayHost ?? document.body,
            )
          : null}
      </RerunJobsContext.Provider>
    </RerunActionsContext.Provider>
  );
}

function upsertJob(jobs: RerunJobView[], next: RerunJobView) {
  const index = jobs.findIndex((job) => job.id === next.id);
  if (index < 0) {
    return [next, ...jobs];
  }
  return jobs.map((job, jobIndex) => (jobIndex === index ? next : job));
}

function RerunConfirm({
  testCase,
  onCancel,
  onConfirm,
}: {
  testCase: ReportCase;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const command = previewRerunCommand(testCase, useReportMeta());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-panel p-4 text-ink shadow-2xl backdrop:bg-ink/30"
      aria-labelledby="rerun-confirm-title"
    >
      <h2 className="text-sm font-semibold text-ink" id="rerun-confirm-title">
        Re-run this case?
      </h2>
      <p className="mt-2 text-sm leading-snug text-muted">
        Starts a local <code className="font-mono text-ink">vitest</code> run
        for{" "}
        <strong className="font-semibold text-ink">
          {testCase.displayName}
        </strong>
        . It can take minutes and spends model tokens / money. The ledger
        reloads when this re-run finishes.
      </p>
      <div className="mt-3 flex items-start gap-1 rounded-md bg-panel-subtle p-1">
        <pre className="max-h-20 min-w-0 flex-1 overflow-auto p-1.5 font-mono text-[0.68rem] leading-snug break-all whitespace-pre-wrap text-muted-strong">
          {command}
        </pre>
        <CopyButton icon label="Copy command" text={command} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          className="h-8 rounded-md px-2.5 text-xs font-semibold text-muted-strong outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-selected-line"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="h-8 rounded-md border border-ink bg-panel px-2.5 text-xs font-semibold text-ink outline-none hover:bg-panel-subtle focus-visible:ring-2 focus-visible:ring-selected-line"
          type="button"
          onClick={onConfirm}
        >
          Re-run
        </button>
      </div>
    </dialog>
  );
}

function TaskTray({
  jobs,
  logs,
  onCancel,
  onClearDone,
  onReload,
}: {
  jobs: RerunJobView[];
  logs: Record<string, string>;
  onCancel: (jobId: string) => void;
  onClearDone: () => void;
  onReload: () => void;
}) {
  const [openId, setOpenId] = useState<string>();
  const [dismissed, setDismissed] = useState(false);
  const runningJobs = jobs.filter((job) => job.status === "running");
  const running = runningJobs.length;
  const now = useNow(running > 0);
  const doneCount = jobs.length - running;
  const runningElapsed =
    runningJobs.length === 0
      ? undefined
      : formatElapsed(
          Math.max(...runningJobs.map((job) => jobElapsedMs(job, now))),
        );

  useEffect(() => {
    if (running > 0) {
      setDismissed(false);
    }
  }, [running]);

  if (dismissed) {
    return (
      <button
        ref={showAsPopover}
        className="fixed !right-3 !bottom-3 z-[80] !top-auto !left-auto !m-0 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink shadow-2xl"
        type="button"
        popover="manual"
        aria-label="Show re-run tasks"
        onClick={() => setDismissed(false)}
      >
        Tasks
        <span className="ml-2 inline-flex items-center gap-1.5 font-normal text-muted">
          {running > 0 && runningElapsed ? (
            <>
              <TaskSpinner className="text-warn" />
              {runningElapsed}
            </>
          ) : (
            `${jobs.length} done`
          )}
        </span>
      </button>
    );
  }

  const expanded = openId ?? jobs.find((job) => job.status === "running")?.id;
  return (
    <aside
      ref={showAsPopover}
      className="fixed !top-auto !right-3 !bottom-3 !left-auto z-[80] !m-0 !max-w-[min(28rem,calc(100vw-1.5rem))] !w-[min(28rem,calc(100vw-1.5rem))] !overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
      popover="manual"
      aria-label="Re-run tasks"
    >
      <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
        <div className="min-w-0 flex-1 text-xs font-semibold text-ink">
          Tasks
          <span className="ml-2 inline-flex items-center gap-1.5 font-normal text-muted">
            {running > 0 && runningElapsed ? (
              <>
                <TaskSpinner className="text-warn" />
                {running} · {runningElapsed}
              </>
            ) : (
              `${running} running`
            )}
          </span>
        </div>
        <button
          className="h-6 rounded px-1.5 text-[0.7rem] font-semibold text-muted-strong hover:bg-panel-subtle hover:text-ink"
          type="button"
          onClick={onReload}
        >
          Reload
        </button>
        <button
          className="h-6 rounded px-1.5 text-[0.7rem] font-semibold text-muted-strong hover:bg-panel-subtle hover:text-ink disabled:opacity-40"
          type="button"
          disabled={doneCount === 0}
          onClick={onClearDone}
        >
          Clear done
        </button>
        <button
          className="h-6 rounded px-1.5 text-[0.7rem] font-semibold text-muted-strong hover:bg-panel-subtle hover:text-ink"
          type="button"
          aria-label="Dismiss task tray"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
      <ul className="max-h-[min(22rem,45vh)] min-w-0 overflow-x-hidden overflow-y-auto">
        {jobs.map((job) => {
          const open = expanded === job.id;
          return (
            <li
              className="border-b border-line-subtle last:border-b-0"
              key={job.id}
            >
              <div className="flex items-center gap-1 pr-2">
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left outline-none hover:bg-panel-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-selected-line"
                  type="button"
                  onClick={() => setOpenId(open ? "" : job.id)}
                >
                  {job.status === "running" ? (
                    <TaskSpinner className="text-warn" />
                  ) : (
                    <span
                      className={cx(
                        "size-2 shrink-0 rounded-full",
                        job.status === "ok" && "bg-pass",
                        job.status === "err" && "bg-fail",
                        job.status === "cancelled" && "bg-muted",
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                    {job.title}
                  </span>
                  <span className="shrink-0 text-[0.68rem] text-muted">
                    {jobClock(job, now)}
                  </span>
                </button>
                {job.status === "running" ? (
                  <button
                    className="h-6 shrink-0 rounded px-1.5 text-[0.7rem] font-semibold text-fail hover:bg-panel-subtle"
                    type="button"
                    onClick={() => onCancel(job.id)}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              {open ? <JobLog job={job} log={logs[job.id] ?? ""} /> : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** Opens a `popover="manual"` element in the top layer once it mounts. */
function showAsPopover(node: HTMLElement | null) {
  if (node && "showPopover" in node && !node.matches(":popover-open")) {
    node.showPopover();
  }
}

function JobLog({ job, log }: { job: RerunJobView; log: string }) {
  const logRef = useRef<HTMLPreElement>(null);
  const pinRef = useRef(true);
  const logText = formatVitestLog(log) || job.error || "";

  // Runs after every render so new output stays pinned to the bottom.
  useEffect(() => {
    const element = logRef.current;
    if (element && pinRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  });

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 border-t border-line-subtle bg-panel-subtle px-2 py-1">
        <CopyButton label="Command" size="compact" text={job.command} />
        <CopyButton
          label="Logs"
          size="compact"
          text={logText || "Waiting for vitest output…"}
        />
      </div>
      <pre
        ref={logRef}
        className="max-h-56 min-w-0 overflow-auto bg-ink px-3 py-2 font-mono text-[0.72rem] leading-relaxed break-words whitespace-pre-wrap text-panel"
        onScroll={() => {
          const log = logRef.current;
          if (!log) {
            return;
          }
          pinRef.current =
            log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        }}
      >
        {logText || "Waiting for vitest output…"}
      </pre>
    </div>
  );
}

function jobClock(job: RerunJobView, now: number): string {
  const elapsed = formatElapsed(jobElapsedMs(job, now));
  if (job.status === "running") {
    return elapsed;
  }
  if (job.status === "ok") {
    return `Done · ${elapsed}`;
  }
  if (job.status === "cancelled") {
    return `Cancelled · ${elapsed}`;
  }
  return `Failed · ${elapsed}`;
}

export function TaskSpinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden="true"
    />
  );
}
