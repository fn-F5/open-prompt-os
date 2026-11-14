import type { ComposerMode, GenerationKind, PromptGenerationItem } from "@open-prompt-os/contracts";
import { Badge, Button, Input, Tabs, toast } from "@open-prompt-os/ui-web";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Clock, Copy, ExternalLink, Search, Sparkles } from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { dispatchPrompt } from "../lib/dispatch.js";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";

const KIND_LABELS: Record<GenerationKind, string> = {
  compose: "Prompt Generation",
  refine: "Improve",
  autopsy: "Prompt Autopsy",
  reverse_engineer: "Reverse Engineer",
  guest_import: "Guest Import",
};

type KindFilter = "all" | GenerationKind;
type ModeFilter = "all" | ComposerMode;

export function HistoryPage() {
  const { isAuthenticated } = useAuthSession();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [kindFilter, setKindFilter] = React.useState<KindFilter>("all");
  const [modeFilter, setModeFilter] = React.useState<ModeFilter>("all");
  const [search, setSearch] = React.useState("");

  const activeKind = kindFilter === "all" ? undefined : kindFilter;
  const activeMode = modeFilter === "all" ? undefined : modeFilter;
  const activeSearch = search.trim() || undefined;

  const generationsQuery = useInfiniteQuery({
    queryKey: queryKeys.prompts.generations({
      kind: activeKind,
      mode: activeMode,
      search: activeSearch,
    }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      orpcClient.prompts.generations({
        kind: activeKind,
        mode: activeMode,
        search: activeSearch,
        cursor: pageParam,
        limit: 20,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });

  const saveMutation = useMutation({
    mutationFn: (item: PromptGenerationItem) => {
      const derivedTitle = item.rawInput.trim().slice(0, 80) || `${KIND_LABELS[item.kind]} Run`;
      return orpcClient.prompts.save({
        title: derivedTitle,
        rawInput: item.rawInput,
        compiledPrompt: item.compiledPrompt,
        mode: item.mode,
        framework: item.framework,
        modelId: item.modelId ?? "gpt-4.1",
        category: KIND_LABELS[item.kind],
        tags: [item.kind, item.mode],
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.prompts.all });
      toast({
        title: "Saved to Library",
        description: "Added this interaction to My Library.",
      });
    },
    onError: (err) => {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save interaction.",
      });
    },
  });

  if (!isAuthenticated) {
    return (
      <section className="rounded-2xl p-8 flat-surface text-center max-w-lg mx-auto my-8 space-y-4">
        <Badge variant="framework">Activity Ledger</Badge>
        <h1 className="text-2xl font-semibold">Sign in to access Interaction History</h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
          Review all past prompt generations, improvements, autopsies, and reverse-engineered
          prompts in your workspace.
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
          Sign in to unlock History
        </Button>
      </section>
    );
  }

  const items: PromptGenerationItem[] =
    generationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const hasFilters = kindFilter !== "all" || modeFilter !== "all" || Boolean(search.trim());

  const handleOpenInComposer = (item: PromptGenerationItem) => {
    composerActions.setMode(item.mode);
    if (item.draft) {
      composerActions.updateActiveDraft(item.draft);
    } else {
      composerActions.updateActiveDraft({
        rawInput: item.rawInput,
        modelId: item.modelId,
        framework: item.framework,
      });
    }
    navigate("/");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Badge variant="framework">Workspace Activity Ledger</Badge>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
            Interaction History
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
            Automatic chronological log of all Prompt Generation, Improve, Autopsy, and Reverse
            Engineer runs.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            ariaLabel="Interaction type filter"
            value={kindFilter}
            onValueChange={setKindFilter}
            options={[
              { value: "all", label: "All Runs" },
              { value: "compose", label: "Prompt Generation" },
              { value: "refine", label: "Improve" },
              { value: "autopsy", label: "Autopsy" },
              { value: "reverse_engineer", label: "Reverse Engineer" },
              { value: "guest_import", label: "Guest Import" },
            ]}
          />

          <Tabs
            ariaLabel="Mode filter"
            value={modeFilter}
            onValueChange={setModeFilter}
            options={[
              { value: "all", label: "All Modes" },
              { value: "text", label: "Text" },
              { value: "image", label: "Image" },
              { value: "video", label: "Video" },
            ]}
          />
        </div>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            aria-label="Search interaction history"
            placeholder="Search input notes or generated prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {generationsQuery.isLoading ? (
        <div
          aria-busy="true"
          className="rounded-xl p-10 flat-surface text-center text-sm text-[var(--text-secondary)]"
        >
          Loading interaction history...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl p-10 flat-surface text-center space-y-3">
          <div className="text-sm font-medium">No interactions found</div>
          <p className="text-xs text-[var(--text-secondary)]">
            {hasFilters
              ? "No recorded runs match your current filter criteria."
              : "Run a Prompt Generation, Improve, Autopsy, or Reverse Engineer session to see it recorded here."}
          </p>
          {hasFilters ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setKindFilter("all");
                setModeFilter("all");
                setSearch("");
              }}
            >
              Reset filters
            </Button>
          ) : (
            <Button variant="primary-inverse" size="sm" onClick={() => navigate("/")}>
              Open Composer
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl p-5 flat-surface space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="framework">{KIND_LABELS[item.kind]}</Badge>
                  <Badge variant="neutral">{item.mode.toUpperCase()}</Badge>
                  <span className="font-mono text-xs text-[var(--text-secondary)]">
                    {item.modelId ?? "default"} · {item.providerId} · {item.latencyMs}ms
                  </span>
                </div>
                <time
                  dateTime={item.createdAt}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </time>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-[var(--text-secondary)]">
                    Input / Context
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] text-xs text-[var(--text-primary)] whitespace-pre-wrap max-h-44 overflow-y-auto space-y-2">
                    {item.inputImageUrl ? (
                      <img
                        src={item.inputImageUrl}
                        alt="Reverse Engineer visual reference"
                        className="max-h-32 w-auto rounded-lg object-contain border border-[var(--separator-subtle)] bg-[var(--surface-1)]"
                      />
                    ) : null}
                    {!(item.inputImageUrl && item.rawInput.startsWith("[Image Upload:")) ? (
                      <div>{item.rawInput}</div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-[var(--text-secondary)]">
                    Generated Prompt Output
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] max-h-44 overflow-y-auto">
                    <SanitizedPromptRenderer content={item.compiledPrompt} />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--separator-subtle)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button variant="solid" size="sm" onClick={() => handleOpenInComposer(item)}>
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
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate(item)}
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>Save to Library</span>
                  </Button>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => dispatchPrompt("chatgpt", item.compiledPrompt)}
                >
                  <span>ChatGPT</span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </article>
          ))}

          {generationsQuery.hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                variant="secondary"
                disabled={generationsQuery.isFetchingNextPage}
                onClick={() => generationsQuery.fetchNextPage()}
              >
                {generationsQuery.isFetchingNextPage ? "Loading more..." : "Load more interactions"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
