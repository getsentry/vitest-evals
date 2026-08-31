import type { CaseSortColumn, CaseStatusFilter } from "./model";
import type { DetailTab } from "./types";

export type ReportSearch = {
  q: string;
  status: CaseStatusFilter;
  run: string;
  sort?: CaseSortColumn;
  dir: "asc" | "desc";
  case?: string;
  tab: DetailTab;
};

const STATUS_VALUES = new Set<CaseStatusFilter>([
  "all",
  "passed",
  "failed",
  "skipped",
  "pending",
  "todo",
  "disabled",
]);

const SORT_VALUES = new Set<CaseSortColumn>([
  "status",
  "case",
  "model",
  "score",
  "duration",
  "tokens",
  "tools",
]);

const TAB_VALUES = new Set<DetailTab>(["overview", "transcript", "raw"]);

/** Parses report UI search params and fills defaults for missing keys. */
export function validateReportSearch(
  search: Record<string, unknown>,
): ReportSearch {
  return {
    q: readString(search.q) ?? "",
    status: readStatus(search.status),
    run: readString(search.run) ?? "all",
    sort: readSort(search.sort),
    dir: search.dir === "desc" ? "desc" : "asc",
    case: readString(search.case),
    tab: readTab(search.tab),
  };
}

/** Fills missing search keys so router navigations stay fully typed. */
export function toReportSearch(search: Partial<ReportSearch>): ReportSearch {
  return {
    q: search.q ?? "",
    status: search.status ?? "all",
    run: search.run ?? "all",
    sort: search.sort,
    dir: search.dir ?? "asc",
    case: search.case,
    tab: search.tab ?? "overview",
  };
}

/** Drops default search values so shared URLs stay short. */
export function compactReportSearch(
  search: Partial<ReportSearch>,
): Record<string, unknown> {
  return compactFilledSearch(toReportSearch(search));
}

function compactFilledSearch(search: ReportSearch): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (search.q.trim().length > 0) {
    next.q = search.q;
  }
  if (search.status !== "all") {
    next.status = search.status;
  }
  if (search.run !== "all") {
    next.run = search.run;
  }
  if (search.sort) {
    next.sort = search.sort;
    if (search.dir !== "asc") {
      next.dir = search.dir;
    }
  }
  if (search.case) {
    next.case = search.case;
    if (search.tab !== "overview") {
      next.tab = search.tab;
    }
  }
  return next;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStatus(value: unknown): CaseStatusFilter {
  return typeof value === "string" &&
    STATUS_VALUES.has(value as CaseStatusFilter)
    ? (value as CaseStatusFilter)
    : "all";
}

function readSort(value: unknown): CaseSortColumn | undefined {
  return typeof value === "string" && SORT_VALUES.has(value as CaseSortColumn)
    ? (value as CaseSortColumn)
    : undefined;
}

function readTab(value: unknown): DetailTab {
  return typeof value === "string" && TAB_VALUES.has(value as DetailTab)
    ? (value as DetailTab)
    : "overview";
}
