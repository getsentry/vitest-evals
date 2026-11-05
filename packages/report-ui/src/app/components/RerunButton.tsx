import type { ReportCase } from "@vitest-evals/core";
import { useReportMeta } from "../report-meta";
import { previewRerunCommand } from "../rerun";
import { cx } from "../ui";
import { useRerunActions } from "./RerunSession";

export function RerunButton({
  testCase,
  compact = false,
}: {
  testCase: ReportCase;
  compact?: boolean;
}) {
  const { enabled, requestRerun } = useRerunActions();
  const meta = useReportMeta();
  if (!enabled) {
    return null;
  }
  const command = previewRerunCommand(testCase, meta);

  return (
    <button
      className={cx(
        "shrink-0 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-selected-line",
        compact
          ? "h-7 rounded-md px-1.5 text-[0.7rem] text-muted-strong hover:bg-panel-subtle hover:text-ink"
          : "h-6 rounded px-1.5 text-[0.7rem] text-ink hover:bg-panel-subtle",
      )}
      type="button"
      title={`Re-run this case\n${command}`}
      onClick={(event) => {
        event.stopPropagation();
        requestRerun(testCase);
      }}
    >
      Re-run
    </button>
  );
}
