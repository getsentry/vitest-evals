import { describe, expect, test } from "vitest";
import {
  compactReportSearch,
  toReportSearch,
  validateReportSearch,
} from "./search";

describe("validateReportSearch", () => {
  test("fills defaults for an empty query string", () => {
    expect(validateReportSearch({})).toEqual({
      q: "",
      status: "all",
      run: "all",
      sort: undefined,
      dir: "asc",
      case: undefined,
      tab: "overview",
    });
  });

  test("keeps recognized values and ignores unknown ones", () => {
    expect(
      validateReportSearch({
        q: "fraud",
        status: "failed",
        run: "run-1",
        sort: "model",
        dir: "desc",
        case: "case-1",
        tab: "raw",
        extra: "nope",
      }),
    ).toEqual({
      q: "fraud",
      status: "failed",
      run: "run-1",
      sort: "model",
      dir: "desc",
      case: "case-1",
      tab: "raw",
    });

    expect(
      validateReportSearch({
        status: "bogus",
        sort: "nope",
        dir: "sideways",
        tab: "secret",
      }),
    ).toMatchObject({
      status: "all",
      sort: undefined,
      dir: "asc",
      tab: "overview",
    });
  });
});

describe("toReportSearch", () => {
  test("fills defaults for a partial search patch", () => {
    expect(toReportSearch({ status: "failed" })).toEqual({
      q: "",
      status: "failed",
      run: "all",
      sort: undefined,
      dir: "asc",
      case: undefined,
      tab: "overview",
    });
  });
});

describe("compactReportSearch", () => {
  test("omits default values from the serialized search", () => {
    expect(
      compactReportSearch({
        q: "",
        status: "all",
        run: "all",
        dir: "asc",
        tab: "overview",
      }),
    ).toEqual({});
  });

  test("keeps only the active inspection state", () => {
    expect(
      compactReportSearch({
        q: "fraud",
        status: "failed",
        run: "run-1",
        sort: "model",
        dir: "desc",
        case: "case-1",
        tab: "raw",
      }),
    ).toEqual({
      q: "fraud",
      status: "failed",
      run: "run-1",
      sort: "model",
      dir: "desc",
      case: "case-1",
      tab: "raw",
    });
  });

  test("drops the drawer tab when no case is open", () => {
    expect(
      compactReportSearch({
        q: "",
        status: "all",
        run: "all",
        dir: "asc",
        tab: "raw",
      }),
    ).toEqual({});
  });
});
