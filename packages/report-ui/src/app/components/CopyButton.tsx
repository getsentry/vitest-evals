import { useEffect, useState } from "react";
import { cx } from "../ui";

export function CopyButton({
  label = "Copy",
  text,
}: {
  label?: string;
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
        "h-8 rounded-md border border-line-subtle px-2.5 text-xs font-semibold outline-none",
        copied
          ? "border-pass-line bg-selected text-pass"
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
