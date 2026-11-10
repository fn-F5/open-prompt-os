import { Badge, Button, toast } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Sparkles } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { copyTextToClipboard } from "../lib/dispatch.js";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { trackEvent } from "../lib/telemetry.js";
import { composerActions } from "../state/composer-store.js";

export function TemplateDetailPage() {
  const { templateSlug = "" } = useParams();
  const navigate = useNavigate();

  const detailQuery = useQuery({
    queryKey: queryKeys.templates.detail(templateSlug),
    queryFn: () => orpcClient.templates.getBySlug({ slug: templateSlug }),
  });

  const tpl = detailQuery.data;

  if (detailQuery.isPending) {
    return (
      <div aria-busy="true" className="rounded-xl p-8 flat-surface animate-pulse h-64" />
    );
  }

  if (!tpl) {
    return (
      <div className="rounded-xl p-8 flat-surface text-center space-y-3">
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
      <Link
        to="/templates"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-ring rounded"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Template Gallery</span>
      </Link>

      <div className="rounded-2xl p-6 sm:p-8 flat-surface space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="framework">{tpl.frameworkBadge}</Badge>
            <Badge variant="neutral">{tpl.category}</Badge>
            <Badge variant="neutral">{tpl.mode.toUpperCase()}</Badge>
          </div>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{tpl.title}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{tpl.useCase}</p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]">
          <SanitizedPromptRenderer content={tpl.compiledTemplate} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--separator-subtle)]">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
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
              composerActions.applyTemplateDraft(tpl.defaultDraft);
              trackEvent("template_used", {
                slug: tpl.slug,
                mode: tpl.mode,
                framework: tpl.framework,
              });
              navigate("/");
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span>Use template in Composer</span>
          </Button>
        </div>
      </div>
    </article>
  );
}
