import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";
import { formatJson } from "../model";
import { CodeBlock, EmptyState, cx } from "../ui";
import { CopyButton } from "./CopyButton";

export function JsonInspector({
  value,
  mode,
  onModeChange,
}: {
  value: unknown;
  mode: "tree" | "text";
  onModeChange: (mode: "tree" | "text") => void;
}) {
  if (value === undefined || value === "") {
    return <EmptyState>n/a</EmptyState>;
  }

  const text = formatJson(value);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="inline-flex rounded-md border border-line-subtle p-0.5">
          <ModeButton
            selected={mode === "tree"}
            onClick={() => onModeChange("tree")}
          >
            Inspector
          </ModeButton>
          <ModeButton
            selected={mode === "text"}
            onClick={() => onModeChange("text")}
          >
            Text
          </ModeButton>
        </div>
        <CopyButton label="Copy JSON" text={text} />
      </div>
      {mode === "tree" ? (
        <div className="overflow-auto rounded-md border border-line-subtle bg-panel-subtle p-3 font-mono text-xs leading-relaxed">
          <JsonView
            collapsed={1}
            displaySize
            enableClipboard
            src={value as object}
          />
        </div>
      ) : (
        <CodeBlock value={text} />
      )}
    </div>
  );
}

function ModeButton({
  children,
  selected,
  onClick,
}: {
  children: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        "h-7 rounded-[5px] px-2.5 text-xs font-semibold outline-none",
        selected ? "bg-ink text-panel" : "text-muted-strong hover:text-ink",
        "focus-visible:ring-2 focus-visible:ring-selected-line",
      )}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
