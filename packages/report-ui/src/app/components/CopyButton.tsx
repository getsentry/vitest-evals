import { useEffect, useState } from "react";
import { cx } from "../ui";

export function CopyButton({
  emphasis = "secondary",
  label = "Copy",
  size = "md",
  text,
}: {
  emphasis?: "primary" | "secondary";
  label?: string;
  size?: "md" | "compact";
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      className={cx(
        size === "compact"
          ? "h-6 rounded px-1.5 text-[0.7rem] font-semibold"
          : "h-8 rounded-md border border-line-subtle px-2.5 text-xs font-semibold",
        copied
          ? size === "compact"
            ? "text-pass"
            : "border-pass-line bg-selected text-pass"
          : size === "compact"
            ? emphasis === "primary"
              ? "text-ink hover:bg-panel-subtle"
              : "text-muted-strong hover:bg-panel-subtle hover:text-ink"
            : emphasis === "primary"
              ? "border-ink bg-panel text-ink hover:bg-panel-subtle"
              : "bg-panel text-muted-strong hover:border-line hover:text-ink",
        "focus-visible:border-selected-line focus-visible:ring-2 focus-visible:ring-selected",
      )}
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
