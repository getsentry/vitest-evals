import type { ReportCase } from "@vitest-evals/core";
import { formatRerunCommand, rerunRequest } from "../rerun";
import { cx } from "../ui";
import { useRerunSession } from "./RerunSession";

export function RerunButton({
  testCase,
  compact = false,
}: {
  testCase: ReportCase;
  compact?: boolean;
}) {
  const { requestRerun } = useRerunSession();
  const command = formatRerunCommand(rerunRequest(testCase));

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
