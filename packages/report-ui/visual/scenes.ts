import type { Locator, Page } from "playwright";

/** One UI state the visual suite renders, checks, and screenshots. */
export type VisualScene = {
  /** File-safe name; also the screenshot file name. */
  name: string;
  /** Report search params to load, such as `{ status: "failed" }`. */
  search?: Record<string, string>;
  viewport?: { width: number; height: number };
  /** Interactions that reach the state after the report has loaded. */
  act?: (page: Page) => Promise<void>;
  /** Element that must be visible once the scene is ready. */
  ready: (page: Page) => Locator;
};

export const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 820, height: 1180 };
const PHONE = { width: 390, height: 844 };

const FAILING_CASE = "rejects invoice with suspicious velocity";
const PASSING_CASE = "approves standard refundable invoice";

export const scenes: VisualScene[] = [
  {
    name: "overview",
    ready: (page) => page.getByText(PASSING_CASE).first(),
  },
  {
    name: "overview-phone",
    viewport: PHONE,
    ready: (page) => page.getByText(PASSING_CASE).first(),
  },
  {
    name: "overview-tablet",
    viewport: TABLET,
    ready: (page) => page.getByText(PASSING_CASE).first(),
  },
  {
    name: "filter-failed",
    search: { status: "failed" },
    ready: (page) => page.getByText(FAILING_CASE).first(),
  },
  {
    name: "sort-cost-desc",
    search: { sort: "cost", dir: "desc" },
    ready: (page) => page.getByText(PASSING_CASE).first(),
  },
  {
    name: "case-overview",
    act: (page) => openCase(page, FAILING_CASE),
    ready: caseDialog,
  },
  {
    name: "case-overview-phone",
    viewport: PHONE,
    act: (page) => openCase(page, FAILING_CASE),
    ready: caseDialog,
  },
  {
    name: "case-cost-help",
    act: async (page) => {
      await openCase(page, FAILING_CASE);
      await caseDialog(page)
        .getByRole("button", { name: "How estimated cost is computed" })
        .first()
        .click();
    },
    ready: (page) => caseDialog(page).getByText(/Recorded cost|Estimated cost/),
  },
  {
    name: "case-transcript",
    act: (page) => openCaseTab(page, FAILING_CASE, "Transcript"),
    ready: caseDialog,
  },
  {
    name: "case-compare",
    act: (page) => openCaseTab(page, FAILING_CASE, "Compare"),
    ready: caseDialog,
  },
  {
    name: "case-raw",
    act: (page) => openCaseTab(page, FAILING_CASE, "Raw"),
    ready: caseDialog,
  },
  {
    name: "command-palette",
    act: async (page) => {
      await page.keyboard.press("Control+K");
    },
    ready: (page) => page.getByLabel("Command palette", { exact: true }),
  },
];

function caseDialog(page: Page) {
  return page.getByRole("dialog");
}

async function openCase(page: Page, title: string) {
  await page.getByText(title).first().click();
  await caseDialog(page).waitFor();
}

async function openCaseTab(page: Page, title: string, tab: string) {
  await openCase(page, title);
  await caseDialog(page)
    .getByRole("navigation", { name: "Case detail views" })
    .getByRole("button", { name: tab })
    .click();
}
