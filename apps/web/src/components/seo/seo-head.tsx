import * as React from "react";
import {
  SITE_NAME,
  SOCIAL_OG_IMAGE_PATH,
  type SeoMetadata,
  buildCanonicalUrl,
  getSiteOrigin,
} from "../../lib/seo.js";

function upsertMetaTag(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLinkTag(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Synchronizes document title, canonical URL, Open Graph / Twitter cards,
 * robots directives, and Schema.org JSON-LD scripts for the active route.
 */
export function SeoHead({ meta }: { readonly meta: SeoMetadata }) {
  const serializedJsonLd = React.useMemo(() => {
    if (!meta.jsonLd) return "";
    const entries = Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd];
    return JSON.stringify(entries);
  }, [meta.jsonLd]);

  const keywordsText = meta.keywords?.join(", ") ?? "";

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const origin = getSiteOrigin();
    const canonicalUrl = buildCanonicalUrl(meta.canonicalPath, origin);
    const ogImageUrl = meta.ogImage
      ? meta.ogImage.startsWith("http")
        ? meta.ogImage
        : buildCanonicalUrl(meta.ogImage, origin)
      : buildCanonicalUrl(SOCIAL_OG_IMAGE_PATH, origin);
    const robotsValue = meta.noindex
      ? "noindex, nofollow"
      : "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";

    document.title = meta.title;
    upsertMetaTag("name", "description", meta.description);
    upsertMetaTag("name", "robots", robotsValue);

    if (keywordsText) {
      upsertMetaTag("name", "keywords", keywordsText);
    }

    upsertLinkTag("canonical", canonicalUrl);

    // Open Graph
    upsertMetaTag("property", "og:site_name", SITE_NAME);
    upsertMetaTag("property", "og:type", meta.ogType ?? "website");
    upsertMetaTag("property", "og:title", meta.title);
    upsertMetaTag("property", "og:description", meta.description);
    upsertMetaTag("property", "og:url", canonicalUrl);
    upsertMetaTag("property", "og:image", ogImageUrl);
    if (!meta.noindex) {
      upsertMetaTag("property", "article:published_time", "2026-01-01T00:00:00Z");
      upsertMetaTag("property", "article:modified_time", "2026-11-19T00:00:00Z");
    }

    // Twitter / X Card
    upsertMetaTag("name", "twitter:card", "summary_large_image");
    upsertMetaTag("name", "twitter:title", meta.title);
    upsertMetaTag("name", "twitter:description", meta.description);
    upsertMetaTag("name", "twitter:image", ogImageUrl);

    // Structured Data (Schema.org JSON-LD)
    const existingScripts = document.head.querySelectorAll('script[data-seo-jsonld="true"]');
    for (const node of existingScripts) {
      node.remove();
    }

    if (serializedJsonLd) {
      const parsed = JSON.parse(serializedJsonLd) as Record<string, unknown>[];
      for (const schemaObj of parsed) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-seo-jsonld", "true");
        script.textContent = JSON.stringify(schemaObj);
        document.head.appendChild(script);
      }
    }
  }, [
    meta.title,
    meta.description,
    meta.canonicalPath,
    meta.ogType,
    meta.ogImage,
    meta.noindex,
    keywordsText,
    serializedJsonLd,
  ]);

  return null;
}
