import type { ReportCase } from "@vitest-evals/core";
import { useState } from "react";
import { formatRerunCommand, postRerun, rerunRequest } from "../rerun";
import { cx } from "../ui";

export function RerunButton({
  testCase,
  compact = false,
}: {
  testCase: ReportCase;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "running" | "ok" | "err">("idle");
  const [detail, setDetail] = useState<string>();
  const command = formatRerunCommand(rerunRequest(testCase));

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        className={cx(
          "shrink-0 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-selected-line",
          compact
            ? "h-7 rounded-md px-1.5 text-[0.7rem] text-muted-strong hover:bg-panel-subtle hover:text-ink"
            : "h-6 rounded px-1.5 text-[0.7rem] text-ink hover:bg-panel-subtle",
          state === "err" && "text-fail",
          state === "ok" && "text-pass",
        )}
        type="button"
        disabled={state === "running"}
        title={`${state === "err" ? detail : "Re-run this case"}\n${command}`}
        onClick={async (event) => {
          event.stopPropagation();
          setState("running");
          setDetail(undefined);
          try {
            const result = await postRerun(testCase);
            if (!result.ok) {
              setState("err");
              setDetail(result.error ?? result.stderr ?? "Re-run failed");
              return;
            }
            setState("ok");
            window.location.reload();
          } catch (error) {
            setState("err");
            setDetail(error instanceof Error ? error.message : String(error));
          }
        }}
      >
        {state === "running"
          ? "Running…"
          : state === "ok"
            ? "Re-ran"
            : state === "err"
              ? "Failed"
              : "Re-run"}
      </button>
    </span>
  );
}
