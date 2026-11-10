import type { ComposerDraft, PromptFramework, PromptLength } from "@open-prompt-os/contracts";
import { Badge, Button, Tabs } from "@open-prompt-os/ui-web";
import { Lock, SlidersHorizontal, X } from "lucide-react";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { AuthGate } from "../auth/auth-gate.js";

const FRAMEWORK_OPTIONS: Array<{
  readonly id: PromptFramework;
  readonly badge: string;
  readonly description: string;
}> = [
  {
    id: "costar",
    badge: "Inspired by COSTAR",
    description: "Structures Context, Objective, Style, Tone, Audience, and Response format.",
  },
  {
    id: "rise",
    badge: "Inspired by RISE",
    description: "Defines Role, Input scope, Step-by-step instructions, and Expectations.",
  },
  {
    id: "care",
    badge: "Inspired by CARE",
    description: "Focuses on Context, Action, Result criteria, and concrete Examples.",
  },
  {
    id: "cot",
    badge: "Inspired by Chain-of-Thought",
    description: "Guides the model to reason step by step before writing the final answer.",
  },
  {
    id: "none",
    badge: "Direct Prompt",
    description: "Minimal structure for fast, straightforward instructions.",
  },
];

const LENGTH_OPTIONS: Array<{ readonly value: PromptLength; readonly label: string }> = [
  { value: "short", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "In-Depth" },
];

export interface AdvancedControlsProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly draft: ComposerDraft;
  readonly onUpdateDraft: (patch: Partial<ComposerDraft>) => void;
}

export function AdvancedControls({
  open,
  onOpenChange,
  draft,
  onUpdateDraft,
}: AdvancedControlsProps) {
  const { isAuthenticated } = useAuthSession();

  if (!open) return null;

  const activeFramework = draft.framework ?? "costar";
  const activeLength = draft.advanced.length ?? "balanced";
  const creativity = draft.advanced.creativity ?? 0.3;

  return (
    <section
      aria-label="Advanced prompt engineering controls"
      className="mt-4 rounded-2xl p-5 sm:p-6 bg-[var(--surface-1)] border border-[var(--separator-strong)] space-y-5"
    >
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-5 h-5 text-[var(--accent-text)]" />
          <h3 className="text-base font-semibold">Advanced Prompt Settings</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Close advanced controls"
          onClick={() => onOpenChange(false)}
        >
          <X className="w-4 h-4" />
          <span>Close</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2.5">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">
            Prompt Framework
          </span>
          <div className="space-y-2">
            {FRAMEWORK_OPTIONS.map((fw) => {
              const isSelected = activeFramework === fw.id;
              return (
                <button
                  key={fw.id}
                  type="button"
                  onClick={() => onUpdateDraft({ framework: fw.id })}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors focus-ring cursor-pointer ${
                    isSelected
                      ? "bg-[var(--accent-subtle-bg)] border-[var(--accent-primary)]"
                      : "bg-[var(--surface-2)] border-[var(--separator-subtle)] hover:border-[var(--separator-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={isSelected ? "framework" : "neutral"}>{fw.badge}</Badge>
                    {isSelected ? (
                      <span className="text-xs font-semibold text-[var(--accent-text)]">
                        Selected
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{fw.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <span className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
              Output Detail Level
            </span>
            <Tabs
              ariaLabel="Output detail level"
              value={activeLength}
              onValueChange={(length) =>
                onUpdateDraft({
                  advanced: { ...draft.advanced, length },
                })
              }
              options={LENGTH_OPTIONS}
              className="w-full justify-between"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <label htmlFor="creativity-slider" className="font-semibold text-[var(--text-primary)]">
                Creativity vs. Precision
              </label>
              <span className="font-mono text-sm font-semibold text-[var(--accent-text)] tabular-nums">
                {creativity.toFixed(2)}
              </span>
            </div>
            <input
              id="creativity-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={creativity}
              onChange={(e) =>
                onUpdateDraft({
                  advanced: {
                    ...draft.advanced,
                    creativity: Number.parseFloat(e.target.value),
                  },
                })
              }
              className="w-full accent-[var(--accent-primary)] cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1">
              <span>0.0 Strict & Factual</span>
              <span>0.5 Balanced</span>
              <span>1.0 Creative</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span>Anti-Hallucination Guardrail Pack</span>
                  {!isAuthenticated ? (
                    <Lock className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                  ) : null}
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Automatically adds strict verification rules so the model flags unknowns instead
                  of guessing.
                </p>
              </div>
              <AuthGate
                reason="advanced_controls"
                onAuthenticatedAction={() => {
                  const rule = "Verify every claim and flag missing context before answering";
                  if (!draft.guardrails.includes(rule)) {
                    onUpdateDraft({ guardrails: [...draft.guardrails, rule] });
                  }
                }}
              >
                <Button variant="secondary" size="sm">
                  {isAuthenticated ? "Apply Pack" : "Unlock"}
                </Button>
              </AuthGate>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
