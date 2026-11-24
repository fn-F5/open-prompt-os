import * as fs from "node:fs/promises";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import {
  type ResolutionFinding,
  VIEWPORT_MATRIX,
  type ViewportSpec,
  createAuditContext,
  gotoAndSettle,
  inspectPageResolution,
} from "./resolution-audit.helpers.js";

const REPORT_PATH = path.resolve(import.meta.dirname, "resolution-report.json");
const SCREENSHOT_DIR = path.resolve(import.meta.dirname, "../../../reports/resolution-screenshots");

const allFindings: ResolutionFinding[] = [];
const auditedTargets: Array<{ context: string; route: string; viewport: string; state: string }> =
  [];

const SUBSET_VIEWPORTS: readonly ViewportSpec[] = VIEWPORT_MATRIX.filter((v) =>
  [
    "mobile-xs-320",
    "mobile-sm-375",
    "breakpoint-sm-640",
    "tablet-md-768",
    "laptop-lg-1024",
    "laptop-mid-1152",
    "desktop-xl-1280",
    "desktop-1440",
  ].includes(v.name),
);

async function captureIssueScreenshot(
  page: import("@playwright/test").Page,
  slug: string,
  findings: readonly ResolutionFinding[],
): Promise<void> {
  if (!findings.some((f) => f.severity === "critical" || f.severity === "major")) return;
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const safeName = slug.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${safeName}.png`) }).catch(() => {});
}

async function runAcrossViewports(
  browser: import("@playwright/test").Browser,
  options: {
    readonly viewports: readonly ViewportSpec[];
    readonly colorScheme: "dark" | "light";
    readonly authenticated: boolean;
    readonly routes: readonly string[];
    readonly contextName: string;
    readonly state: string;
    readonly screenshotPrefix: string;
    readonly afterNavigate?: (page: import("@playwright/test").Page) => Promise<void>;
  },
): Promise<void> {
  const groups = [
    options.viewports.filter((v) => v.isMobile),
    options.viewports.filter((v) => !v.isMobile),
  ].filter((group) => group.length > 0);

  for (const group of groups) {
    const initialViewport = group[0];
    if (!initialViewport) continue;
    const context = await createAuditContext(browser, {
      viewport: initialViewport,
      colorScheme: options.colorScheme,
      authenticated: options.authenticated,
    });
    const page = await context.newPage();
    try {
      for (const route of options.routes) {
        await gotoAndSettle(page, route);
        if (options.afterNavigate) {
          await options.afterNavigate(page);
        }
        for (const viewport of group) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(80);
          const { findings } = await inspectPageResolution(page, {
            contextName: options.contextName,
            theme: options.colorScheme,
            viewport,
            route,
            state: options.state,
          });
          auditedTargets.push({
            context: options.contextName,
            route,
            viewport: viewport.label,
            state: options.state,
          });
          allFindings.push(...findings);
          const routeSlug = route === "/" ? "index" : route;
          await captureIssueScreenshot(
            page,
            `${options.screenshotPrefix}_${routeSlug}_${viewport.name}`,
            findings,
          );
        }
      }
    } finally {
      await context.close();
    }
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Multi-Context Multi-Viewport Resolution Audit", () => {
  test.beforeAll(async () => {
    allFindings.length = 0;
    auditedTargets.length = 0;
  });

  test.afterAll(async () => {
    const bySeverity = {
      critical: allFindings.filter((f) => f.severity === "critical").length,
      major: allFindings.filter((f) => f.severity === "major").length,
      minor: allFindings.filter((f) => f.severity === "minor").length,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      auditedCount: auditedTargets.length,
      totalFindings: allFindings.length,
      bySeverity,
      findings: allFindings,
    };

    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(
      `\n[Resolution Audit] Audited ${auditedTargets.length} (context, viewport, route, state) snapshots -> ` +
        `critical=${bySeverity.critical}, major=${bySeverity.major}, minor=${bySeverity.minor}`,
    );
  });

  test("audits anonymous dark browser contexts across all viewports and core routes", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    // 1. Full viewport matrix on index route `/`
    await runAcrossViewports(browser, {
      viewports: VIEWPORT_MATRIX,
      colorScheme: "dark",
      authenticated: false,
      routes: ["/"],
      contextName: "anonymous-dark",
      state: "initial-load",
      screenshotPrefix: "anon-dark",
    });

    // 2. Representative viewports across anonymous secondary routes
    await runAcrossViewports(browser, {
      viewports: SUBSET_VIEWPORTS,
      colorScheme: "dark",
      authenticated: false,
      routes: ["/compile", "/improve", "/templates", "/pricing", "/history"],
      contextName: "anonymous-dark",
      state: "route-view",
      screenshotPrefix: "anon-dark",
    });

    expect(auditedTargets.length).toBeGreaterThan(0);
  });

  test("audits anonymous light browser contexts across representative viewports", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    await runAcrossViewports(browser, {
      viewports: SUBSET_VIEWPORTS,
      colorScheme: "light",
      authenticated: false,
      routes: ["/", "/pricing", "/templates"],
      contextName: "anonymous-light",
      state: "route-view",
      screenshotPrefix: "anon-light",
      afterNavigate: async (page) => {
        const themeAttr = await page.evaluate(() =>
          document.documentElement.getAttribute("data-theme"),
        );
        expect(themeAttr).toBe("light");
      },
    });
  });

  test("audits authenticated workspace browser contexts across navbar breakpoints and workspace routes", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    await runAcrossViewports(browser, {
      viewports: SUBSET_VIEWPORTS,
      colorScheme: "dark",
      authenticated: true,
      routes: ["/", "/history", "/library", "/settings/profile"],
      contextName: "authenticated-dark",
      state: "workspace-loaded",
      screenshotPrefix: "auth-dark",
    });
  });

  test("audits overlays, popovers, expanded composer, tour, and mobile nav across critical viewports", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const overlayViewports = VIEWPORT_MATRIX.filter((v) =>
      [
        "mobile-xs-320",
        "mobile-sm-375",
        "tablet-md-768",
        "laptop-short-1024x600",
        "laptop-lg-1024",
        "desktop-1440",
      ].includes(v.name),
    );

    for (const viewport of overlayViewports) {
      const context = await createAuditContext(browser, {
        viewport,
        colorScheme: "dark",
        authenticated: false,
      });
      const page = await context.newPage();
      try {
        await gotoAndSettle(page, "/compile");

        // 1. Mobile navigation drawer (< 1024px)
        if (viewport.width < 1024) {
          await page.getByRole("button", { name: "Open navigation menu" }).click();
          await page.waitForTimeout(150);
          const navResult = await inspectPageResolution(page, {
            contextName: "interactive-overlays",
            theme: "dark",
            viewport,
            route: "/compile",
            state: "mobile-nav-open",
          });
          auditedTargets.push({
            context: "interactive-overlays",
            route: "/compile",
            viewport: viewport.label,
            state: "mobile-nav-open",
          });
          allFindings.push(...navResult.findings);
          await captureIssueScreenshot(page, `mobile-nav_${viewport.name}`, navResult.findings);
          await page.getByRole("button", { name: "Close navigation menu" }).click();
          await page.waitForTimeout(120);
        }

        // 2. Sign In modal (`AuthDialog`)
        if (viewport.width >= 1024) {
          await page.getByRole("button", { name: "Sign In", exact: true }).click();
        } else {
          await page.getByRole("button", { name: "Open navigation menu" }).click();
          await page
            .locator("nav[aria-label='Mobile navigation']")
            .getByRole("button", { name: "Sign In", exact: true })
            .click();
        }
        await page.locator("dialog[open]").waitFor({ state: "visible" });
        await page.waitForTimeout(220);
        const dialogResult = await inspectPageResolution(page, {
          contextName: "interactive-overlays",
          theme: "dark",
          viewport,
          route: "/compile",
          state: "auth-dialog-open",
        });
        auditedTargets.push({
          context: "interactive-overlays",
          route: "/compile",
          viewport: viewport.label,
          state: "auth-dialog-open",
        });
        allFindings.push(...dialogResult.findings);
        await captureIssueScreenshot(page, `auth-dialog_${viewport.name}`, dialogResult.findings);
        await page.getByRole("button", { name: "Close dialog" }).click();
        await page.waitForTimeout(150);

        // 3. Target AI Model picker popover
        const pickerTrigger = page.getByRole("button", { name: "Target AI model" });
        await pickerTrigger.scrollIntoViewIfNeeded();
        await pickerTrigger.click();
        await page.waitForTimeout(180);
        const pickerResult = await inspectPageResolution(page, {
          contextName: "interactive-overlays",
          theme: "dark",
          viewport,
          route: "/compile",
          state: "model-picker-open",
        });
        auditedTargets.push({
          context: "interactive-overlays",
          route: "/compile",
          viewport: viewport.label,
          state: "model-picker-open",
        });
        allFindings.push(...pickerResult.findings);
        await captureIssueScreenshot(page, `model-picker_${viewport.name}`, pickerResult.findings);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(120);

        // 4. Expanded composer with typed draft -> GuidedParameters + AdvancedControls open
        await page.evaluate(() => window.scrollTo(0, 0));
        await page
          .locator("#prompt-composer-textarea")
          .fill("Design a multi-tenant audit logging pipeline with [Retention_Days] compliance.");
        await page.waitForTimeout(150);
        const advButton = page.getByRole("button", { name: /Advanced/i });
        if (await advButton.isVisible()) {
          await advButton.click();
          await page.waitForTimeout(150);
        }
        const expandedResult = await inspectPageResolution(page, {
          contextName: "interactive-overlays",
          theme: "dark",
          viewport,
          route: "/compile",
          state: "composer-expanded-advanced",
        });
        auditedTargets.push({
          context: "interactive-overlays",
          route: "/compile",
          viewport: viewport.label,
          state: "composer-expanded-advanced",
        });
        allFindings.push(...expandedResult.findings);
        await captureIssueScreenshot(
          page,
          `composer-expanded_${viewport.name}`,
          expandedResult.findings,
        );
      } finally {
        await context.close();
      }
    }

    if (process.env.STRICT_RESOLUTION === "1") {
      const blocking = allFindings.filter(
        (f) => f.severity === "critical" || f.severity === "major",
      );
      expect(blocking).toEqual([]);
    }
  });
});
