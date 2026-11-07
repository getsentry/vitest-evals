import { relativeDisplayPath, resolveOpenPath } from "../display-path";
import { useReportMeta } from "../report-meta";
import { FileOpenMenu } from "./FileOpenMenu";

export function PathLabel({
  path,
  file,
  line,
  column,
  className,
}: {
  path: string | undefined;
  file?: string;
  line?: number;
  column?: number;
  className?: string;
}) {
  const { workspaceRoot } = useReportMeta();
  const display = relativeDisplayPath(path, workspaceRoot);
  const openFile = resolveOpenPath(file ?? path, workspaceRoot);

  if (!display) {
    return <span className={className}>n/a</span>;
  }

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <span className={className ?? "min-w-0 truncate"}>{display}</span>
      {openFile ? (
        <FileOpenMenu column={column} file={openFile} line={line} />
      ) : null}
    </span>
  );
}
