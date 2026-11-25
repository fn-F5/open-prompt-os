import { Badge, Button } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Sparkles } from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { SeoHead } from "../components/seo/seo-head.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { useCardHoverAnimation } from "../hooks/use-card-parallax.js";
import { dispatchPrompt } from "../lib/dispatch.js";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { buildSharedPromptSeo } from "../lib/seo.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";

export function PublicPromptPage() {
  const { shareId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const animateCard = useCardHoverAnimation();
  const { isAuthenticated } = useAuthSession();

  const requireAuth = () => {
    if (!isAuthenticated) {
      openAuthDialog({ reason: "action_required", intendedRoute: location.pathname });
      return false;
    }
    return true;
  };

  const sharedQuery = useQuery({
    queryKey: queryKeys.prompts.shared(shareId),
    queryFn: () => orpcClient.prompts.getShared({ shareId }),
  });

  const item = sharedQuery.data;
  const seoMeta = React.useMemo(() => (item ? buildSharedPromptSeo(item) : null), [item]);

  if (!item) {
    return (
      <div
        data-animate={animateCard("publicPromptNotFound")}
        className="rounded-xl p-8 flat-surface text-center space-y-3"
      >
        <SeoHead
          meta={{
            title: "Shared Prompt Not Found | Open Prompt OS",
            description: "The requested shared prompt specification does not exist.",
            canonicalPath: `/share/${shareId}`,
            noindex: true,
          }}
        />
        <h1 className="text-xl font-semibold">Shared prompt not found</h1>
        <Button variant="primary-inverse" onClick={() => navigate("/compile")}>
          Go to Composer
        </Button>
      </div>
    );
  }

  return (
    <article
      data-animate={animateCard("publicPromptMain")}
      className="max-w-3xl mx-auto rounded-2xl p-6 sm:p-8 flat-surface space-y-5"
    >
      {seoMeta ? <SeoHead meta={seoMeta} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="framework">Shared Prompt Specification</Badge>
        <span className="font-mono text-xs text-[var(--text-secondary)]">{item.modelId}</span>
      </div>

      <h1 className="text-2xl font-semibold">{item.title}</h1>

      <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]">
        <SanitizedPromptRenderer content={item.compiledPrompt} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Button
            variant="primary-inverse"
            size="sm"
            onClick={() => {
              if (!requireAuth()) return;
              dispatchPrompt("clipboard", item.compiledPrompt);
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Specification</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!requireAuth()) return;
              composerActions.setMode(item.mode);
              composerActions.updateActiveDraft({ rawInput: item.rawInput });
              navigate("/compile");
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fork in Composer</span>
          </Button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!requireAuth()) return;
            dispatchPrompt("chatgpt", item.compiledPrompt);
          }}
        >
          <span>Open in ChatGPT</span>
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    </article>
  );
}
