import { type ReactNode, useState } from "react";

const TOOLTIP_PAD = 8;
const TOOLTIP_MAX_WIDTH = 360;
const TOOLTIP_ESTIMATED_HEIGHT = 40;

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
      {anchor ? <TooltipBubble anchor={anchor} content={content} /> : null}
    </span>
  );
}

function TooltipBubble({
  anchor,
  content,
}: {
  anchor: DOMRect;
  content: ReactNode;
}) {
  const maxWidth = Math.min(
    TOOLTIP_MAX_WIDTH,
    window.innerWidth - TOOLTIP_PAD * 2,
  );
  const center = anchor.left + anchor.width / 2;
  const left = Math.min(
    Math.max(center, TOOLTIP_PAD + maxWidth / 2),
    window.innerWidth - TOOLTIP_PAD - maxWidth / 2,
  );
  const fitsAbove = anchor.top - TOOLTIP_ESTIMATED_HEIGHT - TOOLTIP_PAD >= 0;
  const top = fitsAbove
    ? anchor.top - TOOLTIP_PAD
    : anchor.bottom + TOOLTIP_PAD;
  return (
    <span
      className="pointer-events-none fixed z-[80] max-w-[min(360px,calc(100vw-16px))] whitespace-normal rounded-md border border-line bg-ink px-2 py-1 text-xs font-medium text-panel shadow-lg"
      style={{
        left,
        top,
        transform: fitsAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
    >
      {content}
    </span>
  );
}
