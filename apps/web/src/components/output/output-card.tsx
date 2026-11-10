import type { ComposePromptOutput, ComposerDraft } from "@open-prompt-os/contracts";
import { tokenizePromptSyntax } from "@open-prompt-os/core";
import { Badge, Button, toast } from "@open-prompt-os/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Wrench,
} from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";
import { copyTextToClipboard, dispatchPrompt } from "../../lib/dispatch.js";
import { OrpcClientError, orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { trackEvent } from "../../lib/telemetry.js";
import { composerActions } from "../../state/composer-store.js";
import { AuthGate } from "../auth/auth-gate.js";

export interface OutputCardProps {
  readonly draft: ComposerDraft;
  readonly output: ComposePromptOutput | null;
  readonly streamingBuffer: string | null;
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly onQuickStartSelect?: (presetText: string) => void;
}

/**
 * Renders structured prompt text with raw HTML disabled (React text nodes only)
 * and semantic theme-aware badges for [Variables], headers, and constraints.
 */
export function SanitizedPromptRenderer({ content }: { readonly content: string }) {
  const tokens = React.useMemo(() => tokenizePromptSyntax(content), [content]);

  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm sm:text-base leading-relaxed text-[var(--text-primary)] m-0">
      {tokens.map((tok, index) => {
        const key = `${tok.type}-${index}`;
        if (tok.type === "variable") {
          return (
            <code
              key={key}
              className="font-mono px-2 py-0.5 rounded-md bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)] font-semibold text-sm"
            >
              {tok.value}
            </code>
          );
        }
        if (tok.type === "section_header") {
          return (
            <strong key={key} className="font-bold tracking-tight text-[var(--accent-text)]">
              {tok.value}
            </strong>
          );
        }
        if (tok.type === "persona") {
          return (
            <span
              key={key}
              className="underline decoration-[var(--accent-primary)] font-semibold text-[var(--text-primary)]"
            >
              {tok.value}
            </span>
          );
        }
        if (tok.type === "constraint") {
          return (
            <span key={key} className="font-medium text-[var(--text-primary)]">
              {tok.value}
            </span>
          );
        }
        return <React.Fragment key={key}>{tok.value}</React.Fragment>;
      })}
    </pre>
  );
}

export function OutputCard({
  draft,
  output,
  streamingBuffer,
  isPending,
  error,
  onRetry,
}: OutputCardProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [copied, setCopied] = React.useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!output) throw new Error("No compiled prompt to save.");
      return orpcClient.prompts.save({
        title: draft.rawInput.trim().slice(0, 80) || "Compiled Prompt Specification",
        rawInput: draft.rawInput,
        compiledPrompt: output.compiledPrompt,
        mode: draft.mode,
        framework: draft.framework ?? "costar",
        modelId: output.modelId,
        category:
          draft.mode === "image"
            ? "Visuals"
            : draft.mode === "video"
              ? "Motion"
              : "Engineering & Strategy",
        tags: [draft.mode, draft.framework ?? "costar"],
      });
    },
    onSuccess: () => {
      trackEvent("prompt_saved", { mode: draft.mode });
      qc.invalidateQueries({ queryKey: queryKeys.prompts.all });
      toast({
        title: "Saved to My Library",
        description: "Your compiled specification is now saved in your workspace.",
      });
    },
  });

  const handleCopy = async (text: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied to clipboard" });
    }
  };

  // Error State
  if (error && !isPending) {
    const requestId = error instanceof OrpcClientError ? error.requestId : "req_local_fallback";
    return (
      <section
        aria-label="Prompt compilation error"
        role="alert"
        className="mt-6 rounded-2xl p-6 bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/40 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-base">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Could not compile prompt</span>
          </div>
          <span className="font-mono text-xs opacity-80">ID: {requestId}</span>
        </div>
        <p className="text-sm sm:text-base opacity-90">{error.message}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="solid" size="sm" onClick={onRetry}>
            <RefreshCw className="w-4 h-4" />
            <span>Retry compilation</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleCopy(draft.rawInput)}>
            <Copy className="w-4 h-4" />
            <span>Copy original draft</span>
          </Button>
        </div>
      </section>
    );
  }

  // Submitting / Streaming State
  if (isPending) {
    return (
      <section
        aria-label="Compiling prompt specification"
        aria-busy="true"
        className="mt-6 rounded-2xl p-6 flat-surface space-y-4 min-h-[220px]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-primary)] animate-ping" />
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Structuring your prompt for {draft.modelId ?? "target model"}...
            </span>
          </div>
          <Badge variant="framework">{(draft.framework ?? "costar").toUpperCase()}</Badge>
        </div>

        {streamingBuffer ? (
          <div className="p-5 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]">
            <SanitizedPromptRenderer content={streamingBuffer} />
          </div>
        ) : (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 w-2/5 rounded bg-[var(--surface-2)]" />
            <div className="h-4 w-4/5 rounded bg-[var(--surface-2)]" />
            <div className="h-4 w-3/4 rounded bg-[var(--surface-2)]" />
            <div className="h-24 w-full rounded-xl bg-[var(--surface-2)]" />
          </div>
        )}
      </section>
    );
  }

  // Idle State
  if (!output) {
    return null;
  }

  // Completed Output Card
  return (
    <section
      aria-label="Compiled prompt output"
      className="mt-6 rounded-3xl p-6 sm:p-8 glow-card space-y-5"
    >
      <div className="sr-only" aria-live="polite">
        Prompt specification compiled for {output.modelId} with {output.detectedVariables.length}{" "}
        variables.
      </div>

      {/* Header & Provider/Model Metadata Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--separator-subtle)]">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="framework">Ready-to-Use Prompt</Badge>
          <span className="text-sm text-[var(--text-secondary)] font-mono tabular-nums">
            {output.providerId}/{output.modelId}
            {output.latencyMs > 0 ? ` · ${output.latencyMs}ms` : ""}
          </span>
          {output.healedFromFailure ? (
            <Badge variant="diagnostic">Auto-healed failover active</Badge>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => composerActions.resetCurrentPrompt()}
          aria-label="Start new prompt"
        >
          <RotateCcw className="w-4 h-4" />
          <span>New Prompt</span>
        </Button>
      </div>

      {/* Detected Variables Bar */}
      {output.detectedVariables.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)] mr-1">
            Customizable variables:
          </span>
          {output.detectedVariables.map((v) => (
            <code
              key={v}
              className="font-mono text-sm px-2.5 py-1 rounded-lg bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)] font-semibold"
            >
              [{v}]
            </code>
          ))}
        </div>
      ) : null}

      {/* Sanitized Specification Body */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] overflow-x-auto">
        <SanitizedPromptRenderer content={output.compiledPrompt} />
      </div>

      {/* Action & One-Click Dispatch Bar */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="solid"
            size="md"
            onClick={() => dispatchPrompt("clipboard", output.compiledPrompt)}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>Copy Prompt</span>
          </Button>

          <AuthGate
            reason="save_prompt"
            onSafeReplay={() => saveMutation.mutate()}
            onAuthenticatedAction={() => saveMutation.mutate()}
          >
            <Button variant="secondary" size="md" disabled={saveMutation.isPending}>
              <Bookmark className="w-4 h-4 text-[var(--accent-text)]" />
              <span>{saveMutation.isPending ? "Saving..." : "Save to Library"}</span>
            </Button>
          </AuthGate>

          <Button
            variant="secondary"
            size="md"
            onClick={() =>
              navigate("/improve", {
                state: { preloadPrompt: output.compiledPrompt },
              })
            }
          >
            <Wrench className="w-4 h-4 text-[var(--cyan-text)]" />
            <span>Improve / Autopsy</span>
          </Button>
        </div>

        {/* One-Click Deep-Link Dispatch Targets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)] mr-1">
            Open directly in:
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dispatchPrompt("chatgpt", output.compiledPrompt)}
          >
            <span>ChatGPT</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dispatchPrompt("claude", output.compiledPrompt)}
          >
            <span>Claude</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dispatchPrompt("gemini", output.compiledPrompt)}
          >
            <span>Gemini</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
