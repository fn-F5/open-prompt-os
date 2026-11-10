import { Badge, Button } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Sparkles } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { dispatchPrompt } from "../lib/dispatch.js";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { composerActions } from "../state/composer-store.js";

export function PublicPromptPage() {
  const { shareId = "" } = useParams();
  const navigate = useNavigate();

  const sharedQuery = useQuery({
    queryKey: queryKeys.prompts.shared(shareId),
    queryFn: () => orpcClient.prompts.getShared({ shareId }),
  });

  const item = sharedQuery.data;

  if (!item) {
    return (
      <div className="rounded-xl p-8 flat-surface text-center space-y-3">
        <h1 className="text-xl font-semibold">Shared prompt not found</h1>
        <Button variant="primary-inverse" onClick={() => navigate("/")}>
          Go to Composer
        </Button>
      </div>
    );
  }

  return (
    <article className="max-w-3xl mx-auto rounded-2xl p-6 sm:p-8 flat-surface space-y-5">
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
            onClick={() => dispatchPrompt("clipboard", item.compiledPrompt)}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Specification</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              composerActions.setMode(item.mode);
              composerActions.updateActiveDraft({ rawInput: item.rawInput });
              navigate("/");
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fork in Composer</span>
          </Button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => dispatchPrompt("chatgpt", item.compiledPrompt)}
        >
          <span>Open in ChatGPT</span>
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    </article>
  );
}
