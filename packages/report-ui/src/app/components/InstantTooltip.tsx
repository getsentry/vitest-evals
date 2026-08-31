import { type ReactNode, useState } from "react";

export function InstantTooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  const [anchor, setAnchor] = useState<DOMRect | undefined>();

  return (
    <span
      className="inline-flex"
      onMouseEnter={(event) =>
        setAnchor(event.currentTarget.getBoundingClientRect())
      }
      onMouseLeave={() => setAnchor(undefined)}
    >
      {children}
      {anchor ? (
        <span
          className="pointer-events-none fixed z-[80] whitespace-nowrap rounded-md border border-line bg-ink px-2 py-1 text-xs font-medium text-panel shadow-lg"
          style={{
            left: anchor.left + anchor.width / 2,
            top: anchor.top - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
