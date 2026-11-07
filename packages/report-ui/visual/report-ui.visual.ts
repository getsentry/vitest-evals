import { access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readReportWorkspace } from "@vitest-evals/core/node";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FALLBACK_PRICING } from "../src/app/pricing";
import { type ReportUiServer, serveReportWorkspace } from "../src/server";
import { DESKTOP, type VisualScene, scenes } from "./scenes";

const packageDir = resolve(__dirname, "..");
const assetsDir = join(packageDir, "dist/client");
const outputDir = join(packageDir, ".visual");
const fixtures = [
  "fixtures/vitest-results.visual-baseline.json",
  "fixtures/vitest-results.visual.json",
].map((fixture) => join(packageDir, fixture));

let browser: Browser;
let server: ReportUiServer;

beforeAll(async () => {
  try {
    await access(join(assetsDir, "index.html"));
  } catch {
    throw new Error(
      `Missing built UI at ${assetsDir}. Run \`pnpm --filter @vitest-evals/report-ui run test:visual\`, which builds first.`,
    );
  }
  await mkdir(outputDir, { recursive: true });

  const { workspace } = await readReportWorkspace(fixtures, {
    workspace: "/repo",
  });
  // Fallback pricing keeps cost cells stable and the suite offline.
  server = await serveReportWorkspace(workspace, {
    assetsDir,
    pricing: FALLBACK_PRICING,
    // Enables the re-run controls; the rerun scene stubs the API call.
    workspaceRoot: "/repo",
  });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe("report UI scenes", () => {
  test.each(scenes.map((scene) => [scene.name, scene] as const))(
    "%s",
    async (_name, scene) => {
      const context = await browser.newContext({
        viewport: scene.viewport ?? DESKTOP,
        reducedMotion: "reduce",
        colorScheme: "light",
      });
      const page = await context.newPage();
      const problems = watchPageProblems(page, server.url);
      try {
        // Not "networkidle": the live /api/events stream never goes idle.
        // Each scene's ready() locator waits for the content instead.
        await page.goto(sceneUrl(scene), { waitUntil: "load" });
        await scene.act?.(page);
        await scene.ready(page).waitFor({ state: "visible" });

        expect(await horizontalOverflow(page)).toBe(0);
        expect(await overlappingControls(page)).toEqual([]);
        expect(problems).toEqual([]);

        await page.screenshot({
          path: join(outputDir, `${scene.name}.png`),
          animations: "disabled",
        });
      } finally {
        await context.close();
      }
    },
  );
});

function sceneUrl(scene: VisualScene) {
  const url = new URL(server.url);
  for (const [key, value] of Object.entries(scene.search ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Collects uncaught errors, console errors, and failed same-origin requests. */
function watchPageProblems(page: Page, origin: string) {
  const problems: string[] = [];
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console.error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return problems;
}

/** Returns how many pixels the page scrolls sideways; layouts should not. */
function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/**
 * Lists pairs of visible controls or headings in the same layer whose boxes
 * overlap. This catches cramped toolbars where inputs, selects, or buttons
 * collide, and controls pulled over a section title. Overlap across layers
 * (drawer, popover, palette, tray) is intentional, so it is ignored.
 */
function overlappingControls(page: Page) {
  return page.evaluate(() => {
    const viewportArea = window.innerWidth * window.innerHeight;
    const layerOf = (element: Element) => {
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        // Modal dialogs and popovers render in the browser's top layer.
        if (node.matches("dialog[open], :popover-open")) {
          return node;
        }
        const style = getComputedStyle(node);
        if (style.position !== "static" && Number(style.zIndex) > 0) {
          return node;
        }
      }
      return undefined;
    };
    const label = (element: Element) =>
      element.getAttribute("aria-label") ||
      element.textContent?.trim().slice(0, 40) ||
      element.getAttribute("placeholder") ||
      element.tagName.toLowerCase();
    const controls = [
      ...document.querySelectorAll(
        "a[href], button, input, select, textarea, h1, h2, h3, h4",
      ),
    ].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const area = rect.width * rect.height;
      // Skip hidden controls and full-screen backdrops.
      if (area === 0 || area > viewportArea / 4) {
        return [];
      }
      return [{ element, rect, layer: layerOf(element) }];
    });

    const overlaps: string[] = [];
    controls.forEach((left, index) => {
      for (const right of controls.slice(index + 1)) {
        if (
          left.layer !== right.layer ||
          left.element.contains(right.element) ||
          right.element.contains(left.element)
        ) {
          continue;
        }
        const width =
          Math.min(left.rect.right, right.rect.right) -
          Math.max(left.rect.left, right.rect.left);
        const height =
          Math.min(left.rect.bottom, right.rect.bottom) -
          Math.max(left.rect.top, right.rect.top);
        // Allow a pixel of shared border.
        if (width > 1 && height > 1) {
          overlaps.push(
            `${label(left.element)} overlaps ${label(right.element)}`,
          );
        }
      }
    });
    return overlaps;
  });
}
