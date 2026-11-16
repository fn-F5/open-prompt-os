import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_CURATED_TEMPLATES } from "@open-prompt-os/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type * as React from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../app-routes.js";
import { AppNavbar, MarketingNavbar } from "../components/navigation/navbar.js";
import { SeoHead } from "../components/seo/seo-head.js";
import { DOCS_CATALOG, HOME_AEO_FAQS } from "../content/docs-catalog.js";
import { authClient, setAuthSessionForTest } from "../lib/auth-client.js";
import { resetOrpcTestState } from "../lib/orpc.js";
import { createAppQueryClient } from "../lib/query-client.js";
import {
  buildPrerenderRoutes,
  generateLlmsFullTxt,
  generateLlmsTxt,
  generateSitemapXml,
  injectSeoIntoHtml,
} from "../lib/seo-static-generator.js";
import { clearStorageForTest } from "../lib/storage.js";
import { BillingReturnPage } from "../routes/billing-return-page.js";
import { ComposerPage } from "../routes/composer-page.js";
import { DocsArticlePage } from "../routes/docs-article-page.js";
import { DocsHubPage } from "../routes/docs-hub-page.js";
import { HistoryPage } from "../routes/history-page.js";
import { ImproveAutopsyPage } from "../routes/improve-autopsy-page.js";
import { LibraryPage } from "../routes/library-page.js";
import { NotFoundPage } from "../routes/not-found-page.js";
import { PricingPage } from "../routes/pricing-page.js";
import { PublicPromptPage } from "../routes/public-prompt-page.js";
import { ReverseEngineerPage } from "../routes/reverse-engineer-page.js";
import { ProfileSettingsPage } from "../routes/settings/profile-page.js";
import { TemplateDetailPage } from "../routes/template-detail-page.js";
import { TemplateGalleryPage } from "../routes/template-gallery-page.js";
import { composerActions } from "../state/composer-store.js";

function renderWithRouter(ui: React.ReactNode, initialEntries: string[], routePath: string) {
  const qc = createAppQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={routePath} element={ui} />
          <Route path="/" element={<div data-testid="composer-dest">Composer</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function readJsonLdPayloads(): Array<Record<string, unknown>> {
  const nodes = Array.from(document.head.querySelectorAll('script[data-seo-jsonld="true"]'));
  return nodes.map((node) => JSON.parse(node.textContent || "{}") as Record<string, unknown>);
}

describe("Navigation Placement, Docs Hub, SEO Metadata & AEO Assets", () => {
  beforeEach(async () => {
    clearStorageForTest();
    resetOrpcTestState();
    composerActions.rehydrateFromStorage();
    await authClient.signOut();
    document.head.innerHTML = "";
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  describe("1. Top Menu & Bottom Footer Placement", () => {
    it("excludes Docs and Tour from MarketingNavbar desktop and mobile menus", () => {
      const qc = createAppQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/"]}>
            <MarketingNavbar />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const primaryNav = screen.getByRole("navigation", { name: "Primary marketing navigation" });
      const desktopLinks = within(primaryNav).getAllByRole("link");
      expect(desktopLinks.map((link) => link.textContent)).toEqual([
        "Compiler",
        "Improve & Autopsy",
        "Reverse Engineer",
        "Templates",
        "Pricing",
      ]);

      expect(within(primaryNav).queryByRole("link", { name: /Docs/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /Tour/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /Replay interactive tour/i })).toBeNull();

      // Open mobile menu and verify Docs and Tour are absent there too
      fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
      const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
      const mobileLinks = within(mobileNav).getAllByRole("link");
      expect(mobileLinks.map((link) => link.textContent)).toEqual([
        "Compiler",
        "Improve & Autopsy",
        "Reverse Engineer",
        "Templates",
        "Pricing",
      ]);
      expect(within(mobileNav).queryByRole("link", { name: /Docs/i })).toBeNull();
      expect(within(mobileNav).queryByRole("button", { name: /Tour/i })).toBeNull();
    });

    it("excludes Docs and Tour from AppNavbar workspace navigation", () => {
      act(() => {
        setAuthSessionForTest({
          id: "u_nav",
          email: "nav@example.com",
          name: "Nav User",
          plan: "free",
          spaceId: "sp_nav",
          spaceName: "Nav Space",
          hasPasskey: false,
        });
      });

      const qc = createAppQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/"]}>
            <AppNavbar />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const workspaceNav = screen.getByRole("navigation", { name: "Workspace navigation" });
      expect(within(workspaceNav).queryByRole("link", { name: /Docs/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /Tour/i })).toBeNull();
    });

    it("keeps Docs & Guides exclusively in the bottom footer and navigates to /docs", async () => {
      const qc = createAppQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/"]}>
            <AppRoutes />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const header = screen.getByRole("banner");
      expect(within(header).queryByRole("link", { name: /Docs/i })).toBeNull();
      expect(within(header).queryByRole("button", { name: /Tour/i })).toBeNull();

      const footer = screen.getByRole("contentinfo", { name: "Site footer" });
      expect(within(footer).getByText("Docs & Guides")).toBeInTheDocument();

      const docsHubLink = within(footer).getByRole("link", { name: "Documentation Hub" });
      expect(docsHubLink).toHaveAttribute("href", "/docs");
      expect(
        within(footer).getByRole("link", { name: "CO-STAR, RISE, CARE & CoT" }),
      ).toHaveAttribute("href", "/docs/prompt-frameworks-costar-rise-care-cot");
      expect(within(footer).getByRole("link", { name: "Prompt Autopsy Guide" })).toHaveAttribute(
        "href",
        "/docs/prompt-autopsy-and-debugging",
      );
      expect(within(footer).getByRole("link", { name: "Zero-Training Privacy" })).toHaveAttribute(
        "href",
        "/docs/privacy-and-security",
      );
      expect(within(footer).getByRole("link", { name: "llms.txt" })).toHaveAttribute(
        "href",
        "/llms.txt",
      );
      expect(within(footer).getByRole("link", { name: "sitemap.xml" })).toHaveAttribute(
        "href",
        "/sitemap.xml",
      );

      // Clicking bottom footer Documentation Hub opens /docs cleanly
      fireEvent.click(docsHubLink);
      await waitFor(() => {
        expect(screen.getByText("Open Prompt OS Documentation")).toBeInTheDocument();
      });
    });
  });

  describe("2. SeoHead & Per-Route Metadata + JSON-LD Schemas", () => {
    it("updates document head tags, canonical URL, OG/Twitter cards, robots, and JSON-LD via SeoHead", () => {
      const { rerender } = render(
        <SeoHead
          meta={{
            title: "Custom Guide | Open Prompt OS",
            description: "Answer-first guide description.",
            canonicalPath: "/docs/getting-started",
            ogType: "article",
            keywords: ["prompt engineering", "CO-STAR"],
            jsonLd: {
              "@context": "https://schema.org",
              "@type": "TechArticle",
              headline: "Custom Guide",
            },
          }}
        />,
      );

      expect(document.title).toBe("Custom Guide | Open Prompt OS");
      expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
        "Answer-first guide description.",
      );
      expect(document.head.querySelector('meta[name="keywords"]')?.getAttribute("content")).toBe(
        "prompt engineering, CO-STAR",
      );
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
        "https://openpromptos.com/docs/getting-started",
      );
      expect(document.head.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe(
        "article",
      );
      expect(
        document.head.querySelector('meta[name="twitter:card"]')?.getAttribute("content"),
      ).toBe("summary_large_image");
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain(
        "index, follow",
      );

      const schemas = readJsonLdPayloads();
      expect(schemas).toHaveLength(1);
      expect(schemas[0]?.["@type"]).toBe("TechArticle");

      rerender(
        <SeoHead
          meta={{
            title: "Private Library | Open Prompt OS",
            description: "Private route",
            canonicalPath: "/library",
            noindex: true,
          }}
        />,
      );

      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
        "noindex, nofollow",
      );
      expect(readJsonLdPayloads()).toHaveLength(0);
    });

    it("emits Organization, WebSite, SoftwareApplication, and FAQPage JSON-LD on ComposerPage", () => {
      renderWithRouter(<ComposerPage />, ["/"], "/");

      expect(document.title).toContain("Open Prompt OS");
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
        "https://openpromptos.com/",
      );
      const types = readJsonLdPayloads().map((s) => s["@type"]);
      expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);

      const faqSchema = readJsonLdPayloads().find((s) => s["@type"] === "FAQPage");
      expect(Array.isArray(faqSchema?.mainEntity)).toBe(true);
      expect((faqSchema?.mainEntity as unknown[]).length).toBe(HOME_AEO_FAQS.length);
    });

    it("emits HowTo and SoftwareApplication JSON-LD on ImproveAutopsyPage and ReverseEngineerPage", () => {
      const improveView = renderWithRouter(<ImproveAutopsyPage />, ["/improve"], "/improve");
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
        "https://openpromptos.com/improve",
      );
      expect(readJsonLdPayloads().map((s) => s["@type"])).toEqual(["SoftwareApplication", "HowTo"]);
      improveView.unmount();

      renderWithRouter(<ReverseEngineerPage />, ["/reverse-engineer"], "/reverse-engineer");
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
        "https://openpromptos.com/reverse-engineer",
      );
      expect(readJsonLdPayloads().map((s) => s["@type"])).toEqual(["SoftwareApplication", "HowTo"]);
    });

    it("emits CollectionPage + ItemList JSON-LD and syncs mode/search query params on TemplateGalleryPage", async () => {
      renderWithRouter(
        <TemplateGalleryPage />,
        ["/templates?mode=image&q=Monochrome"],
        "/templates",
      );

      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: "Industrial Monochrome Hardware Keyframe" }),
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("link", { name: "Staff Architecture RFC & Trade-off Matrix" }),
      ).not.toBeInTheDocument();

      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
        "https://openpromptos.com/templates",
      );
      expect(readJsonLdPayloads().map((s) => s["@type"])).toEqual([
        "CollectionPage",
        "BreadcrumbList",
      ]);
    });

    it("emits Product JSON-LD on PricingPage and CreativeWork on PublicPromptPage", async () => {
      const pricingView = renderWithRouter(<PricingPage />, ["/pricing"], "/pricing");
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
        "https://openpromptos.com/pricing",
      );
      expect(readJsonLdPayloads().map((s) => s["@type"])).toEqual(["Product", "BreadcrumbList"]);
      pricingView.unmount();

      renderWithRouter(<PublicPromptPage />, ["/share/share_1"], "/share/:shareId");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Fork in Composer/i })).toBeInTheDocument();
      });
      expect(readJsonLdPayloads().map((s) => s["@type"])).toEqual(["CreativeWork"]);
    });

    it("sets noindex, nofollow on private and utility routes", () => {
      const routes: Array<{ el: React.ReactNode; path: string; pattern: string }> = [
        { el: <HistoryPage />, path: "/history", pattern: "/history" },
        { el: <LibraryPage />, path: "/library", pattern: "/library" },
        { el: <ProfileSettingsPage />, path: "/settings/profile", pattern: "/settings/profile" },
        { el: <BillingReturnPage />, path: "/billing/return", pattern: "/billing/return" },
        { el: <NotFoundPage />, path: "/404", pattern: "/404" },
      ];

      for (const entry of routes) {
        const view = renderWithRouter(entry.el, [entry.path], entry.pattern);
        expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
          "noindex, nofollow",
        );
        view.unmount();
      }
    });
  });

  describe("3. Docs Hub, Docs Article & Template Detail Experiences", () => {
    it("renders DocsHubPage with search/category filtering, FAQs, and one-click Try in Composer", () => {
      renderWithRouter(<DocsHubPage />, ["/docs"], "/docs");

      expect(screen.getByText("Open Prompt OS Documentation")).toBeInTheDocument();
      expect(
        screen.getByText("Prompt Frameworks Compared: CO-STAR, RISE, CARE & Chain-of-Thought"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Frequently Asked Questions" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Debugging & Autopsy" }));
      expect(
        screen.getByText("Prompt Autopsy: Diagnosing & Fixing Failed AI Outputs"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Studio Image & 24fps Cinema Video Prompt Engineering"),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "All" }));
      fireEvent.change(screen.getByLabelText("Search documentation"), {
        target: { value: "zzzz-no-match" },
      });
      expect(screen.getByText(/No documentation guides matched/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Reset docs filters/i }));

      const tryButtons = screen.getAllByRole("button", { name: /Try in Composer/i });
      const firstTry = tryButtons[0];
      if (!firstTry) throw new Error("Expected Try in Composer button");
      fireEvent.click(firstTry);
      expect(screen.getByTestId("composer-dest")).toBeInTheDocument();
    });

    it("renders DocsArticlePage with Direct Answer box, table, code copy, related links, and 404 fallback", async () => {
      const valid = renderWithRouter(
        <DocsArticlePage />,
        ["/docs/prompt-frameworks-costar-rise-care-cot"],
        "/docs/:docSlug",
      );

      expect(
        screen.getByText("Prompt Frameworks Compared: CO-STAR, RISE, CARE & Chain-of-Thought"),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Direct Answer Summary")).toBeInTheDocument();
      expect(screen.getByText("Framework Decision Matrix")).toBeInTheDocument();
      expect(screen.getByText("CO-STAR")).toBeInTheDocument();
      expect(screen.getByText("Related Prompt Blueprints")).toBeInTheDocument();
      expect(screen.getByText("Continue Reading")).toBeInTheDocument();

      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
        "https://openpromptos.com/docs/prompt-frameworks-costar-rise-care-cot",
      );
      expect(readJsonLdPayloads().map((s) => s["@type"])).toEqual([
        "TechArticle",
        "BreadcrumbList",
        "FAQPage",
      ]);

      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining("# OPERATIONAL PROMPT SPECIFICATION"),
        );
      });

      valid.unmount();

      renderWithRouter(<DocsArticlePage />, ["/docs/non-existent-guide"], "/docs/:docSlug");
      expect(screen.getByText("Guide not found")).toBeInTheDocument();
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
        "noindex, nofollow",
      );
    });

    it("renders TemplateDetailPage with detected variables, calibrated models, and related blueprints", async () => {
      renderWithRouter(
        <TemplateDetailPage />,
        ["/templates/staff-architecture-rfc-review"],
        "/templates/:templateSlug",
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Staff Architecture RFC & Trade-off Matrix" }),
        ).toBeInTheDocument();
      });

      expect(screen.getAllByText("[System_Proposal]").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("[Scale_Target]").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Calibrated Models")).toBeInTheDocument();
      expect(screen.getByText("Related Prompt Blueprints")).toBeInTheDocument();
      expect(readJsonLdPayloads().map((s) => s["@type"])).toEqual([
        "TechArticle",
        "BreadcrumbList",
      ]);
    });
  });

  describe("4. AEO Generators, Prerender HTML Escaping & robots.txt", () => {
    it("generates valid llms.txt, llms-full.txt, sitemap.xml, and prerendered HTML for all public routes", () => {
      const llms = generateLlmsTxt("https://openpromptos.com");
      expect(llms).toContain("# Open Prompt OS");
      expect(llms).toContain(
        "https://openpromptos.com/docs/prompt-frameworks-costar-rise-care-cot",
      );
      expect(llms).toContain("https://openpromptos.com/templates/staff-architecture-rfc-review");

      const llmsFull = generateLlmsFullTxt("https://openpromptos.com");
      for (const doc of DOCS_CATALOG) {
        expect(llmsFull).toContain(doc.title);
        expect(llmsFull).toContain(doc.tldrAnswer);
      }
      for (const tpl of DEFAULT_CURATED_TEMPLATES) {
        expect(llmsFull).toContain(tpl.title);
        expect(llmsFull).toContain(tpl.slug);
      }

      const sitemap = generateSitemapXml("https://openpromptos.com");
      expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(sitemap).toContain("<loc>https://openpromptos.com/</loc>");
      expect(sitemap).toContain("<loc>https://openpromptos.com/docs</loc>");
      expect(sitemap).toContain(
        "<loc>https://openpromptos.com/templates/sql-query-optimization-and-index-audit</loc>",
      );

      const shellHtml = `<!doctype html><html><head><title>Default</title><meta name="description" content="Default" /><meta name="robots" content="index" /><link rel="canonical" href="https://openpromptos.com/" /><meta property="og:type" content="website" /><meta property="og:title" content="Default" /><meta property="og:description" content="Default" /><meta property="og:url" content="https://openpromptos.com/" /><meta property="og:image" content="https://openpromptos.com/og-default.svg" /><meta name="twitter:title" content="Default" /><meta name="twitter:description" content="Default" /><meta name="twitter:image" content="https://openpromptos.com/og-default.svg" /></head><body><div id="root"></div></body></html>`;

      const routes = buildPrerenderRoutes("https://openpromptos.com");
      expect(routes.length).toBe(6 + DOCS_CATALOG.length + DEFAULT_CURATED_TEMPLATES.length);

      const docsRoute = routes.find((r) => r.path === "/docs/prompt-autopsy-and-debugging");
      if (!docsRoute)
        throw new Error("Missing prerender spec for /docs/prompt-autopsy-and-debugging");

      const rendered = injectSeoIntoHtml(shellHtml, docsRoute, "https://openpromptos.com");
      expect(rendered).toContain(
        "<title>Prompt Autopsy: Diagnosing &amp; Fixing Failed AI Outputs | Open Prompt OS Docs</title>",
      );
      expect(rendered).toContain(
        '<link rel="canonical" href="https://openpromptos.com/docs/prompt-autopsy-and-debugging" />',
      );
      expect(rendered).toContain('data-seo-jsonld="true"');
      expect(rendered).toContain("Direct Answer:");

      // Verify closing </script> tags inside JSON-LD payloads are escaped safely
      const scriptInjectionHtml = injectSeoIntoHtml(
        shellHtml,
        {
          path: "/test",
          meta: {
            title: 'A & B "Quoted" <Tag>',
            description: "Desc",
            canonicalPath: "/test",
            jsonLd: { "@type": "Thing", name: "</script><script>alert(1)</script>" },
          },
          staticBodyHtml: "<main>Static</main>",
        },
        "https://openpromptos.com",
      );
      expect(scriptInjectionHtml).not.toContain("</script><script>alert(1)");
      expect(scriptInjectionHtml).toContain("<\\/script>");
      expect(scriptInjectionHtml).toContain("&amp;");
      expect(scriptInjectionHtml).toContain("&lt;Tag&gt;");
    });

    it("exposes AI search crawlers and sitemap directive in public/robots.txt", () => {
      const robotsPath = path.resolve(import.meta.dirname, "../../public/robots.txt");
      const content = fs.readFileSync(robotsPath, "utf8");

      for (const bot of [
        "OAI-SearchBot",
        "ChatGPT-User",
        "GPTBot",
        "ClaudeBot",
        "PerplexityBot",
        "Google-Extended",
        "Applebot-Extended",
      ]) {
        expect(content).toContain(`User-agent: ${bot}`);
      }
      expect(content).toContain("Disallow: /history");
      expect(content).toContain("Disallow: /library");
      expect(content).toContain("Disallow: /api/");
      expect(content).toContain("Sitemap: https://openpromptos.com/sitemap.xml");
    });
  });
});
