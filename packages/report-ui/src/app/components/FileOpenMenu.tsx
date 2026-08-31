import { useEffect, useId, useRef, useState } from "react";
import { type OpenFileTarget, editorTargets } from "../file-open";
import { cx } from "../ui";

export function FileOpenMenu({ file, line, column }: OpenFileTarget) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        className={cx(
          "grid size-7 place-items-center rounded-md border border-transparent text-muted-strong outline-none",
          "hover:border-line-subtle hover:text-ink",
          "focus-visible:border-selected-line focus-visible:ring-2 focus-visible:ring-selected",
          open && "border-line-subtle text-ink",
        )}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        aria-label="Open file in editor"
        title="Open file in editor"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <ExternalLinkIcon />
      </button>
      {open ? (
        <div
          className="absolute left-0 z-20 mt-1 min-w-52 rounded-md border border-line bg-panel py-1 shadow-lg"
          id={menuId}
          role="menu"
        >
          {editorTargets({ column, file, line }).map((target) => (
            <a
              className="block px-3 py-1.5 text-sm text-ink outline-none hover:bg-selected focus-visible:bg-selected"
              href={target.href}
              key={target.id}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {target.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8A1.5 1.5 0 0 0 13 12.5V10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M8 8 14 2m0 0H10m4 0v4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}
