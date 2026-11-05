import { createContext, useContext } from "react";
import { FALLBACK_PRICING, type ReportUiMeta } from "./pricing";

export type ReportMeta = ReportUiMeta;

export const DEFAULT_REPORT_META: ReportMeta = {
  pricing: FALLBACK_PRICING,
};

export const ReportMetaContext = createContext<ReportMeta>(DEFAULT_REPORT_META);

/** Reads the CLI workspace root and live/fallback pricing for the report UI. */
export function useReportMeta(): ReportMeta {
  return useContext(ReportMetaContext);
}

/** Accepts /data/meta.json or falls back to bundled pricing. */
export function readReportMeta(value: unknown): ReportMeta {
  if (!isRecord(value)) {
    return DEFAULT_REPORT_META;
  }

  const workspaceRoot =
    typeof value.workspaceRoot === "string" && value.workspaceRoot.length > 0
      ? value.workspaceRoot
      : undefined;
  const pricing = isPricingTable(value.pricing)
    ? {
        ...value.pricing,
        sources:
          value.pricing.sources?.length > 0
            ? value.pricing.sources
            : FALLBACK_PRICING.sources,
      }
    : FALLBACK_PRICING;
  return { workspaceRoot, pricing };
}

function isPricingTable(value: unknown): value is ReportMeta["pricing"] {
  if (!isRecord(value) || typeof value.source !== "string") {
    return false;
  }
  if (!Array.isArray(value.models)) {
    return false;
  }
  return value.models.every(
    (row) =>
      isRecord(row) &&
      typeof row.id === "string" &&
      typeof row.inputPerMillionUsd === "number" &&
      typeof row.outputPerMillionUsd === "number",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
