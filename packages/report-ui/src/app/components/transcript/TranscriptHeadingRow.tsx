import type { ReactNode } from "react";
import { cx } from "../../ui";

export function TranscriptHeadingRow({
  className,
  left,
  leftClassName,
  right,
  rightClassName,
  wrapLeft,
}: {
  className?: string;
  left: ReactNode;
  leftClassName?: string;
  right?: ReactNode;
  rightClassName?: string;
  wrapLeft?: boolean;
}) {
  const hasRight = right !== undefined && right !== null && right !== false;

  return (
    <div
      className={cx(
        "flex min-w-0 items-center justify-between gap-3",
        className,
      )}
    >
      <div
        className={cx(
          "flex min-w-0 items-center gap-2",
          wrapLeft ? "flex-wrap overflow-visible" : "overflow-hidden",
          leftClassName,
        )}
      >
        {left}
      </div>
      {hasRight ? (
        <div className={cx("shrink-0 text-right", rightClassName)}>{right}</div>
      ) : null}
    </div>
  );
}

export function TranscriptHeadingMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("font-mono leading-none", className)}>{children}</span>
  );
}
