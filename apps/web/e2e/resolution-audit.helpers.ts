import type { Browser, BrowserContext, Page } from "@playwright/test";

export interface ViewportSpec {
  readonly name: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}

export const VIEWPORT_MATRIX: readonly ViewportSpec[] = [
  {
    name: "mobile-xs-320",
    label: "Mobile XS (320x568)",
    width: 320,
    height: 568,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "mobile-sm-375",
    label: "Mobile SM (375x667)",
    width: 375,
    height: 667,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "mobile-lg-390",
    label: "Mobile LG (390x844)",
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "breakpoint-sm-640",
    label: "Breakpoint sm (640x960)",
    width: 640,
    height: 960,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "tablet-md-768",
    label: "Tablet Portrait md (768x1024)",
    width: 768,
    height: 1024,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "laptop-lg-1024",
    label: "Small Laptop lg (1024x768)",
    width: 1024,
    height: 768,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "laptop-short-1024x600",
    label: "Short Laptop (1024x600)",
    width: 1024,
    height: 600,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "laptop-mid-1152",
    label: "Mid Laptop (1152x768)",
    width: 1152,
    height: 768,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "desktop-xl-1280",
    label: "HD Laptop xl (1280x720)",
    width: 1280,
    height: 720,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "desktop-1440",
    label: "Standard Desktop (1440x900)",
    width: 1440,
    height: 900,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "desktop-1920",
    label: "Wide Desktop (1920x1080)",
    width: 1920,
    height: 1080,
    isMobile: false,
    hasTouch: false,
  },
];

export type IssueSeverity = "critical" | "major" | "minor";

export type IssueCategory =
  | "horizontal-document-overflow"
  | "viewport-edge-overflow"
  | "clipped-by-overflow-hidden"
  | "container-overflow-clipped"
  | "horizontal-scroll-strip"
  | "navbar-wrap-or-overflow"
  | "navbar-crowding"
  | "overlay-viewport-overflow"
  | "interactive-overlap"
  | "control-text-wrap-or-clip"
  | "cramped-grid-column"
  | "above-the-fold-cta-clipped"
  | "small-touch-target";

export interface ResolutionFinding {
  readonly contextName: string;
  readonly theme: "dark" | "light";
  readonly viewport: string;
  readonly width: number;
  readonly height: number;
  readonly route: string;
  readonly state: string;
  readonly severity: IssueSeverity;
  readonly category: IssueCategory;
  readonly element: string;
  readonly detail: string;
  readonly metrics: Record<string, number | string | boolean>;
}

export interface AuditMetricsSnapshot {
  readonly docScrollWidth: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly headerHeight: number | null;
  readonly compileButtonBottom: number | null;
  readonly findings: readonly Omit<
    ResolutionFinding,
    "contextName" | "theme" | "viewport" | "width" | "height" | "route" | "state"
  >[];
}

const SAMPLE_SESSION_PAYLOAD = {
  session: {
    id: "sess_pw_audit",
    userId: "usr_pw_audit",
    token: "tok_pw_audit",
    expiresAt: "2027-01-01T00:00:00.000Z",
  },
  user: {
    id: "usr_pw_audit",
    email: "operator@openprompt.dev",
    name: "Operator Account",
    spaceId: "spc_pw_audit",
    spaceName: "Core Engineering Studio",
    plan: "pro",
    hasPasskey: false,
  },
};

const SAMPLE_BILLING_STATUS = {
  plan: "pro",
  status: "active",
  remainingDailyPrompts: 482,
  dailyLimit: 500,
  resetAt: "2027-01-01T00:00:00.000Z",
  seats: 1,
  currentPeriodEnd: "2027-01-01T00:00:00.000Z",
};

const SAMPLE_SAVED_ITEMS = [
  {
    id: "prm_pw_1",
    title: "Production Incident Postmortem Compiler",
    rawInput: "Compile a blameless postmortem from timeline notes and root cause analysis.",
    compiledPrompt:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by COSTAR)\nRole: Principal Site Reliability Engineer.\n\n## Objective\nSynthesize [Incident_Timeline] and [Root_Cause] into an actionable remediation plan with [SLO_Impact] metrics.",
    mode: "text",
    framework: "costar",
    modelId: "anthropic-text",
    category: "Engineering",
    tags: ["sre", "postmortem", "reliability"],
    detectedVariables: ["Incident_Timeline", "Root_Cause", "SLO_Impact"],
    isShared: true,
    shareId: "shr_pw_1",
    createdAt: "2026-11-08T14:20:00.000Z",
    updatedAt: "2026-11-09T09:15:00.000Z",
  },
  {
    id: "prm_pw_2",
    title: "Distributed Cache Migration & Zero-Downtime Rollout Checklist",
    rawInput:
      "Design a multi-region cache migration plan with canary stages and rollback triggers.",
    compiledPrompt:
      "# OPERATIONAL PROMPT SPECIFICATION\nRole: Staff Infrastructure Architect.\n\nCreate a staged migration playbook for [Service_Name] moving to [Target_Cluster] within [Latency_Budget].",
    mode: "text",
    framework: "rise",
    modelId: "openai-text",
    category: "Infrastructure",
    tags: ["migration", "redis", "canary"],
    detectedVariables: ["Service_Name", "Target_Cluster", "Latency_Budget"],
    isShared: false,
    shareId: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    updatedAt: "2026-11-11T12:00:00.000Z",
  },
];

const SAMPLE_GENERATIONS = [
  {
    id: "gen_pw_1",
    kind: "compose",
    rawInput: "Design a resilient webhook delivery pipeline for [Tenant_Scale] events per minute.",
    compiledPrompt:
      "# OPERATIONAL PROMPT SPECIFICATION\nArchitect an idempotent webhook dispatcher handling [Tenant_Scale] events/min.",
    draft: {
      rawInput:
        "Design a resilient webhook delivery pipeline for [Tenant_Scale] events per minute.",
      mode: "text",
      modelId: "anthropic-text",
      framework: "costar",
      constraints: ["Bounded retry budget"],
      guardrails: [],
      advanced: {},
    },
    inputImageUrl: null,
    mode: "text",
    framework: "costar",
    modelId: "anthropic-text",
    providerId: "anthropic",
    latencyMs: 148,
    createdAt: "2026-11-10T10:15:00.000Z",
  },
];

/** Create an isolated browser context pinned to a viewport, color scheme, and optional auth mocks. */
export async function createAuditContext(
  browser: Browser,
  options: {
    readonly viewport: ViewportSpec;
    readonly colorScheme: "dark" | "light";
    readonly authenticated?: boolean;
    readonly suppressIdleTour?: boolean;
  },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: options.viewport.width, height: options.viewport.height },
    colorScheme: options.colorScheme,
    isMobile: options.viewport.isMobile,
    hasTouch: options.viewport.hasTouch,
  });

  await context.addInitScript(
    ({ theme, suppressTour }) => {
      try {
        window.localStorage.setItem("open-prompt-os:theme", theme);
        if (suppressTour) {
          window.localStorage.setItem("open-prompt-os:has-seen-tour:v1", "true");
        }
      } catch {
        // Ignore storage errors
      }
    },
    { theme: options.colorScheme, suppressTour: options.suppressIdleTour ?? true },
  );

  if (options.authenticated) {
    await context.route("**/api/auth/get-session**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SAMPLE_SESSION_PAYLOAD),
      });
    });

    await context.route("**/api/auth/providers**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ google: true, github: true }),
      });
    });

    await context.route("**/rpc/**", async (route) => {
      const url = route.request().url();
      let jsonPayload: unknown = {};
      if (url.includes("/rpc/billing/status")) {
        jsonPayload = SAMPLE_BILLING_STATUS;
      } else if (url.includes("/rpc/prompts/history")) {
        jsonPayload = { items: SAMPLE_SAVED_ITEMS, nextCursor: null };
      } else if (url.includes("/rpc/prompts/generations")) {
        jsonPayload = { items: SAMPLE_GENERATIONS, nextCursor: null };
      } else if (url.includes("/rpc/userPreferences/get")) {
        jsonPayload = { dismissedHotspots: {}, completedTours: {} };
      } else if (url.includes("/rpc/models/healthStatus")) {
        jsonPayload = [
          {
            providerId: "anthropic",
            circuit: "closed",
            recentFailureRate: 0.001,
            lastErrorAt: null,
          },
        ];
      } else if (url.includes("/rpc/templates/list")) {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: jsonPayload }),
      });
    });
  } else {
    await context.route("**/api/auth/get-session**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null, user: null }),
      });
    });
  }

  return context;
}

/** Navigate to an app route and wait until auth shell clears, fonts load, and layout settles. */
export async function gotoAndSettle(page: Page, routePath: string): Promise<void> {
  await page.goto(routePath, { waitUntil: "domcontentloaded" });
  await page
    .locator('[data-testid="auth-loading-shell"]')
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
  await page.locator("#main-workspace").waitFor({ state: "visible", timeout: 10_000 });
  // Wait for lazy Suspense fallback inside #main-workspace to finish loading
  await page
    .waitForFunction(
      () => {
        const main = document.querySelector("#main-workspace");
        if (!main) return false;
        return !main.querySelector('[aria-busy="true"].animate-pulse');
      },
      { timeout: 10_000 },
    )
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(180);
}

/** Evaluate live DOM geometry to detect horizontal overflow, clipping, overlaps, and layout compression. */
export async function inspectPageResolution(
  page: Page,
  meta: {
    readonly contextName: string;
    readonly theme: "dark" | "light";
    readonly viewport: ViewportSpec;
    readonly route: string;
    readonly state: string;
  },
): Promise<{
  readonly snapshot: AuditMetricsSnapshot;
  readonly findings: readonly ResolutionFinding[];
}> {
  const snapshot = await page.evaluate(
    ({ checkAboveFold }): AuditMetricsSnapshot => {
      const findings: AuditMetricsSnapshot["findings"][number][] = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const docScrollWidth = document.documentElement.scrollWidth;

      const describeEl = (el: Element): string => {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : "";
        const role = el.getAttribute("role");
        const aria = el.getAttribute("aria-label");
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        const parts = [tag + id];
        if (role) parts.push(`[role="${role}"]`);
        if (aria) parts.push(`[aria-label="${aria.slice(0, 32)}"]`);
        else if (text) parts.push(`"${text}"`);
        return parts.join("");
      };

      const isDecorativeOrHidden = (el: Element): boolean => {
        if (el.closest("[hidden]")) return true;
        if (el.closest('[aria-hidden="true"]') && !el.closest("svg")) {
          const hiddenAncestor = el.closest('[aria-hidden="true"]');
          if (hiddenAncestor && getComputedStyle(hiddenAncestor).pointerEvents === "none") {
            return true;
          }
        }
        if (el.classList.contains("sr-only")) return true;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return true;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 && rect.height <= 1) return true;
        if (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)") {
          return true;
        }
        // Skip SVG internal paths/shapes
        if (el.tagName.toLowerCase() !== "svg" && el.closest("svg")) return true;
        // Skip decorative ambient glow layers explicitly marked aria-hidden + pointer-events-none
        if (el.getAttribute("aria-hidden") === "true" && style.pointerEvents === "none") {
          return true;
        }
        return false;
      };

      const isVisibleInLayout = (el: Element): boolean => {
        if (isDecorativeOrHidden(el)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      // 1. Document-level horizontal overflow
      if (docScrollWidth > vw + 1) {
        findings.push({
          severity: "critical",
          category: "horizontal-document-overflow",
          element: "html/documentElement",
          detail: `Document scrollWidth (${docScrollWidth}px) exceeds viewport width (${vw}px) by ${docScrollWidth - vw}px.`,
          metrics: { docScrollWidth, viewportWidth: vw, overflowPx: docScrollWidth - vw },
        });
      }

      // 2. Scan visible elements for viewport edge overflow, ancestor overflow-x clipping, and internal clipping
      const candidates = Array.from(
        document.querySelectorAll(
          "header, nav, main, footer, section, aside, dialog, h1, h2, h3, p, div, ul, a, button, input, textarea, select, pre, code, table, [role='tablist'], [role='tab'], [role='listbox'], [role='option']",
        ),
      );

      const seenClips = new Set<string>();
      const pushUnique = (item: AuditMetricsSnapshot["findings"][number], dedupeKey?: string) => {
        const key = dedupeKey ?? `${item.category}:${item.element}`;
        if (seenClips.has(key)) return;
        seenClips.add(key);
        findings.push(item);
      };

      const findScrollOrClipAncestor = (el: Element) => {
        let cur = el.parentElement;
        let scrollXAncestor: HTMLElement | null = null;
        let clipXAncestor: HTMLElement | null = null;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          const ox = getComputedStyle(cur).overflowX;
          if (!scrollXAncestor && (ox === "auto" || ox === "scroll")) {
            scrollXAncestor = cur;
          }
          if (!clipXAncestor && (ox === "hidden" || ox === "clip")) {
            clipXAncestor = cur;
          }
          cur = cur.parentElement;
        }
        return { scrollXAncestor, clipXAncestor };
      };

      for (const el of candidates) {
        if (!isVisibleInLayout(el)) continue;
        if (el.closest(".popover") && !el.closest(":popover-open")) continue;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const { scrollXAncestor, clipXAncestor } = findScrollOrClipAncestor(el);

        // Ignore things scrolling off to the side inside an intentional scroll strip unless we record the strip itself
        const isControlOrText =
          /^(a|button|input|textarea|select|h1|h2|h3|p|pre|code|table|header|footer|nav|dialog)$/.test(
            el.tagName.toLowerCase(),
          ) || el.getAttribute("role") === "tab";

        if (isControlOrText && !scrollXAncestor) {
          if (rect.right > vw + 2 || rect.left < -2) {
            pushUnique({
              severity: "critical",
              category: "viewport-edge-overflow",
              element: describeEl(el),
              detail: `Element extends horizontally outside viewport [${0}, ${vw}px]: left=${Math.round(rect.left)}px, right=${Math.round(rect.right)}px.`,
              metrics: {
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                viewportWidth: vw,
              },
            });
          } else if (clipXAncestor) {
            const clipRect = clipXAncestor.getBoundingClientRect();
            if (rect.right > clipRect.right + 2 || rect.left < clipRect.left - 2) {
              pushUnique({
                severity: "major",
                category: "clipped-by-overflow-hidden",
                element: describeEl(el),
                detail: `Element overflows its overflow-hidden ancestor ${describeEl(clipXAncestor)} (${Math.round(rect.right)}px > ${Math.round(clipRect.right)}px).`,
                metrics: {
                  elRight: Math.round(rect.right),
                  clipRight: Math.round(clipRect.right),
                  overflowPx: Math.round(rect.right - clipRect.right),
                },
              });
            }
          }
        }

        // Check internal horizontal overflow on elements (excluding svg / pseudo rings)
        if (
          el instanceof HTMLElement &&
          el.scrollWidth > el.clientWidth + 3 &&
          el.clientWidth > 0
        ) {
          if (style.overflowX === "auto" || style.overflowX === "scroll") {
            const hiddenOffRight = el.scrollWidth - el.clientWidth;
            if (hiddenOffRight > 8) {
              pushUnique({
                severity: "minor",
                category: "horizontal-scroll-strip",
                element: describeEl(el),
                detail: `Requires horizontal scroll (${el.scrollWidth}px content inside ${el.clientWidth}px box; ${hiddenOffRight}px clipped off-edge).`,
                metrics: {
                  scrollWidth: el.scrollWidth,
                  clientWidth: el.clientWidth,
                  hiddenPx: hiddenOffRight,
                },
              });
            }
          } else if (
            style.overflowX === "hidden" ||
            style.overflowX === "clip" ||
            style.overflowX === "visible"
          ) {
            // Ignore elements using deliberate ellipsis truncation (text-overflow: ellipsis + white-space: nowrap)
            const isIntentionalEllipsis =
              style.textOverflow === "ellipsis" && style.whiteSpace === "nowrap";
            if (!isIntentionalEllipsis) {
              const overflowPx = el.scrollWidth - el.clientWidth;
              pushUnique({
                severity: style.overflowX === "hidden" ? "major" : "minor",
                category: "container-overflow-clipped",
                element: describeEl(el),
                detail: `Container (${style.overflowX}) overflows horizontally: scrollWidth=${el.scrollWidth}px > clientWidth=${el.clientWidth}px (+${overflowPx}px).`,
                metrics: {
                  scrollWidth: el.scrollWidth,
                  clientWidth: el.clientWidth,
                  overflowPx,
                  overflowX: style.overflowX,
                },
              });
            }
          }
        }
      }

      // 3. Navbar checks
      const header = document.querySelector("header");
      let headerHeight: number | null = null;
      if (header && isVisibleInLayout(header)) {
        const hRect = header.getBoundingClientRect();
        headerHeight = Math.round(hRect.height);
        const topBar = header.firstElementChild as HTMLElement | null;
        if (topBar) {
          const expectedMaxBarHeight = vw >= 640 ? 84 : 60;
          const barRect = topBar.getBoundingClientRect();
          if (barRect.height > expectedMaxBarHeight) {
            findings.push({
              severity: "major",
              category: "navbar-wrap-or-overflow",
              element: "header > div",
              detail: `Header top row height (${Math.round(barRect.height)}px) exceeds expected single-bar height (${expectedMaxBarHeight}px).`,
              metrics: { barHeight: Math.round(barRect.height), expectedMaxBarHeight },
            });
          }
          if (topBar.scrollWidth > topBar.clientWidth + 2) {
            findings.push({
              severity: "critical",
              category: "navbar-wrap-or-overflow",
              element: "header > div",
              detail: `Header row overflows horizontally (${topBar.scrollWidth}px > ${topBar.clientWidth}px).`,
              metrics: { scrollWidth: topBar.scrollWidth, clientWidth: topBar.clientWidth },
            });
          }

          // Check gap between left brand/nav group and right actions group when both are visible
          const groups = Array.from(topBar.children).filter((c) => isVisibleInLayout(c));
          if (groups.length >= 2) {
            for (let i = 0; i < groups.length - 1; i++) {
              const leftEl = groups[i];
              const rightEl = groups[i + 1];
              if (!leftEl || !rightEl) continue;
              const leftG = leftEl.getBoundingClientRect();
              const rightG = rightEl.getBoundingClientRect();
              const gap = Math.round(rightG.left - leftG.right);
              if (gap < 4) {
                findings.push({
                  severity: gap < 0 ? "critical" : "major",
                  category: "navbar-crowding",
                  element: "header groups",
                  detail: `Navbar left and right flex groups have insufficient gap (${gap}px) at width ${vw}px.`,
                  metrics: {
                    gapPx: gap,
                    leftGroupRight: Math.round(leftG.right),
                    rightGroupLeft: Math.round(rightG.left),
                  },
                });
              }
            }
          }
        }

        // Check header links/buttons for multi-line wrap or clipping
        const headerControls = Array.from(
          header.querySelectorAll(
            "nav:not([aria-label*='Mobile']) a, header > div button, header > div a",
          ),
        );
        for (const ctrl of headerControls) {
          if (!isVisibleInLayout(ctrl)) continue;
          const cRect = ctrl.getBoundingClientRect();
          if (cRect.height > 44) {
            findings.push({
              severity: "major",
              category: "navbar-wrap-or-overflow",
              element: describeEl(ctrl),
              detail: `Header item wrapped vertically (${Math.round(cRect.height)}px tall).`,
              metrics: { height: Math.round(cRect.height), width: Math.round(cRect.width) },
            });
          }
        }
      }

      // 4. Overlay checks: dialogs, popovers, mobile nav drawers, fixed tour cards
      const overlaySelectors = [
        "dialog[open]",
        ".dialog-panel",
        ".model-picker-popover:popover-open",
        ".model-picker-popover:not([hidden])",
        "header nav[aria-label*='Mobile']",
        "aside[aria-label='Product onboarding tour']",
      ];
      for (const sel of overlaySelectors) {
        for (const overlay of Array.from(document.querySelectorAll(sel))) {
          if (!isVisibleInLayout(overlay)) continue;
          const oRect = overlay.getBoundingClientRect();
          const oStyle = getComputedStyle(overlay);
          if (oRect.left < -1 || oRect.right > vw + 1) {
            findings.push({
              severity: "critical",
              category: "overlay-viewport-overflow",
              element: describeEl(overlay),
              detail: `Overlay extends outside viewport horizontally (left=${Math.round(oRect.left)}px, right=${Math.round(oRect.right)}px vs ${vw}px).`,
              metrics: {
                left: Math.round(oRect.left),
                right: Math.round(oRect.right),
                width: Math.round(oRect.width),
                viewportWidth: vw,
              },
            });
          }
          if (oRect.top < -1 || oRect.bottom > vh + 1) {
            const scrollableY = oStyle.overflowY === "auto" || oStyle.overflowY === "scroll";
            findings.push({
              severity: scrollableY ? "major" : "critical",
              category: "overlay-viewport-overflow",
              element: describeEl(overlay),
              detail: `Overlay exceeds viewport height (${vh}px): top=${Math.round(oRect.top)}px, bottom=${Math.round(oRect.bottom)}px, overflowY=${oStyle.overflowY}, scrollHeight=${overlay.scrollHeight}px.`,
              metrics: {
                top: Math.round(oRect.top),
                bottom: Math.round(oRect.bottom),
                overlayHeight: Math.round(oRect.height),
                scrollHeight: overlay.scrollHeight,
                viewportHeight: vh,
              },
            });
          }

          // Check buttons/inputs inside overlay for bottom/side clipping
          const innerPanel = overlay.querySelector(".dialog-panel");
          const panelOverflowY =
            oStyle.overflowY === "auto" ||
            oStyle.overflowY === "scroll" ||
            Boolean(
              innerPanel && ["auto", "scroll"].includes(getComputedStyle(innerPanel).overflowY),
            );
          const allowScrollYChildren = panelOverflowY && oRect.top >= -1 && oRect.bottom <= vh + 1;

          const innerControls = Array.from(overlay.querySelectorAll("button, a, input"));
          for (const inner of innerControls) {
            if (!isVisibleInLayout(inner)) continue;
            const iRect = inner.getBoundingClientRect();
            const overflowsH = iRect.right > vw + 1 || iRect.left < -1;
            const overflowsV = !allowScrollYChildren && (iRect.bottom > vh + 1 || iRect.top < -1);
            if (overflowsH || overflowsV) {
              pushUnique({
                severity: "major",
                category: "overlay-viewport-overflow",
                element: `${describeEl(inner)} inside ${describeEl(overlay)}`,
                detail: `Interactive control inside overlay extends outside viewport (top=${Math.round(iRect.top)}, bottom=${Math.round(iRect.bottom)}, left=${Math.round(iRect.left)}, right=${Math.round(iRect.right)}).`,
                metrics: {
                  top: Math.round(iRect.top),
                  bottom: Math.round(iRect.bottom),
                  left: Math.round(iRect.left),
                  right: Math.round(iRect.right),
                  viewportWidth: vw,
                  viewportHeight: vh,
                },
              });
            }
          }
        }
      }

      // 5. Compact control wrapping / clipping (single-row buttons & tabs, excluding rich multi-block card buttons)
      const controlEls = Array.from(document.querySelectorAll("button, [role='tab']"));
      for (const btn of controlEls) {
        if (!isVisibleInLayout(btn)) continue;
        if (btn.closest(".popover") && !btn.closest(":popover-open")) continue;
        // Rich card-selector buttons intentionally contain titles, badges, and multi-line summaries
        if (btn.querySelector("h2, h3, p, ul, ol")) continue;
        const rect = btn.getBoundingClientRect();
        const range = document.createRange();
        const textWalker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
        let maxLineCount = 0;
        let node = textWalker.nextNode();
        while (node) {
          if ((node.textContent ?? "").trim().length > 0) {
            range.selectNodeContents(node);
            const rects = Array.from(range.getClientRects()).filter(
              (r) => r.width > 1 && r.height > 1,
            );
            const yBands = new Set(rects.map((r) => Math.round(r.top / 4)));
            if (yBands.size > maxLineCount) maxLineCount = yBands.size;
          }
          node = textWalker.nextNode();
        }
        if (maxLineCount >= 2 && rect.width < vw * 0.85) {
          pushUnique({
            severity: "major",
            category: "control-text-wrap-or-clip",
            element: describeEl(btn),
            detail: `Button/tab label wrapped across ${maxLineCount} lines (width=${Math.round(rect.width)}px, height=${Math.round(rect.height)}px).`,
            metrics: {
              lines: maxLineCount,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          });
        }
      }

      // 6. Cramped grid columns check (measure actual rendered side-by-side card widths, accounting for col-span-*)
      const allGrids = Array.from(
        document.querySelectorAll("section div, main div, footer div"),
      ).filter((el) => isVisibleInLayout(el) && getComputedStyle(el).display === "grid");
      for (const grid of allGrids) {
        const children = Array.from(grid.children).filter((c) => isVisibleInLayout(c));
        if (children.length < 2) continue;
        // Detect side-by-side row items (at least two children starting near the same Y band)
        const rowBands = new Map<number, Element[]>();
        for (const child of children) {
          const band = Math.round(child.getBoundingClientRect().top / 16);
          const list = rowBands.get(band) ?? [];
          list.push(child);
          rowBands.set(band, list);
        }
        const multiColRow = Array.from(rowBands.values()).find((row) => row.length >= 2);
        if (!multiColRow) continue;
        const cardLikeRow = multiColRow.filter(
          (c) =>
            c.classList.contains("flat-surface") ||
            c.classList.contains("glass-surface") ||
            c.classList.contains("glow-card") ||
            c.querySelector("h2, h3"),
        );
        if (cardLikeRow.length < 2) continue;
        const minChildWidth = Math.min(...cardLikeRow.map((c) => c.getBoundingClientRect().width));
        if (minChildWidth < 210) {
          pushUnique({
            severity: "major",
            category: "cramped-grid-column",
            element: describeEl(grid),
            detail: `Side-by-side grid cards compressed to ${Math.round(minChildWidth)}px width across ${cardLikeRow.length} columns at viewport ${vw}px.`,
            metrics: {
              minCardWidthPx: Math.round(minChildWidth),
              rowColumnCount: cardLikeRow.length,
              viewportWidth: vw,
            },
          });
        }
      }

      // 7. Interactive sibling overlap detection (same container / active layer)
      const activeDialog = document.querySelector("dialog[open]");
      const interactiveScope = activeDialog ?? document;
      const interactives = Array.from(
        interactiveScope.querySelectorAll("button, a[href], input, textarea, select, [role='tab']"),
      ).filter((el) => {
        if (!isVisibleInLayout(el)) return false;
        if (!activeDialog && el.closest("dialog")) return false;
        if (el.closest(".popover") && !el.closest(":popover-open")) return false;
        return true;
      });

      for (let i = 0; i < interactives.length; i++) {
        const a = interactives[i];
        if (!a) continue;
        const ra = a.getBoundingClientRect();
        // Sticky header intentionally covers scrolled content underneath, so skip comparing fixed/sticky header items with scrolled main items
        const aFixed = Boolean(a.closest("header.sticky, aside.fixed, dialog, [popover]"));
        for (let j = i + 1; j < interactives.length; j++) {
          const b = interactives[j];
          if (!b || a.contains(b) || b.contains(a)) continue;
          const bFixed = Boolean(b.closest("header.sticky, aside.fixed, dialog, [popover]"));
          if (aFixed !== bFixed) continue;
          const rb = b.getBoundingClientRect();
          const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (overlapX > 3 && overlapY > 3) {
            pushUnique({
              severity: "critical",
              category: "interactive-overlap",
              element: `${describeEl(a)} <-> ${describeEl(b)}`,
              detail: `Interactive elements overlap by ${Math.round(overlapX)}x${Math.round(overlapY)}px.`,
              metrics: { overlapWidth: Math.round(overlapX), overlapHeight: Math.round(overlapY) },
            });
          }
        }
      }

      // 8. Small touch targets on mobile/tablet viewports (<= 768px)
      if (vw <= 768) {
        const buttons = Array.from(document.querySelectorAll("button, [role='tab']"));
        for (const btn of buttons) {
          if (!isVisibleInLayout(btn)) continue;
          if (btn.closest(".popover") && !btn.closest(":popover-open")) continue;
          const rect = btn.getBoundingClientRect();
          if (rect.height < 36 || rect.width < 36) {
            pushUnique({
              severity: "minor",
              category: "small-touch-target",
              element: describeEl(btn),
              detail: `Touch control smaller than 36x36px (${Math.round(rect.width)}x${Math.round(rect.height)}px).`,
              metrics: { width: Math.round(rect.width), height: Math.round(rect.height) },
            });
          }
        }
      }

      // 9. Above-the-fold primary CTA visibility on composer route
      let compileButtonBottom: number | null = null;
      const compileBtn = document.querySelector('button[aria-label="Compile structured prompt"]');
      if (compileBtn && isVisibleInLayout(compileBtn)) {
        const cRect = compileBtn.getBoundingClientRect();
        compileButtonBottom = Math.round(cRect.bottom);
        if (
          checkAboveFold &&
          window.location.pathname === "/" &&
          window.scrollY === 0 &&
          cRect.bottom > vh
        ) {
          findings.push({
            severity: vh <= 600 || vw >= 1024 ? "major" : "minor",
            category: "above-the-fold-cta-clipped",
            element: 'button[aria-label="Compile structured prompt"]',
            detail: `Primary "Compile Prompt" CTA extends below initial viewport fold (bottom=${Math.round(cRect.bottom)}px > ${vh}px).`,
            metrics: {
              compileButtonTop: Math.round(cRect.top),
              compileButtonBottom: Math.round(cRect.bottom),
              viewportHeight: vh,
              overflowBelowFoldPx: Math.round(cRect.bottom - vh),
            },
          });
        }
      }

      return {
        docScrollWidth,
        innerWidth: vw,
        innerHeight: vh,
        headerHeight,
        compileButtonBottom,
        findings,
      };
    },
    { checkAboveFold: ["initial-load", "route-view", "workspace-loaded"].includes(meta.state) },
  );

  const findings: ResolutionFinding[] = snapshot.findings.map((f) => ({
    contextName: meta.contextName,
    theme: meta.theme,
    viewport: meta.viewport.label,
    width: meta.viewport.width,
    height: meta.viewport.height,
    route: meta.route,
    state: meta.state,
    ...f,
  }));

  return { snapshot, findings };
}
