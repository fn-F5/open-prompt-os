import { DEFAULT_CURATED_TEMPLATES } from "@open-prompt-os/contracts";
import type { Hono } from "hono";
import type { ApiEnv } from "../app-env.js";
import { listTemplates } from "../services/template-service.js";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const STATIC_PUBLIC_PATHS = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/improve", changefreq: "weekly", priority: "0.9" },
  { path: "/reverse-engineer", changefreq: "weekly", priority: "0.9" },
  { path: "/templates", changefreq: "daily", priority: "0.9" },
  { path: "/docs", changefreq: "weekly", priority: "0.9" },
  { path: "/pricing", changefreq: "monthly", priority: "0.8" },
  { path: "/docs/getting-started", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/prompt-frameworks-costar-rise-care-cot", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/prompt-autopsy-and-debugging", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/image-and-video-prompt-engineering", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/reverse-engineering-prompts", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/variables-and-reusable-templates", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/privacy-and-security", changefreq: "weekly", priority: "0.8" },
] as const;

export function registerSeoRoutes(app: Hono<ApiEnv>, webOrigins: readonly string[]): void {
  const origin = (webOrigins[0] || "https://openpromptos.com").replace(/\/+$/, "");

  app.get("/api/seo/sitemap.xml", async (c) => {
    let templates = [...DEFAULT_CURATED_TEMPLATES];
    try {
      const dbTemplates = await listTemplates();
      if (dbTemplates.length > 0) {
        templates = dbTemplates;
      }
    } catch {
      // Fallback to static curated catalog when DB is unavailable
    }

    const entries = [
      ...STATIC_PUBLIC_PATHS.map(
        (p) =>
          `  <url>\n    <loc>${escapeXml(`${origin}${p.path}`)}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
      ),
      ...templates.map(
        (tpl) =>
          `  <url>\n    <loc>${escapeXml(`${origin}/templates/${tpl.slug}`)}</loc>\n    <lastmod>${escapeXml(tpl.updatedAt.slice(0, 10))}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
      ),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
    return c.body(xml, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  });
}
