import { getRouteApi } from "@tanstack/react-router";
import { type ReportSearch, toReportSearch } from "./search";

const reportRoute = getRouteApi("/");

/** Reads and writes report inspection state through the URL search. */
export function useReportSearch() {
  const search = reportRoute.useSearch();
  const navigate = reportRoute.useNavigate();

  const setSearch = (
    patch: Partial<ReportSearch>,
    options?: { replace?: boolean },
  ) => {
    void navigate({
      replace: options?.replace ?? true,
      search: (previous) =>
        toReportSearch({
          ...previous,
          ...patch,
        }),
    });
  };

  return { search, setSearch };
}
