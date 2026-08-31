import { useEffect, useState } from "react";
import { cx } from "../ui";

export function CopyButton({
  emphasis = "secondary",
  icon = false,
  label = "Copy",
  size = "md",
  text,
}: {
  emphasis?: "primary" | "secondary";
  icon?: boolean;
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
        icon
          ? "grid size-7 place-items-center rounded text-muted-strong hover:bg-panel hover:text-ink"
          : size === "compact"
            ? "h-6 rounded px-1.5 text-[0.7rem] font-semibold"
            : "h-8 rounded-md border border-line-subtle px-2.5 text-xs font-semibold",
        !icon &&
          (copied
            ? size === "compact"
              ? "text-pass"
              : "border-pass-line bg-selected text-pass"
            : size === "compact"
              ? emphasis === "primary"
                ? "text-ink hover:bg-panel-subtle"
                : "text-muted-strong hover:bg-panel-subtle hover:text-ink"
              : emphasis === "primary"
                ? "border-ink bg-panel text-ink hover:bg-panel-subtle"
                : "bg-panel text-muted-strong hover:border-line hover:text-ink"),
        copied && icon && "text-pass",
        "focus-visible:border-selected-line focus-visible:ring-2 focus-visible:ring-selected",
      )}
      type="button"
      aria-label={icon ? (copied ? "Copied" : label) : undefined}
      title={icon ? (copied ? "Copied" : label) : undefined}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {icon ? (
        copied ? (
          <CheckIcon />
        ) : (
          <ClipboardIcon />
        )
      ) : copied ? (
        "Copied!"
      ) : (
        label
      )}
    </button>
  );
}

function ClipboardIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      viewBox="0 0 16 16"
    >
      <rect
        height="9"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
        width="8"
        x="5"
        y="4"
      />
      <path
        d="M4 11.5V3.2A1.2 1.2 0 0 1 5.2 2H10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
