import type { Hono } from "hono";
import type { ApiEnv } from "../app-env.js";

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
  { path: "/docs", changefreq: "weekly", priority: "0.9" },
  { path: "/pricing", changefreq: "monthly", priority: "0.8" },
  { path: "/docs/getting-started", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/prompt-frameworks-costar-rise-care-cot", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/prompt-autopsy-and-debugging", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/image-and-video-prompt-engineering", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/reverse-engineering-prompts", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/privacy-and-security", changefreq: "weekly", priority: "0.8" },
] as const;

export function registerSeoRoutes(app: Hono<ApiEnv>, webOrigins: readonly string[]): void {
  const origin = (webOrigins[0] || "https://openpromptos.com").replace(/\/+$/, "");

  app.get("/api/seo/sitemap.xml", async (c) => {
    const entries = STATIC_PUBLIC_PATHS.map(
      (p) =>
        `  <url>\n    <loc>${escapeXml(`${origin}${p.path}`)}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
    return c.body(xml, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  });
}
