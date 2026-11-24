import { DEFAULT_CURATED_TEMPLATES } from "@open-prompt-os/contracts";
import { analyzePromptVariables } from "@open-prompt-os/core";
import { Badge, Button, toast } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Copy, Sparkles } from "lucide-react";
import * as React from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { SeoHead } from "../components/seo/seo-head.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { CARD_HOVER_ANIMATION } from "../hooks/use-card-parallax.js";
import { copyTextToClipboard } from "../lib/dispatch.js";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { buildTemplateDetailSeo } from "../lib/seo.js";
import { trackEvent } from "../lib/telemetry.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";

export function TemplateDetailPage() {
  const { templateSlug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthSession();

  const requireAuth = () => {
    if (!isAuthenticated) {
      openAuthDialog({ reason: "action_required", intendedRoute: location.pathname });
      return false;
    }
    return true;
  };

  const detailQuery = useQuery({
    queryKey: queryKeys.templates.detail(templateSlug),
    queryFn: () => orpcClient.templates.getBySlug({ slug: templateSlug }),
  });

  const tpl = detailQuery.data;

  const detectedVars = React.useMemo(
    () => (tpl ? analyzePromptVariables(tpl.compiledTemplate).detectedVariables : []),
    [tpl],
  );

  const seoMeta = React.useMemo(() => (tpl ? buildTemplateDetailSeo(tpl) : null), [tpl]);

  const relatedTemplates = React.useMemo(
    () =>
      tpl
        ? DEFAULT_CURATED_TEMPLATES.filter(
            (candidate) =>
              candidate.slug !== tpl.slug &&
              (candidate.mode === tpl.mode || candidate.category === tpl.category),
          ).slice(0, 3)
        : [],
    [tpl],
  );

  if (detailQuery.isPending) {
    return (
      <div
        aria-busy="true"
        data-animate={CARD_HOVER_ANIMATION.templateDetailLoading}
        className="rounded-xl p-8 flat-surface animate-pulse h-64"
      />
    );
  }

  if (!tpl) {
    return (
      <div
        data-animate={CARD_HOVER_ANIMATION.templateDetailNotFound}
        className="rounded-xl p-8 flat-surface text-center space-y-3"
      >
        <SeoHead
          meta={{
            title: "Template Not Found | Open Prompt OS",
            description: `The requested template "${templateSlug}" does not exist.`,
            canonicalPath: `/templates/${templateSlug}`,
            noindex: true,
          }}
        />
        <h1 className="text-xl font-semibold">Template not found</h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
          The requested template slug "{templateSlug}" does not exist.
        </p>
        <Link
          to="/templates"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
        >
          Back to Template Gallery
        </Link>
      </div>
    );
  }

  return (
    <article className="space-y-6 max-w-4xl mx-auto">
      {seoMeta ? <SeoHead meta={seoMeta} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]"
        >
          <Link to="/" className="hover:text-[var(--text-primary)] focus-ring rounded">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <Link to="/templates" className="hover:text-[var(--text-primary)] focus-ring rounded">
            Templates
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-[var(--text-primary)] font-medium">{tpl.category}</span>
        </nav>

        <Link
          to="/templates"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-ring rounded"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Template Gallery</span>
        </Link>
      </div>

      <div
        data-animate={CARD_HOVER_ANIMATION.templateDetailMain}
        className="rounded-2xl p-6 sm:p-8 flat-surface space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="framework">{tpl.frameworkBadge}</Badge>
            <Badge variant="neutral">{tpl.category}</Badge>
            <Badge variant="neutral">{tpl.mode.toUpperCase()}</Badge>
          </div>
          <span className="text-xs font-mono text-[var(--text-secondary)]">
            Updated {tpl.updatedAt.slice(0, 10)}
          </span>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{tpl.title}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{tpl.useCase}</p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]">
          <SanitizedPromptRenderer content={tpl.compiledTemplate} />
        </div>

        {/* Variable Inventory & Compatible Models for AEO/SEO clarity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Customizable [Variables]
            </h2>
            {detectedVars.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detectedVars.map((v) => (
                  <code
                    key={v}
                    className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--surface-1)] text-[var(--accent-text)] border border-[var(--separator-subtle)]"
                  >
                    [{v}]
                  </code>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">
                Ready to run directly without placeholder substitution.
              </p>
            )}
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Calibrated Models
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {tpl.compatibleModels.map((model) => (
                <Badge key={model} variant="neutral">
                  {model}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Specification Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tpl.defaultDraft.persona ? (
            <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Role / Persona
              </div>
              <div className="text-xs text-[var(--text-primary)]">{tpl.defaultDraft.persona}</div>
            </div>
          ) : null}
          {tpl.defaultDraft.audience ? (
            <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Target Audience
              </div>
              <div className="text-xs text-[var(--text-primary)]">{tpl.defaultDraft.audience}</div>
            </div>
          ) : null}
          {tpl.defaultDraft.format ? (
            <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Output Format
              </div>
              <div className="text-xs text-[var(--text-primary)]">{tpl.defaultDraft.format}</div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--separator-subtle)]">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              if (!requireAuth()) return;
              const ok = await copyTextToClipboard(tpl.compiledTemplate);
              if (ok) toast({ title: "Copied template specification" });
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy raw specification</span>
          </Button>

          <Button
            variant="solid"
            onClick={() => {
              if (!requireAuth()) return;
              composerActions.applyTemplateDraft(tpl.defaultDraft);
              trackEvent("template_used", {
                slug: tpl.slug,
                mode: tpl.mode,
                framework: tpl.framework,
              });
              navigate("/compile");
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span>Use template in Composer</span>
          </Button>
        </div>
      </div>

      {/* Related Templates Internal Linking */}
      {relatedTemplates.length > 0 ? (
        <section aria-labelledby="related-templates-heading" className="space-y-3">
          <h2
            id="related-templates-heading"
            className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            Related Prompt Blueprints
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {relatedTemplates.map((rel) => (
              <Link
                key={rel.slug}
                to={`/templates/${rel.slug}`}
                data-animate={CARD_HOVER_ANIMATION.templateDetailRelated}
                className="p-4 rounded-xl flat-surface hover:border-[var(--separator-strong)] transition-colors space-y-2 focus-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="framework">{rel.frameworkBadge}</Badge>
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                </div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{rel.title}</div>
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{rel.useCase}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
