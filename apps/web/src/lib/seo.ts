import {
  DEFAULT_PRICING_PLANS,
  type PromptTemplate,
  type SavedPromptItem,
} from "@open-prompt-os/contracts";
import type { DocArticle, DocFaqItem } from "../content/docs-catalog.js";

export const DEFAULT_SITE_URL = "https://openpromptos.com";
export const SITE_NAME = "Open Prompt OS";
export const DEFAULT_OG_IMAGE_PATH = "/og-default.svg";

export interface SeoMetadata {
  readonly title: string;
  readonly description: string;
  readonly canonicalPath: string;
  readonly ogType?: "website" | "article";
  readonly ogImage?: string;
  readonly noindex?: boolean;
  readonly keywords?: readonly string[];
  readonly jsonLd?: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;
}

export function getSiteOrigin(override?: string): string {
  const envOrigin =
    override ??
    (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_SITE_URL
      ? (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_SITE_URL
      : undefined) ??
    (typeof process !== "undefined" ? process.env?.VITE_PUBLIC_SITE_URL : undefined);

  const normalized = (envOrigin || DEFAULT_SITE_URL).trim().replace(/\/+$/, "");
  return normalized || DEFAULT_SITE_URL;
}

export function buildCanonicalUrl(path: string, origin = getSiteOrigin()): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return cleanPath === "/" ? `${origin}/` : `${origin}${cleanPath}`;
}

export function buildOrganizationSchema(origin = getSiteOrigin()): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: `${origin}/`,
    logo: `${origin}/favicon.svg`,
    sameAs: ["https://github.com/fn-F5/open-prompt-os"],
    description:
      "The Operating System for Prompts — create, diagnose, reverse-engineer, organize, and operationalize structured AI prompts across ChatGPT, Claude, Gemini, Imagen, FLUX, and Veo.",
  };
}

export function buildWebSiteSchema(origin = getSiteOrigin()): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${origin}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}/templates?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildSoftwareApplicationSchema(
  origin = getSiteOrigin(),
  options?: { readonly path?: string; readonly name?: string; readonly description?: string },
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: options?.name ?? SITE_NAME,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    datePublished: "2026-01-01",
    dateModified: "2026-11-19",
    url: buildCanonicalUrl(options?.path ?? "/", origin),
    description:
      options?.description ??
      "Freemium prompt engineering workbench for compiling structured CO-STAR, RISE, CARE, and Chain-of-Thought prompts, running Prompt Autopsy diagnostics, and reverse-engineering images into prompts.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Instant free access with no sign-up required",
    },
    featureList: [
      "Guided Multi-Modal Prompt Compiler (Text, Image, Video)",
      "CO-STAR, RISE, CARE, and Chain-of-Thought Frameworks",
      "Prompt Autopsy 8-Category Root-Cause Diagnostics",
      "6-Axis Image-to-Prompt Reverse Engineering",
      "One-Click Send to ChatGPT, Claude, and Gemini",
      "Zero Model Training Privacy Guarantee",
    ],
  };
}

export function buildFaqPageSchema(faqs: readonly DocFaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function buildHowToSchema(options: {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly steps: readonly { readonly name: string; readonly text: string }[];
  readonly origin?: string;
}): Record<string, unknown> {
  const origin = options.origin ?? getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: options.name,
    description: options.description,
    url: buildCanonicalUrl(options.path, origin),
    step: options.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

export function buildBreadcrumbSchema(
  crumbs: readonly { readonly name: string; readonly path: string }[],
  origin = getSiteOrigin(),
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: buildCanonicalUrl(crumb.path, origin),
    })),
  };
}

export function buildDocArticleSeo(doc: DocArticle, origin = getSiteOrigin()): SeoMetadata {
  const canonicalPath = `/docs/${doc.slug}`;
  const schemas: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: doc.title,
      description: doc.description,
      abstract: doc.tldrAnswer,
      articleSection: doc.category,
      dateModified: doc.updatedAt,
      keywords: doc.keywords.join(", "),
      url: buildCanonicalUrl(canonicalPath, origin),
      author: {
        "@type": "Organization",
        name: SITE_NAME,
      },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        logo: {
          "@type": "ImageObject",
          url: `${origin}/favicon.svg`,
        },
      },
    },
    buildBreadcrumbSchema(
      [
        { name: "Home", path: "/" },
        { name: "Docs", path: "/docs" },
        { name: doc.shortTitle, path: canonicalPath },
      ],
      origin,
    ),
  ];

  if (doc.faqs.length > 0) {
    schemas.push(buildFaqPageSchema(doc.faqs));
  }

  return {
    title: `${doc.title} | ${SITE_NAME} Docs`,
    description: doc.description,
    canonicalPath,
    ogType: "article",
    keywords: doc.keywords,
    jsonLd: schemas,
  };
}

export function buildTemplateDetailSeo(
  template: PromptTemplate,
  origin = getSiteOrigin(),
): SeoMetadata {
  const canonicalPath = `/templates/${template.slug}`;
  return {
    title: `${template.title} — ${template.frameworkBadge} Prompt Template | ${SITE_NAME}`,
    description: `${template.useCase} Compatible with ${template.compatibleModels.join(", ")}. Load in Composer or copy with one click.`,
    canonicalPath,
    ogType: "article",
    keywords: [
      template.title,
      template.category,
      template.framework,
      ...template.compatibleModels,
      "AI prompt template",
    ],
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: template.title,
        description: template.useCase,
        articleSection: template.category,
        dateModified: template.updatedAt,
        url: buildCanonicalUrl(canonicalPath, origin),
        about: template.compatibleModels.map((model) => ({
          "@type": "Thing",
          name: model,
        })),
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
        },
      },
      buildBreadcrumbSchema(
        [
          { name: "Home", path: "/" },
          { name: "Templates", path: "/templates" },
          { name: template.title, path: canonicalPath },
        ],
        origin,
      ),
    ],
  };
}

export function buildTemplateGallerySeo(
  templates: readonly PromptTemplate[],
  origin = getSiteOrigin(),
): SeoMetadata {
  return {
    title: `AI Prompt Template Gallery — CO-STAR, RISE, CARE & Video Blueprints | ${SITE_NAME}`,
    description:
      "Browse curated, permissively licensed prompt blueprints for Engineering, Product, SQL, Marketing, Studio Image, and 24fps Cinema Video.",
    canonicalPath: "/templates",
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Open Prompt OS Template Gallery",
        url: buildCanonicalUrl("/templates", origin),
        description:
          "Curated, indexable operational prompt specifications ready for one-click reuse across ChatGPT, Claude, Gemini, Imagen, FLUX, and Veo.",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: templates.length,
          itemListElement: templates.map((tpl, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: tpl.title,
            url: buildCanonicalUrl(`/templates/${tpl.slug}`, origin),
          })),
        },
      },
      buildBreadcrumbSchema(
        [
          { name: "Home", path: "/" },
          { name: "Templates", path: "/templates" },
        ],
        origin,
      ),
    ],
  };
}

export function buildPricingSeo(origin = getSiteOrigin()): SeoMetadata {
  return {
    title: `Pricing Plans — Free, Pro & Team Prompt Engineering | ${SITE_NAME}`,
    description:
      "Start compiling structured prompts for free with no sign-up. Upgrade to Pro or Team for higher daily capacity, Prompt Autopsy, and shared workspaces.",
    canonicalPath: "/pricing",
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: SITE_NAME,
        description:
          "Full-lifecycle AI prompt engineering studio with Prompt Compiler, Prompt Autopsy, Reverse Engineer, and Prompt Library.",
        offers: DEFAULT_PRICING_PLANS.map((plan) => ({
          "@type": "Offer",
          name: `${plan.name} Plan`,
          price: String(plan.monthlyPriceUsd),
          priceCurrency: "USD",
          description: plan.description,
          url: buildCanonicalUrl("/pricing", origin),
        })),
      },
      buildBreadcrumbSchema(
        [
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
        ],
        origin,
      ),
    ],
  };
}

export function buildSharedPromptSeo(item: SavedPromptItem, origin = getSiteOrigin()): SeoMetadata {
  const canonicalPath = `/share/${item.shareId ?? item.id}`;
  return {
    title: `${item.title} — Shared Prompt Specification | ${SITE_NAME}`,
    description: `Reusable ${item.mode} prompt specification calibrated for ${item.modelId} using ${item.framework.toUpperCase()} structure.`,
    canonicalPath,
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: item.title,
      url: buildCanonicalUrl(canonicalPath, origin),
      dateModified: item.updatedAt,
      keywords: item.tags.join(", "),
    },
  };
}

export const STATIC_ROUTE_SEO = {
  home: (faqs: readonly DocFaqItem[], origin = getSiteOrigin()): SeoMetadata => ({
    title: "Open Prompt OS — Write AI Prompts That Work on the First Try",
    description:
      "Turn rough ideas into structured AI prompts for ChatGPT, Claude, Gemini, Imagen, FLUX, and Veo with Prompt Autopsy and Image Reverse Engineering.",
    canonicalPath: "/",
    ogType: "website",
    keywords: [
      "prompt engineering tool",
      "AI prompt compiler",
      "CO-STAR prompt builder",
      "prompt autopsy",
      "reverse engineer image prompt",
    ],
    jsonLd: [
      buildOrganizationSchema(origin),
      buildWebSiteSchema(origin),
      buildSoftwareApplicationSchema(origin),
      buildFaqPageSchema(faqs),
    ],
  }),
  improve: (origin = getSiteOrigin()): SeoMetadata => ({
    title: `Improve & Prompt Autopsy — Debug Hallucinations & Fix Prompts | ${SITE_NAME}`,
    description:
      "Paste any prompt and failed AI response to run Prompt Autopsy across 8 diagnostic categories and generate a structured, anti-hallucination prompt.",
    canonicalPath: "/improve",
    ogType: "website",
    jsonLd: [
      buildSoftwareApplicationSchema(origin, {
        path: "/improve",
        name: "Open Prompt OS — Improve & Prompt Autopsy",
        description:
          "Diagnostic prompt optimizer that detects missing context, conflicting constraints, weak output format, and hallucinations.",
      }),
      buildHowToSchema({
        origin,
        name: "How to diagnose a failed AI prompt with Prompt Autopsy",
        description:
          "Compare your original prompt against a failed AI output to surface root causes and produce a corrected specification.",
        path: "/improve",
        steps: [
          {
            name: "Paste your original prompt",
            text: "Enter the prompt you sent to ChatGPT, Claude, or Gemini into the Original Prompt editor.",
          },
          {
            name: "Switch to Prompt Autopsy and paste the failed output",
            text: "Add the hallucinated, off-tone, or broken-format AI response so Autopsy can inspect the drift.",
          },
          {
            name: "Review 8-category diagnostic findings and apply the fix",
            text: "Inspect critical and warning findings, then copy or Accept into Composer in one click.",
          },
        ],
      }),
    ],
  }),
  reverseEngineer: (origin = getSiteOrigin()): SeoMetadata => ({
    title: `Reverse Engineer Image to Prompt — 6-Axis Visual Extractor | ${SITE_NAME}`,
    description:
      "Upload any PNG, JPEG, or WebP image to extract lighting, lens optics, style, composition, negative guardrails, and a reusable prompt draft.",
    canonicalPath: "/reverse-engineer",
    ogType: "website",
    jsonLd: [
      buildSoftwareApplicationSchema(origin, {
        path: "/reverse-engineer",
        name: "Open Prompt OS — Reverse Engineer Image to Prompt",
        description:
          "6-axis visual prompt extractor converting reference images into customizable Image and Video generation prompts.",
      }),
      buildHowToSchema({
        origin,
        name: "How to reverse engineer a reference image into a prompt",
        description:
          "Extract Subject, Style, Lighting, Camera Optics, Mood, and Negative Guardrails from any PNG, JPEG, or WebP image.",
        path: "/reverse-engineer",
        steps: [
          {
            name: "Choose Image or Video Motion Prompt mode",
            text: "Select whether you want a still image blueprint or a temporal video prompt.",
          },
          {
            name: "Upload a PNG, JPEG, or WebP reference image",
            text: "Drop an image up to 4 MB and optionally specify focus notes like focal length or color grading.",
          },
          {
            name: "Copy or load the reconstructed prompt into Composer",
            text: "Paste the copy-ready prompt directly into your generator or refine it further in Composer.",
          },
        ],
      }),
    ],
  }),
  docsHub: (docs: readonly DocArticle[], origin = getSiteOrigin()): SeoMetadata => ({
    title: `Documentation & Prompt Engineering Guides | ${SITE_NAME}`,
    description:
      "Guides, framework comparisons (CO-STAR, RISE, CARE, Chain-of-Thought), Prompt Autopsy tutorials, and Answer-First references for Open Prompt OS.",
    canonicalPath: "/docs",
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Open Prompt OS Documentation & Guides",
        url: buildCanonicalUrl("/docs", origin),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: docs.length,
          itemListElement: docs.map((doc, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: doc.title,
            url: buildCanonicalUrl(`/docs/${doc.slug}`, origin),
          })),
        },
      },
      buildBreadcrumbSchema(
        [
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
        ],
        origin,
      ),
    ],
  }),
};
