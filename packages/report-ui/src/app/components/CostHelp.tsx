import { useEffect, useId, useRef, useState } from "react";
import { formatNumber } from "../model";
import { type PricingTable, type UsageCost, formatUsd } from "../pricing";
import { cx } from "../ui";

export function CostHelp({
  cost,
  pricing,
  align = "left",
}: {
  cost?: UsageCost;
  pricing: PricingTable;
  align?: "left" | "right";
}) {
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
    <div className="relative inline-flex shrink-0" ref={rootRef}>
      <button
        className={cx(
          "grid size-4 place-items-center rounded-full border border-line-subtle text-[0.62rem] font-semibold leading-none text-muted-strong outline-none",
          "hover:border-line hover:text-ink",
          "focus-visible:border-selected-line focus-visible:ring-2 focus-visible:ring-selected",
          open && "border-line text-ink",
        )}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        aria-label="How estimated cost is computed"
        title="How estimated cost is computed"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        ?
      </button>
      {open ? (
        <div
          className={cx(
            "absolute z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-line bg-panel p-3 text-left font-sans font-normal normal-case shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
          id={menuId}
        >
          <p className="text-xs font-semibold text-ink">Estimated cost</p>
          {cost ? (
            <CostBreakdown cost={cost} />
          ) : (
            <p className="mt-1.5 text-xs leading-snug text-muted">{FORMULA}</p>
          )}
          {cost ? (
            <p className="mt-2 text-[0.7rem] leading-snug text-muted">
              {FORMULA}
            </p>
          ) : null}
          {pricing.source === "fallback" ? (
            <p className="mt-2 text-[0.7rem] text-muted">
              Live catalog unavailable — using bundled fallback rates.
            </p>
          ) : null}
          {pricing.fetchedAt ? (
            <p className="mt-1 text-[0.7rem] text-muted">
              Rates fetched {formatFetchedAt(pricing.fetchedAt)}
            </p>
          ) : null}
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {pricing.sources.map((source) => (
              <li key={source.url}>
                <a
                  className="text-[0.7rem] font-medium text-ink underline outline-none hover:text-muted-strong focus-visible:ring-2 focus-visible:ring-selected-line"
                  href={source.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const FORMULA =
  "Uncached input, cache reads, cache writes, and output, each × its USD / 1M-token rate. models.dev first, then LiteLLM. Unknown models are skipped.";

function CostBreakdown({ cost }: { cost: UsageCost }) {
  return (
    <dl className="mt-2 grid gap-1 font-mono text-[0.72rem] text-ink">
      <BreakdownRow
        label={tokenRowLabel(
          "Input",
          cost.inputTokens,
          cost.mixed ? undefined : cost.inputPerMillionUsd,
        )}
        value={formatUsd(cost.inputUsd)}
      />
      {cost.cachedReadTokens > 0 ? (
        <BreakdownRow
          label={tokenRowLabel(
            "Cache read",
            cost.cachedReadTokens,
            cost.mixed
              ? undefined
              : cost.pricedCachedReads
                ? cost.cacheReadPerMillionUsd
                : cost.inputPerMillionUsd,
          )}
          value={formatUsd(cost.cachedReadUsd)}
        />
      ) : null}
      {cost.cacheWriteTokens > 0 ? (
        <BreakdownRow
          label={tokenRowLabel(
            "Cache write",
            cost.cacheWriteTokens,
            cost.mixed ? undefined : cost.cacheWritePerMillionUsd,
          )}
          value={formatUsd(cost.cacheWriteUsd)}
        />
      ) : null}
      <BreakdownRow
        label={tokenRowLabel(
          "Output",
          cost.outputTokens,
          cost.mixed ? undefined : cost.outputPerMillionUsd,
        )}
        value={formatUsd(cost.outputUsd)}
      />
      <BreakdownRow label="Total" value={formatUsd(cost.totalUsd)} />
      <p className="text-[0.7rem] text-muted">
        {cost.matchedId ?? "unmatched"}
        {cost.usedTotalTokensFallback ? " · total tokens billed as input" : ""}
        {cost.cachedReadTokens > 0 && !cost.pricedCachedReads
          ? " · cache hits at the input rate"
          : ""}
      </p>
    </dl>
  );
}

function tokenRowLabel(kind: string, tokens: number, perMillionUsd?: number) {
  if (perMillionUsd === undefined) {
    return `${kind} ${formatNumber(tokens)}`;
  }
  return `${kind} ${formatNumber(tokens)} × ${formatUsd(perMillionUsd)}/M`;
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="min-w-0 text-muted">{label}</dt>
      <dd className="shrink-0 font-semibold">{value}</dd>
    </div>
  );
}

function formatFetchedAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}
