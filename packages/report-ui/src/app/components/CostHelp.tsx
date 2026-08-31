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
    <div className="relative inline-flex" ref={rootRef}>
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
            "absolute z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-line bg-panel p-3 text-left shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
          id={menuId}
        >
          <p className="text-[0.68rem] font-semibold uppercase text-muted-strong">
            How cost is estimated
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink">
            Uncached input × input rate + cached input × cache-read rate + cache
            write × write rate + output × output rate. Rates are USD per 1M
            tokens. models.dev first-party rows win, then LiteLLM. Unmatched
            models are skipped.
          </p>
          {cost ? <CostBreakdown cost={cost} /> : null}
          {pricing.source === "fallback" ? (
            <p className="mt-2 text-xs text-muted">
              Live catalog unavailable — using the bundled fallback table.
            </p>
          ) : null}
          {pricing.fetchedAt ? (
            <p className="mt-1 text-xs text-muted">
              Fetched {pricing.fetchedAt}
            </p>
          ) : null}
          <ul className="mt-2 grid gap-1">
            {pricing.sources.map((source) => (
              <li key={source.url}>
                <a
                  className="text-xs font-medium text-ink underline outline-none hover:text-muted-strong focus-visible:ring-2 focus-visible:ring-selected-line"
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

function CostBreakdown({ cost }: { cost: UsageCost }) {
  return (
    <dl className="mt-2 grid gap-1 font-mono text-[0.72rem] text-ink">
      <BreakdownRow
        label={`Uncached in ${formatNumber(cost.inputTokens)} × ${formatUsd(cost.inputPerMillionUsd)}/M`}
        value={formatUsd(cost.inputUsd)}
      />
      {cost.cachedReadTokens > 0 ? (
        <BreakdownRow
          label={`Cache read ${formatNumber(cost.cachedReadTokens)} × ${formatUsd(cost.pricedCachedReads ? cost.cacheReadPerMillionUsd : cost.inputPerMillionUsd)}/M`}
          value={formatUsd(cost.cachedReadUsd)}
        />
      ) : (
        <p className="text-xs text-muted">
          No cache-hit split recorded — input billed at the full input rate.
        </p>
      )}
      {cost.cacheWriteTokens > 0 ? (
        <BreakdownRow
          label={`Cache write ${formatNumber(cost.cacheWriteTokens)} × ${formatUsd(cost.cacheWritePerMillionUsd)}/M`}
          value={formatUsd(cost.cacheWriteUsd)}
        />
      ) : null}
      <BreakdownRow
        label={`Output ${formatNumber(cost.outputTokens)} × ${formatUsd(cost.outputPerMillionUsd)}/M`}
        value={formatUsd(cost.outputUsd)}
      />
      <BreakdownRow label="Total" value={formatUsd(cost.totalUsd)} />
      <p className="text-xs text-muted">
        Matched {cost.matchedId ?? "n/a"}
        {cost.usedTotalTokensFallback ? " · used totalTokens as input" : ""}
        {cost.cachedReadTokens > 0 && !cost.pricedCachedReads
          ? " · cache hits billed at input rate"
          : ""}
      </p>
    </dl>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="min-w-0 text-muted">{label}</dt>
      <dd className="shrink-0 font-semibold">{value}</dd>
    </div>
  );
}
