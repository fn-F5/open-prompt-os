import { DEFAULT_CURATED_TEMPLATES, type PromptTemplate } from "@open-prompt-os/contracts";
import { DOCS_CATALOG, type DocArticle, HOME_AEO_FAQS } from "../content/docs-catalog.js";
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_SITE_URL,
  SITE_NAME,
  STATIC_ROUTE_SEO,
  type SeoMetadata,
  buildCanonicalUrl,
  buildDocArticleSeo,
  buildPricingSeo,
  buildTemplateDetailSeo,
  buildTemplateGallerySeo,
} from "./seo.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateLlmsTxt(
  origin = DEFAULT_SITE_URL,
  templates: readonly PromptTemplate[] = DEFAULT_CURATED_TEMPLATES,
  docs: readonly DocArticle[] = DOCS_CATALOG,
): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    "> The Operating System for Prompts — a full-lifecycle platform for compiling, diagnosing (Prompt Autopsy), reverse-engineering, organizing, and dispatching structured AI prompts across ChatGPT, Claude, Gemini, Imagen, FLUX, Veo, and Sora. Privacy by default: we never train on user prompts.",
    "",
    "## Core Product Surfaces",
    "",
    `- [Prompt Composer](${cleanOrigin}/): Guided multi-modal prompt builder (Text, Image, Video) with CO-STAR, RISE, CARE, and Chain-of-Thought frameworks and one-click dispatch.`,
    `- [Improve & Prompt Autopsy](${cleanOrigin}/improve): Structural prompt optimizer and root-cause debugger across 8 diagnostic categories.`,
    `- [Reverse Engineer](${cleanOrigin}/reverse-engineer): Upload PNG, JPEG, or WebP images to extract a 6-axis visual anatomy and reusable prompt draft.`,
    `- [Template Gallery](${cleanOrigin}/templates): Curated, permissively licensed prompt blueprints with [Variable] parameters.`,
    `- [Documentation Hub](${cleanOrigin}/docs): Answer-First prompt engineering guides and framework comparisons.`,
    `- [Pricing](${cleanOrigin}/pricing): Instant free anonymous tier plus Pro and Team plans.`,
    "",
    "## Documentation & Guides",
    "",
    ...docs.map((doc) => `- [${doc.title}](${cleanOrigin}/docs/${doc.slug}): ${doc.description}`),
    "",
    "## Curated Prompt Blueprints",
    "",
    ...templates.map(
      (tpl) =>
        `- [${tpl.title}](${cleanOrigin}/templates/${tpl.slug}) (${tpl.mode.toUpperCase()} · ${tpl.frameworkBadge}): ${tpl.useCase}`,
    ),
    "",
    "## Full Context Corpus",
    "",
    `- [Complete Markdown Knowledge Base](${cleanOrigin}/llms-full.txt): Concatenated documentation, framework matrices, diagnostic taxonomy, FAQs, and template specifications.`,
    `- [XML Sitemap](${cleanOrigin}/sitemap.xml): Machine-readable index of all public pages.`,
    "",
  ];

  return lines.join("\n");
}

export function generateLlmsFullTxt(
  origin = DEFAULT_SITE_URL,
  templates: readonly PromptTemplate[] = DEFAULT_CURATED_TEMPLATES,
  docs: readonly DocArticle[] = DOCS_CATALOG,
): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const parts: string[] = [
    `# ${SITE_NAME} — Complete Reference Corpus`,
    "",
    `Canonical URL: ${cleanOrigin}/`,
    "Privacy Policy: Zero model training on user prompts, failed outputs, or uploaded images. Telemetry redacts prompt content and secrets.",
    "",
    "---",
    "",
    "## Frequently Asked Questions (Canonical Answers)",
    "",
  ];

  for (const faq of HOME_AEO_FAQS) {
    parts.push(`### ${faq.question}`, "", faq.answer, "");
  }

  parts.push("---", "", "## Documentation Guides", "");

  for (const doc of docs) {
    parts.push(
      `### ${doc.title}`,
      `URL: ${cleanOrigin}/docs/${doc.slug}`,
      `Category: ${doc.category}`,
      "",
      `> **Direct Answer:** ${doc.tldrAnswer}`,
      "",
    );

    for (const section of doc.sections) {
      parts.push(`#### ${section.heading}`, "");
      for (const p of section.paragraphs) {
        parts.push(p, "");
      }
      if (section.bullets) {
        for (const b of section.bullets) {
          parts.push(`- ${b}`);
        }
        parts.push("");
      }
      if (section.table) {
        parts.push(`| ${section.table.headers.join(" | ")} |`);
        parts.push(`| ${section.table.headers.map(() => "---").join(" | ")} |`);
        for (const row of section.table.rows) {
          parts.push(`| ${row.join(" | ")} |`);
        }
        parts.push("");
      }
      if (section.codeBlock) {
        parts.push("```text", section.codeBlock, "```", "");
      }
    }

    if (doc.faqs.length > 0) {
      for (const faq of doc.faqs) {
        parts.push(`**Q: ${faq.question}**`, `${faq.answer}`, "");
      }
    }
  }

  parts.push("---", "", "## Curated Prompt Templates", "");

  for (const tpl of templates) {
    parts.push(
      `### ${tpl.title}`,
      `URL: ${cleanOrigin}/templates/${tpl.slug}`,
      `Mode: ${tpl.mode} | Category: ${tpl.category} | Framework: ${tpl.frameworkBadge}`,
      `Compatible Models: ${tpl.compatibleModels.join(", ")}`,
      "",
      tpl.useCase,
      "",
      "```markdown",
      tpl.compiledTemplate,
      "```",
      "",
    );
  }

  return parts.join("\n");
}

export interface SitemapUrlEntry {
  readonly loc: string;
  readonly lastmod?: string;
  readonly changefreq: "daily" | "weekly" | "monthly";
  readonly priority: string;
}

export function generateSitemapXml(
  origin = DEFAULT_SITE_URL,
  templates: readonly PromptTemplate[] = DEFAULT_CURATED_TEMPLATES,
  docs: readonly DocArticle[] = DOCS_CATALOG,
): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const urls: SitemapUrlEntry[] = [
    { loc: `${cleanOrigin}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${cleanOrigin}/improve`, changefreq: "weekly", priority: "0.9" },
    { loc: `${cleanOrigin}/reverse-engineer`, changefreq: "weekly", priority: "0.9" },
    { loc: `${cleanOrigin}/templates`, changefreq: "daily", priority: "0.9" },
    { loc: `${cleanOrigin}/docs`, changefreq: "weekly", priority: "0.9" },
    { loc: `${cleanOrigin}/pricing`, changefreq: "monthly", priority: "0.8" },
    ...docs.map((doc) => ({
      loc: `${cleanOrigin}/docs/${doc.slug}`,
      lastmod: doc.updatedAt.slice(0, 10),
      changefreq: "weekly" as const,
      priority: "0.8",
    })),
    ...templates.map((tpl) => ({
      loc: `${cleanOrigin}/templates/${tpl.slug}`,
      lastmod: tpl.updatedAt.slice(0, 10),
      changefreq: "weekly" as const,
      priority: "0.8",
    })),
  ];

  const items = urls
    .map((u) => {
      const lastmodTag = u.lastmod ? `\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(u.loc)}</loc>${lastmodTag}\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

export interface PrerenderRouteSpec {
  readonly path: string;
  readonly meta: SeoMetadata;
  readonly staticBodyHtml: string;
}

export function buildPrerenderRoutes(
  origin = DEFAULT_SITE_URL,
  templates: readonly PromptTemplate[] = DEFAULT_CURATED_TEMPLATES,
  docs: readonly DocArticle[] = DOCS_CATALOG,
): PrerenderRouteSpec[] {
  const routes: PrerenderRouteSpec[] = [
    {
      path: "/",
      meta: STATIC_ROUTE_SEO.home(HOME_AEO_FAQS, origin),
      staticBodyHtml: `<main class="mx-auto max-w-[1360px] px-4 py-10 space-y-6"><h1>Open Prompt OS — Write AI Prompts That Work on the First Try</h1><p>Turn rough ideas into structured, high-performing prompts for ChatGPT, Claude, Gemini, Imagen, FLUX, and Veo. Includes Prompt Autopsy and Image Reverse Engineering.</p><section><h2>Frequently Asked Questions</h2>${HOME_AEO_FAQS.map((f) => `<article><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></article>`).join("")}</section></main>`,
    },
    {
      path: "/improve",
      meta: STATIC_ROUTE_SEO.improve(origin),
      staticBodyHtml: `<main class="mx-auto max-w-[1360px] px-4 py-10 space-y-4"><h1>Improve &amp; Prompt Autopsy</h1><p>Optimize prompt structure or paste a failed AI output to diagnose root causes across 8 structural categories.</p></main>`,
    },
    {
      path: "/reverse-engineer",
      meta: STATIC_ROUTE_SEO.reverseEngineer(origin),
      staticBodyHtml: `<main class="mx-auto max-w-[1360px] px-4 py-10 space-y-4"><h1>Reverse Engineer Image to Prompt</h1><p>Upload any PNG, JPEG, or WebP reference image to extract a 6-axis visual breakdown and reusable prompt draft.</p></main>`,
    },
    {
      path: "/templates",
      meta: buildTemplateGallerySeo(templates, origin),
      staticBodyHtml: `<main class="mx-auto max-w-[1360px] px-4 py-10 space-y-4"><h1>AI Prompt Template Gallery</h1><ul>${templates.map((t) => `<li><a href="/templates/${escapeHtml(t.slug)}">${escapeHtml(t.title)}</a> — ${escapeHtml(t.useCase)}</li>`).join("")}</ul></main>`,
    },
    {
      path: "/pricing",
      meta: buildPricingSeo(origin),
      staticBodyHtml: `<main class="mx-auto max-w-[1360px] px-4 py-10 space-y-4"><h1>Open Prompt OS Pricing Plans</h1><p>Start free with no sign-up required, or upgrade to Pro and Team for expanded daily limits and shared libraries.</p></main>`,
    },
    {
      path: "/docs",
      meta: STATIC_ROUTE_SEO.docsHub(docs, origin),
      staticBodyHtml: `<main class="mx-auto max-w-[1360px] px-4 py-10 space-y-4"><h1>Open Prompt OS Documentation &amp; Guides</h1><ul>${docs.map((d) => `<li><a href="/docs/${escapeHtml(d.slug)}">${escapeHtml(d.title)}</a> — ${escapeHtml(d.tldrAnswer)}</li>`).join("")}</ul></main>`,
    },
    ...docs.map((doc) => ({
      path: `/docs/${doc.slug}`,
      meta: buildDocArticleSeo(doc, origin),
      staticBodyHtml: `<main class="mx-auto max-w-4xl px-4 py-10 space-y-4"><article><h1>${escapeHtml(doc.title)}</h1><p><strong>Direct Answer:</strong> ${escapeHtml(doc.tldrAnswer)}</p>${doc.sections.map((s) => `<section><h2>${escapeHtml(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</section>`).join("")}</article></main>`,
    })),
    ...templates.map((tpl) => ({
      path: `/templates/${tpl.slug}`,
      meta: buildTemplateDetailSeo(tpl, origin),
      staticBodyHtml: `<main class="mx-auto max-w-4xl px-4 py-10 space-y-4"><article><h1>${escapeHtml(tpl.title)}</h1><p>${escapeHtml(tpl.useCase)}</p><pre>${escapeHtml(tpl.compiledTemplate)}</pre></article></main>`,
    })),
  ];

  return routes;
}

export function injectSeoIntoHtml(
  templateHtml: string,
  spec: PrerenderRouteSpec,
  origin = DEFAULT_SITE_URL,
): string {
  const { meta, staticBodyHtml } = spec;
  const canonicalUrl = buildCanonicalUrl(meta.canonicalPath, origin);
  const ogImageUrl = buildCanonicalUrl(meta.ogImage ?? DEFAULT_OG_IMAGE_PATH, origin);
  const robotsValue = meta.noindex
    ? "noindex, nofollow"
    : "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";

  const jsonLdEntries = meta.jsonLd
    ? Array.isArray(meta.jsonLd)
      ? meta.jsonLd
      : [meta.jsonLd]
    : [];
  const jsonLdScripts = jsonLdEntries
    .map(
      (entry) =>
        `    <script type="application/ld+json" data-seo-jsonld="true">${JSON.stringify(entry).replace(/<\/script>/gi, "<\\/script>")}</script>`,
    )
    .join("\n");

  let html = templateHtml;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  );
  html = html.replace(
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="robots" content="${escapeHtml(robotsValue)}" />`,
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="${escapeHtml(meta.ogType ?? "website")}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`,
  );

  if (jsonLdScripts) {
    html = html.replace(/<\/head>/i, `${jsonLdScripts}\n  </head>`);
  }

  html = html.replace(/<div id="root"><\/div>/i, `<div id="root">${staticBodyHtml}</div>`);

  return html;
}
