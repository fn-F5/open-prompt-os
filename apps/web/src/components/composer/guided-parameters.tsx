import type { ComposerDraft } from "@open-prompt-os/contracts";
import { Button, Input } from "@open-prompt-os/ui-web";
import { Check, Plus, Sliders, X } from "lucide-react";
import * as React from "react";

export type ParameterKey =
  | "goal"
  | "audience"
  | "constraints"
  | "format"
  | "persona"
  | "tone"
  | "guardrails";

interface ParameterDescriptor {
  readonly key: ParameterKey;
  readonly label: string;
  readonly isMulti: boolean;
  readonly placeholder: string;
  readonly suggestions: readonly string[];
}

const PARAMETER_DESCRIPTORS: readonly ParameterDescriptor[] = [
  {
    key: "goal",
    label: "Goal",
    isMulti: false,
    placeholder: "e.g., Produce a step-by-step launch plan with clear owners",
    suggestions: [
      "Find root causes & fix plan",
      "Write an executive decision memo",
      "Create high-converting landing copy",
    ],
  },
  {
    key: "audience",
    label: "Audience",
    isMulti: false,
    placeholder: "e.g., Senior engineers & product leads",
    suggestions: [
      "Senior Engineers & Architects",
      "Executive Leadership & Founders",
      "Non-technical Customers",
    ],
  },
  {
    key: "constraints",
    label: "Constraints",
    isMulti: true,
    placeholder: "Add a rule (e.g., Keep under 300 words)",
    suggestions: [
      "No generic filler or buzzwords",
      "Compare options in a table",
      "Include concrete code examples",
    ],
  },
  {
    key: "format",
    label: "Format",
    isMulti: false,
    placeholder: "e.g., Summary, comparison table, and checklist",
    suggestions: [
      "Markdown with clear headings & checklist",
      "Strict JSON schema output",
      "16:9 widescreen, 50mm lens, cinematic light",
    ],
  },
  {
    key: "persona",
    label: "Role / Persona",
    isMulti: false,
    placeholder: "e.g., Staff Systems Architect",
    suggestions: [
      "Principal Systems Architect",
      "Senior Product Strategist",
      "Creative Visual Director",
    ],
  },
  {
    key: "tone",
    label: "Tone",
    isMulti: false,
    placeholder: "e.g., Direct, practical, and clear",
    suggestions: [
      "Direct, analytical, zero-fluff",
      "Warm, persuasive, and human",
      "Crisp studio editorial",
    ],
  },
  {
    key: "guardrails",
    label: "Guardrails",
    isMulti: true,
    placeholder: "Add a safety or quality rule",
    suggestions: [
      "Never invent facts or citations",
      "Mark missing info as [Variable]",
      "Ask before assuming edge cases",
    ],
  },
];

export interface GuidedParametersProps {
  readonly draft: ComposerDraft;
  readonly onUpdateDraft: (patch: Partial<ComposerDraft>) => void;
  readonly disabled?: boolean;
}

export function GuidedParameters({
  draft,
  onUpdateDraft,
  disabled = false,
}: GuidedParametersProps) {
  const [activeKey, setActiveKey] = React.useState<ParameterKey | null>(null);
  const [multiDraftValue, setMultiDraftValue] = React.useState("");

  const activeDescriptor = PARAMETER_DESCRIPTORS.find((d) => d.key === activeKey) ?? null;

  const getSummary = (desc: ParameterDescriptor): string | null => {
    if (desc.key === "constraints") {
      return draft.constraints.length > 0 ? `${draft.constraints.length} set` : null;
    }
    if (desc.key === "guardrails") {
      return draft.guardrails.length > 0 ? `${draft.guardrails.length} set` : null;
    }
    const val = draft[desc.key];
    return typeof val === "string" && val.trim().length > 0 ? val.trim() : null;
  };

  const clearParameter = (key: ParameterKey, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (key === "constraints") {
      onUpdateDraft({ constraints: [] });
    } else if (key === "guardrails") {
      onUpdateDraft({ guardrails: [] });
    } else {
      onUpdateDraft({ [key]: undefined });
    }
  };

  const addMultiItem = (key: "constraints" | "guardrails", item: string) => {
    const clean = item.trim();
    if (!clean) return;
    const current = draft[key] ?? [];
    if (!current.includes(clean)) {
      onUpdateDraft({ [key]: [...current, clean] });
    }
    setMultiDraftValue("");
  };

  const removeMultiItem = (key: "constraints" | "guardrails", item: string) => {
    const current = draft[key] ?? [];
    onUpdateDraft({ [key]: current.filter((x) => x !== item) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Sliders className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
        <span className="font-medium">Guided building blocks:</span>
      </div>

      <div
        role="group"
        aria-label="Guided prompt parameters"
        className="flex flex-wrap items-center gap-2"
      >
        {PARAMETER_DESCRIPTORS.map((desc) => {
          const summary = getSummary(desc);
          const isOpen = activeKey === desc.key;
          const hasValue = Boolean(summary);

          return (
            <div
              key={desc.key}
              className={`inline-flex items-center rounded-xl border transition-all ${
                isOpen || hasValue
                  ? "bg-[var(--accent-subtle-bg)] text-[var(--text-primary)] border-[var(--accent-primary)] shadow-sm"
                  : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] hover:border-[var(--separator-strong)] border-[var(--separator-subtle)]"
              }`}
            >
              <button
                type="button"
                disabled={disabled}
                aria-expanded={isOpen}
                onClick={() => {
                  setMultiDraftValue("");
                  setActiveKey((prev) => (prev === desc.key ? null : desc.key));
                }}
                className="min-h-[40px] px-3.5 py-1.5 text-sm font-medium inline-flex items-center gap-2 focus-ring rounded-xl cursor-pointer"
              >
                {hasValue ? (
                  <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                ) : (
                  <Plus className="w-3.5 h-3.5 opacity-60" />
                )}
                <span>{desc.label}</span>
                {summary ? (
                  <span className="max-w-[140px] truncate text-[var(--accent-text)] font-semibold">
                    · {summary}
                  </span>
                ) : null}
              </button>
              {hasValue ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Clear ${desc.label}`}
                  onClick={(e) => clearParameter(desc.key, e)}
                  className="pr-2.5 pl-1 py-1.5 opacity-75 hover:opacity-100 focus-ring rounded-r-xl cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {activeDescriptor ? (
        <div
          role="region"
          aria-label={`Configure ${activeDescriptor.label}`}
          className="rounded-2xl p-4 sm:p-5 bg-[var(--surface-2)] border border-[var(--separator-strong)] space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`param-input-${activeDescriptor.key}`}
              className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
              <span>{activeDescriptor.label}</span>
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearParameter(activeDescriptor.key)}
              >
                Clear
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setActiveKey(null)}>
                Done
              </Button>
            </div>
          </div>

          {activeDescriptor.isMulti ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Input
                  id={`param-input-${activeDescriptor.key}`}
                  value={multiDraftValue}
                  placeholder={activeDescriptor.placeholder}
                  onChange={(e) => setMultiDraftValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMultiItem(
                        activeDescriptor.key as "constraints" | "guardrails",
                        multiDraftValue,
                      );
                    }
                  }}
                  className="bg-[var(--surface-1)]"
                />
                <Button
                  variant="solid"
                  size="sm"
                  onClick={() =>
                    addMultiItem(
                      activeDescriptor.key as "constraints" | "guardrails",
                      multiDraftValue,
                    )
                  }
                >
                  Add
                </Button>
              </div>

              {(draft[activeDescriptor.key as "constraints" | "guardrails"] ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(draft[activeDescriptor.key as "constraints" | "guardrails"] ?? []).map(
                    (item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--separator-subtle)]"
                      >
                        <span>{item}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${item}`}
                          onClick={() =>
                            removeMultiItem(
                              activeDescriptor.key as "constraints" | "guardrails",
                              item,
                            )
                          }
                          className="opacity-70 hover:opacity-100 focus-ring rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <Input
              id={`param-input-${activeDescriptor.key}`}
              value={(draft[activeDescriptor.key] as string | undefined) ?? ""}
              placeholder={activeDescriptor.placeholder}
              onChange={(e) =>
                onUpdateDraft({
                  [activeDescriptor.key]: e.target.value || undefined,
                })
              }
              className="bg-[var(--surface-1)]"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)] mr-1">Popular choices:</span>
            {activeDescriptor.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  if (activeDescriptor.isMulti) {
                    addMultiItem(
                      activeDescriptor.key as "constraints" | "guardrails",
                      suggestion,
                    );
                  } else {
                    onUpdateDraft({ [activeDescriptor.key]: suggestion });
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-sm bg-[var(--surface-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] border border-[var(--separator-subtle)] transition-colors focus-ring cursor-pointer"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
