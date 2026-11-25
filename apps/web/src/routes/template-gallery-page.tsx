import {
  type ComposerMode,
  DEFAULT_CURATED_TEMPLATES,
  type PromptTemplate,
} from "@open-prompt-os/contracts";
import { Badge, Button, Input, Tabs, toast } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search } from "lucide-react";
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { SeoHead } from "../components/seo/seo-head.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { CARD_HOVER_ANIMATION } from "../hooks/use-card-parallax.js";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { buildTemplateGallerySeo } from "../lib/seo.js";
import { trackEvent } from "../lib/telemetry.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";

function parseModeParam(value: string | null): "all" | ComposerMode {
  if (value === "text" || value === "image" || value === "video") return value;
  return "all";
}

function renderTemplatePreview(preview: string): React.ReactNode {
  const parts = preview.split(/(\[[A-Za-z0-9_]+\])/g);
  let offset = 0;
  return parts.map((part) => {
    const key = `${offset}:${part}`;
    offset += part.length;
    if (/^\[[A-Za-z0-9_]+\]$/.test(part)) {
      return (
        <span
          key={key}
          className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] font-medium"
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

export function TemplateGalleryPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modeFilter, setModeFilter] = React.useState<"all" | ComposerMode>(() =>
    parseModeParam(searchParams.get("mode")),
  );
  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");

  const updateFilters = (nextMode: "all" | ComposerMode, nextSearch: string) => {
    setModeFilter(nextMode);
    setSearch(nextSearch);
    const params = new URLSearchParams();
    if (nextMode !== "all") params.set("mode", nextMode);
    if (nextSearch.trim()) params.set("q", nextSearch.trim());
    setSearchParams(params, { replace: true });
  };

  const templatesQuery = useQuery({
    queryKey: queryKeys.templates.list({
      mode: modeFilter === "all" ? undefined : modeFilter,
      search: search || undefined,
    }),
    queryFn: () =>
      orpcClient.templates.list({
        mode: modeFilter === "all" ? undefined : modeFilter,
        search: search || undefined,
      }),
  });

  const applyTemplateAndNavigate = (template: PromptTemplate) => {
    composerActions.applyTemplateDraft(template.defaultDraft);
    trackEvent("template_used", {
      slug: template.slug,
      mode: template.mode,
      framework: template.framework,
    });
    toast({
      title: `Loaded "${template.title}"`,
      description: "Template parameters and framework applied in composer.",
    });
    navigate("/compile");
  };

  const handleUseTemplate = (template: PromptTemplate) => {
    if (!isAuthenticated) {
      openAuthDialog({
        reason: "navbar_signin",
        mode: "signin",
        safeReplayAction: () => applyTemplateAndNavigate(template),
      });
      return;
    }
    applyTemplateAndNavigate(template);
  };

  const templates = templatesQuery.data ?? [];
  const seoMeta = React.useMemo(
    () => buildTemplateGallerySeo(templates.length > 0 ? templates : DEFAULT_CURATED_TEMPLATES),
    [templates],
  );

  return (
    <div className="space-y-6">
      <SeoHead meta={seoMeta} />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Template Gallery</h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
            Curated, permissively licensed operational prompt templates ready for one-click reuse.
          </p>
        </div>

        <Tabs
          ariaLabel="Filter templates by mode"
          value={modeFilter}
          onValueChange={(next) => updateFilters(next, search)}
          options={[
            { value: "all", label: "All Modes" },
            { value: "text", label: "Text / Work" },
            { value: "image", label: "Image" },
            { value: "video", label: "Video" },
          ]}
        />
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="search"
          aria-label="Search templates"
          placeholder="Search by role, use case, or category..."
          value={search}
          onChange={(e) => updateFilters(modeFilter, e.target.value)}
          className="pl-10"
        />
      </div>

      {templates.length === 0 ? (
        <div
          data-animate={CARD_HOVER_ANIMATION.templateGalleryEmpty}
          className="rounded-xl p-10 flat-surface text-center space-y-3"
        >
          <div className="text-sm font-medium">No templates matched your filter</div>
          <p className="text-xs text-[var(--text-secondary)]">
            Clear your search query or switch mode tabs to explore all blueprints.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              updateFilters("all", "");
            }}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((tpl) => (
            <article
              key={tpl.slug}
              data-animate={CARD_HOVER_ANIMATION.templateGalleryItem}
              className="rounded-xl p-5 flat-surface flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <Badge variant="framework">{tpl.frameworkBadge}</Badge>
                  <Badge variant="neutral">{tpl.mode.toUpperCase()}</Badge>
                </div>
                <button
                  type="button"
                  aria-label={`Use template: ${tpl.title}`}
                  title="Use template"
                  onClick={() => handleUseTemplate(tpl)}
                  className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-subtle)] hover:border-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white transition-colors duration-150 cursor-pointer focus-ring"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div>
                <h2 className="text-base sm:text-lg font-semibold">{tpl.title}</h2>
                <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
                  {tpl.useCase}
                </p>
              </div>

              <div className="mt-auto select-none rounded-xl bg-[var(--surface-2)]/80 border border-[var(--separator-subtle)] border-l-2 border-l-[var(--accent-primary)]/60 p-3.5 space-y-1.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Blueprint Preview
                </div>
                <p className="font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
                  {renderTemplatePreview(tpl.preview)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
