import type { ComposerMode, PromptTemplate } from "@open-prompt-os/contracts";
import { Badge, Button, Input, Tabs, toast } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search, Sparkles } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { trackEvent } from "../lib/telemetry.js";
import { composerActions } from "../state/composer-store.js";

export function TemplateGalleryPage() {
  const navigate = useNavigate();
  const [modeFilter, setModeFilter] = React.useState<"all" | ComposerMode>("all");
  const [search, setSearch] = React.useState("");

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

  const handleUseTemplate = (template: PromptTemplate) => {
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
    navigate("/");
  };

  const templates = templatesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Badge variant="framework">Indexable Blueprints</Badge>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
            Template Gallery
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
            Curated, permissively licensed operational prompt templates ready for one-click reuse.
          </p>
        </div>

        <Tabs
          ariaLabel="Filter templates by mode"
          value={modeFilter}
          onValueChange={setModeFilter}
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
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl p-10 flat-surface text-center space-y-3">
          <div className="text-sm font-medium">No templates matched your filter</div>
          <p className="text-xs text-[var(--text-secondary)]">
            Clear your search query or switch mode tabs to explore all blueprints.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setModeFilter("all");
              setSearch("");
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
              className="rounded-xl p-5 flat-surface flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="framework">{tpl.frameworkBadge}</Badge>
                  <Badge variant="neutral">{tpl.mode.toUpperCase()}</Badge>
                </div>

                <div>
                  <Link
                    to={`/templates/${tpl.slug}`}
                    className="text-base sm:text-lg font-semibold hover:underline focus-ring rounded"
                  >
                    {tpl.title}
                  </Link>
                  <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
                    {tpl.useCase}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] font-mono text-xs text-[var(--text-secondary)]">
                  {tpl.preview}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-[var(--text-secondary)]">Models:</span>
                  {tpl.compatibleModels.map((m) => (
                    <Badge key={m} variant="neutral">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--separator-subtle)] flex items-center justify-between gap-2">
                <Link
                  to={`/templates/${tpl.slug}`}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-ring rounded py-1"
                >
                  <span>Inspect specification</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>

                <Button
                  variant="solid"
                  size="sm"
                  onClick={() => handleUseTemplate(tpl)}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Use template</span>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
