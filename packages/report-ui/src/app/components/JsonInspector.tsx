import { useState } from "react";
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
  mode?: "tree" | "text";
  onModeChange?: (mode: "tree" | "text") => void;
}) {
  const [localMode, setLocalMode] = useState<"tree" | "text">("tree");
  const currentMode = mode ?? localMode;
  const setMode = onModeChange ?? setLocalMode;
  if (value === undefined || value === "") {
    return <EmptyState>n/a</EmptyState>;
  }

  if (isShortScalar(value)) {
    const text = typeof value === "string" ? value : formatJson(value);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 break-words font-mono text-sm text-ink">
          {typeof value === "string" ? value : String(value)}
        </code>
        <CopyButton label="Copy" size="compact" text={text} />
      </div>
    );
  }

  const text = formatJson(value);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="inline-flex rounded-md border border-line-subtle p-0.5">
          <ModeButton
            selected={currentMode === "tree"}
            onClick={() => setMode("tree")}
          >
            Inspector
          </ModeButton>
          <ModeButton
            selected={currentMode === "text"}
            onClick={() => setMode("text")}
          >
            Text
          </ModeButton>
        </div>
        <CopyButton label="JSON" size="compact" text={text} />
      </div>
      {currentMode === "tree" ? (
        <div className="overflow-auto rounded-md border border-line-subtle bg-panel-subtle p-3 font-mono text-xs leading-relaxed">
          <JsonView collapsed={3} displaySize src={value as object} />
        </div>
      ) : (
        <CodeBlock value={text} />
      )}
    </div>
  );
}

function isShortScalar(value: unknown) {
  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  return (
    typeof value === "string" && value.length <= 80 && !value.includes("\n")
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
