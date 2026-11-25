import type { SavedPromptItem } from "@open-prompt-os/contracts";
import { Badge, Button, Input, Tabs, toast } from "@open-prompt-os/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Search, Share2, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { SeoHead } from "../components/seo/seo-head.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { CARD_HOVER_ANIMATION } from "../hooks/use-card-parallax.js";
import { copyTextToClipboard, dispatchPrompt } from "../lib/dispatch.js";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";
import { HistoryPanel } from "./history-page.js";

type LibrarySectionTab = "library" | "history";

export function LibraryPage() {
  const { isAuthenticated } = useAuthSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const activeTab: LibrarySectionTab =
    searchParams.get("tab") === "history" ? "history" : "library";

  const setActiveTab = (nextTab: LibrarySectionTab) => {
    const params = new URLSearchParams(searchParams);
    if (nextTab === "library") {
      params.delete("tab");
    } else {
      params.set("tab", "history");
    }
    setSearchParams(params, { replace: true });
  };

  const [search, setSearch] = React.useState("");

  const historyQuery = useQuery({
    queryKey: queryKeys.prompts.library({ search: search || undefined }),
    queryFn: () => orpcClient.prompts.history({ search: search || undefined }),
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpcClient.prompts.delete({ id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.prompts.all });
      toast({ title: "Removed prompt from library" });
    },
  });

  const shareMutation = useMutation({
    mutationFn: (id: string) => orpcClient.prompts.share({ id }),
    onSuccess: async (res) => {
      await copyTextToClipboard(res.shareUrl);
      qc.invalidateQueries({ queryKey: queryKeys.prompts.all });
      toast({
        title: "Public share link copied",
        description: res.shareUrl,
      });
    },
  });

  const noindexMeta = React.useMemo(
    () => ({
      title: "My Library | Open Prompt OS",
      description: "Private prompt library for Open Prompt OS workspace.",
      canonicalPath: "/library",
      noindex: true,
    }),
    [],
  );

  if (!isAuthenticated) {
    return (
      <section
        data-animate={CARD_HOVER_ANIMATION.libraryAuthGate}
        className="rounded-2xl p-8 flat-surface text-center max-w-lg mx-auto my-8 space-y-4"
      >
        <SeoHead meta={noindexMeta} />
        <h1 className="text-2xl font-semibold">Sign in to access My Library</h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
          Organize, search, categorize, and share your saved prompts across any model. Your current
          guest prompt will automatically migrate when you sign in.
        </p>
        <Button
          variant="primary-inverse"
          onClick={() =>
            openAuthDialog({
              reason: "protected_route",
              intendedRoute: location.pathname,
            })
          }
        >
          Sign in to unlock Library
        </Button>
      </section>
    );
  }

  const items: SavedPromptItem[] = historyQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <SeoHead meta={noindexMeta} />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">My Library</h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
            {activeTab === "library"
              ? "Your private, RLS-isolated system of record for operational prompts."
              : "Automatic chronological log of all Prompt Generation, Improve, Autopsy, and Reverse Engineer runs."}
          </p>
        </div>

        <Tabs
          ariaLabel="Library sections"
          value={activeTab}
          onValueChange={setActiveTab}
          options={[
            { value: "library", label: "Library" },
            { value: "history", label: "History" },
          ]}
        />
      </div>

      {activeTab === "history" ? (
        <HistoryPanel />
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="search"
              aria-label="Search saved prompts"
              maxLength={200}
              placeholder="Search saved prompts by title, variable, or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {items.length === 0 ? (
            <div
              data-animate={CARD_HOVER_ANIMATION.libraryEmpty}
              className="rounded-xl p-10 flat-surface text-center space-y-3"
            >
              <div className="text-sm font-medium">No saved prompts found</div>
              <p className="text-xs text-[var(--text-secondary)]">
                Compile a prompt in the Composer and click "Save to Library" to build your
                repository.
              </p>
              <Button variant="primary-inverse" size="sm" onClick={() => navigate("/compile")}>
                Open Composer
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => (
                <article
                  key={item.id}
                  data-animate={CARD_HOVER_ANIMATION.libraryItem}
                  className="rounded-xl p-5 flat-surface flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="framework">{item.category}</Badge>
                        <Badge variant="neutral">{item.mode.toUpperCase()}</Badge>
                      </div>
                      <span className="font-mono text-xs text-[var(--text-secondary)]">
                        {item.modelId}
                      </span>
                    </div>

                    <h2 className="text-base font-semibold">{item.title}</h2>

                    <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] max-h-40 overflow-y-auto">
                      <SanitizedPromptRenderer content={item.compiledPrompt} />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--separator-subtle)] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="solid"
                        size="sm"
                        onClick={() => {
                          composerActions.setMode(item.mode);
                          composerActions.updateActiveDraft({
                            rawInput: item.rawInput,
                            modelId: item.modelId,
                            framework: item.framework,
                          });
                          navigate("/compile");
                        }}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Open in Composer</span>
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => dispatchPrompt("clipboard", item.compiledPrompt)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => shareMutation.mutate(item.id)}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share</span>
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => dispatchPrompt("chatgpt", item.compiledPrompt)}
                      >
                        <span>ChatGPT</span>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        aria-label={`Delete ${item.title}`}
                        onClick={() => deleteMutation.mutate(item.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
