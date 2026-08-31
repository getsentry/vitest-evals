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
import {
  type HubEvent,
  type RerunJobView,
  formatRerunCommand,
  postCancel,
  postReload,
  postRerun,
  rerunRequest,
} from "../rerun";
import { cx } from "../ui";
import { CopyButton } from "./CopyButton";

type RerunSessionValue = {
  jobs: RerunJobView[];
  requestRerun: (testCase: ReportCase) => void;
};

const RerunSessionContext = createContext<RerunSessionValue>({
  jobs: [],
  requestRerun: () => undefined,
});

export function useRerunSession(): RerunSessionValue {
  return useContext(RerunSessionContext);
}

export function RerunSessionProvider({
  children,
  onDump,
}: {
  children: ReactNode;
  onDump: () => void;
}) {
  const [jobs, setJobs] = useState<RerunJobView[]>([]);
  const [pending, setPending] = useState<ReportCase>();

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (message) => {
      let event: HubEvent;
      try {
        event = JSON.parse(message.data) as HubEvent;
      } catch {
        return;
      }
      if (event.type === "hello") {
        setJobs(event.jobs);
        return;
      }
      if (event.type === "job") {
        setJobs((current) => upsertJob(current, event.job));
        return;
      }
      if (event.type === "log") {
        setJobs((current) =>
          current.map((job) =>
            job.id === event.jobId
              ? { ...job, log: `${job.log}${event.chunk}` }
              : job,
          ),
        );
        return;
      }
      if (event.type === "dump") {
        onDump();
      }
    };
    return () => source.close();
  }, [onDump]);

  const requestRerun = useCallback((testCase: ReportCase) => {
    setPending(testCase);
  }, []);

  const value = useMemo(() => ({ jobs, requestRerun }), [jobs, requestRerun]);

  return (
    <RerunSessionContext.Provider value={value}>
      {children}
      {pending ? (
        <RerunConfirm
          testCase={pending}
          onCancel={() => setPending(undefined)}
          onConfirm={async () => {
            const testCase = pending;
            setPending(undefined);
            const result = await postRerun(testCase);
            if (result.job) {
              setJobs((current) => upsertJob(current, result.job!));
            } else if (!result.ok) {
              setJobs((current) => [
                {
                  id: `local-${Date.now()}`,
                  title: testCase.displayName,
                  command: formatRerunCommand(rerunRequest(testCase)),
                  status: "err",
                  log: "",
                  error: result.error ?? "Re-run failed",
                },
                ...current,
              ]);
            }
          }}
        />
      ) : null}
      <TaskTray
        jobs={jobs}
        onCancel={async (jobId) => {
          const result = await postCancel(jobId);
          if (result.job) {
            setJobs((current) => upsertJob(current, result.job!));
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
      />
    </RerunSessionContext.Provider>
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
  const command = formatRerunCommand(rerunRequest(testCase));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }
    const onDialogCancel = (event: Event) => {
      event.preventDefault();
      onCancel();
    };
    dialog.addEventListener("cancel", onDialogCancel);
    return () => {
      dialog.removeEventListener("cancel", onDialogCancel);
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
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
        <pre className="max-h-20 min-w-0 flex-1 overflow-auto p-1.5 font-mono text-[0.68rem] leading-snug text-muted-strong">
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
  onCancel,
  onClearDone,
  onReload,
}: {
  jobs: RerunJobView[];
  onCancel: (jobId: string) => void;
  onClearDone: () => void;
  onReload: () => void;
}) {
  const trayRef = useRef<HTMLElement | null>(null);
  const [openId, setOpenId] = useState<string>();
  const [dismissed, setDismissed] = useState(false);
  const running = jobs.filter((job) => job.status === "running").length;
  const doneCount = jobs.length - running;

  useEffect(() => {
    if (running > 0) {
      setDismissed(false);
    }
  }, [running]);

  useEffect(() => {
    const tray = trayRef.current;
    if (!tray || jobs.length === 0 || !("showPopover" in tray)) {
      return;
    }
    if (dismissed || !dismissed) {
      try {
        tray.showPopover();
      } catch {
        // Already open, or the browser rejected a duplicate show.
      }
    }
  }, [dismissed, jobs.length]);

  if (jobs.length === 0) {
    return null;
  }

  if (dismissed) {
    return (
      <button
        ref={(node) => {
          trayRef.current = node;
        }}
        className="fixed right-3 bottom-3 z-[80] rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink shadow-2xl"
        type="button"
        popover="manual"
        aria-label="Show re-run tasks"
        onClick={() => setDismissed(false)}
      >
        Tasks
        <span className="ml-2 font-normal text-muted">
          {running > 0 ? `${running} running` : `${jobs.length} done`}
        </span>
      </button>
    );
  }

  const expanded = openId ?? jobs.find((job) => job.status === "running")?.id;
  return (
    <aside
      ref={(node) => {
        trayRef.current = node;
      }}
      className="fixed right-3 bottom-3 z-[80] w-[min(28rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
      popover="manual"
      aria-label="Re-run tasks"
    >
      <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
        <div className="min-w-0 flex-1 text-xs font-semibold text-ink">
          Tasks
          <span className="ml-2 font-normal text-muted">{running} running</span>
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
      <ul className="max-h-[min(22rem,45vh)] overflow-auto">
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
                  <span
                    className={cx(
                      "size-2 shrink-0 rounded-full",
                      job.status === "running" && "bg-warn",
                      job.status === "ok" && "bg-pass",
                      job.status === "err" && "bg-fail",
                      job.status === "cancelled" && "bg-muted",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                    {job.title}
                  </span>
                  <span className="shrink-0 text-[0.68rem] text-muted">
                    {jobStatusLabel(job.status)}
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
              {open ? <JobLog job={job} /> : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function JobLog({ job }: { job: RerunJobView }) {
  const logRef = useRef<HTMLPreElement>(null);
  const pinRef = useRef(true);

  const logText = job.log;
  useEffect(() => {
    const log = logRef.current;
    if (log && pinRef.current && logText.length >= 0) {
      log.scrollTop = log.scrollHeight;
    }
  }, [logText]);

  return (
    <div className="bg-panel-subtle">
      {job.status !== "running" ? (
        <p className="px-3 pt-2 text-[0.68rem] text-muted">
          Dump may still be writing.{" "}
          <span className="font-semibold text-muted-strong">Reload</span> in the
          tray if the ledger looks stale.
        </p>
      ) : null}
      <pre
        ref={logRef}
        className="max-h-40 overflow-auto px-3 py-2 font-mono text-[0.68rem] leading-snug text-muted-strong whitespace-pre-wrap"
        onScroll={() => {
          const log = logRef.current;
          if (!log) {
            return;
          }
          pinRef.current =
            log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        }}
      >
        {job.log || job.error || "Waiting for vitest output…"}
      </pre>
    </div>
  );
}

function jobStatusLabel(status: RerunJobView["status"]) {
  if (status === "running") {
    return "Running";
  }
  if (status === "ok") {
    return "Done";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  return "Failed";
}
