import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "../ui";

export type PaletteCommand = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
};

export function CommandPalette({
  commands,
  open,
  onClose,
}: {
  commands: PaletteCommand[];
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return commands;
    }
    return commands.filter((command) =>
      `${command.group} ${command.label} ${command.hint ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    // A modal <dialog> stacks above the open case drawer (also a modal
    // dialog), traps focus, and restores it on close.
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    inputRef.current?.focus();
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const runActive = () => {
    const command = matches[active];
    if (!command) {
      return;
    }
    command.run();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-panel p-0 text-ink shadow-2xl backdrop:bg-ink/30"
      aria-label="Command palette"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Clicks on the backdrop land on the dialog element itself.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActive((index) =>
            matches.length === 0 ? 0 : (index + 1) % matches.length,
          );
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActive((index) =>
            matches.length === 0
              ? 0
              : (index - 1 + matches.length) % matches.length,
          );
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          runActive();
        }
      }}
    >
      <input
        ref={inputRef}
        className="h-12 w-full border-b border-line-subtle bg-panel px-4 text-sm text-ink outline-none placeholder:text-muted"
        placeholder="Filter cases, jump, copy, export…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
      />
      <ul className="max-h-[min(24rem,50vh)] overflow-auto py-1">
        {matches.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted">No matching commands</li>
        ) : (
          matches.map((command, index) => (
            <li key={command.id}>
              <button
                className={cx(
                  "flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left text-sm outline-none",
                  index === active
                    ? "bg-selected text-ink"
                    : "text-ink hover:bg-panel-subtle",
                )}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  command.run();
                  onClose();
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {command.label}
                  </span>
                  <span className="block truncate text-[0.7rem] text-muted">
                    {command.group}
                    {command.hint ? ` · ${command.hint}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </dialog>
  );
}

/** Triggers a browser download for a generated text artifact. */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = "text/plain",
) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
