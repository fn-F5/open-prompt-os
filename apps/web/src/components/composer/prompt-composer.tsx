import type { ComposerMode } from "@open-prompt-os/contracts";
import { evaluatePromptQuality, extractDraftSupplementalText } from "@open-prompt-os/core";
import { Badge, Button, Tabs, Textarea } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CornerDownLeft,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react";
import * as React from "react";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import {
  shouldSubmitOnEnter,
  useAutoResizeTextarea,
} from "../../hooks/use-auto-resize-textarea.js";
import { useReducedEffects } from "../../hooks/use-reduced-effects.js";
import { useTypingPlaceholder } from "../../hooks/use-typing-placeholder.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { composerActions, useComposerStore } from "../../state/composer-store.js";
import { PulseHotspot } from "../onboarding/pulse-hotspot.js";
import { AdvancedControls } from "./advanced-controls.js";
import { GuidedParameters } from "./guided-parameters.js";
import { ModelPicker } from "./model-picker.js";

const MODE_OPTIONS: Array<{ readonly value: ComposerMode; readonly label: string }> = [
  { value: "text", label: "Text & Work" },
  { value: "image", label: "Image Studio" },
  { value: "video", label: "Cinema Video" },
];

const MODE_PLACEHOLDERS: Record<ComposerMode, readonly string[]> = {
  text: [
    "Engineers: Design a zero-downtime Postgres migration plan with rollback checks and load-test gates...",
    "Content creators: Turn a YouTube video outline into a hook-driven newsletter and 5 short-form posts...",
    "Recruiters: Draft personalized candidate outreach and a structured interview rubric for a Staff Engineer...",
    "Product leads: Synthesize customer interviews into a 1-page launch brief with risks and metrics...",
    "Marketers: Write high-converting landing page hero copy with 3 angle variants and objection handlers...",
    "Founders & ops: Turn messy meeting notes into an executive decision memo with owners and deadlines...",
  ],
  image: [
    "Content creators: Bold YouTube thumbnail portrait with rim lighting and clean negative space for title...",
    "Product designers: Studio macro photo of a matte-black synthesizer on dark basalt, 85mm f/2.0 light...",
    "Marketers: Minimalist sunlit architectural workspace editorial photo, 35mm lens, warm natural depth...",
    "Concept artists: Isometric cyberpunk repair workshop glowing with neon cyan reflections and rich detail...",
  ],
  video: [
    "Content creators: Punchy 15-second vertical product hook with smooth match-cuts and crisp key lighting...",
    "Product teams: Slow 24fps orbital reveal around a brushed-steel watch as warm rim light sweeps the dial...",
    "Filmmakers: Continuous 35mm anamorphic dolly push-in through a rain-lit studio at dusk, soft lens flare...",
  ],
};

const QUICK_EXAMPLES: Record<ComposerMode, readonly { label: string; prompt: string }[]> = {
  text: [
    {
      label: "System Architecture Review",
      prompt:
        "Design a zero-downtime PostgreSQL Row-Level Security (RLS) rollout plan for a multi-tenant B2B SaaS platform.",
    },
    {
      label: "Executive Strategy Memo",
      prompt:
        "Synthesize Q4 user activation metrics and customer interviews into a crisp 2-page executive decision memo with clear trade-offs.",
    },
    {
      label: "Customer Support Guardrails",
      prompt:
        "Create a strict evaluation rubric and hallucination checklist for an AI billing support agent.",
    },
  ],
  image: [
    {
      label: "Industrial Hardware Render",
      prompt:
        "Macro studio photograph of a brushed titanium audio interface resting on dark basalt with subtle volumetric rim lighting, 85mm f/2.0 lens.",
    },
    {
      label: "Editorial Architecture",
      prompt:
        "Architectural monograph photograph of a minimalist concrete and glass cliffside pavilion at dusk, warm interior glow, 35mm tilt-shift lens.",
    },
  ],
  video: [
    {
      label: "24fps Product Reveal",
      prompt:
        "Continuous 6-second orbital camera movement around a brushed steel chronograph as a narrow beam of key light sweeps across the dial.",
    },
    {
      label: "Cinematic Studio Dolly",
      prompt:
        "Slow 24fps dolly push-in through a softly lit design studio toward a floating holographic prototype.",
    },
  ],
};

export interface PromptComposerProps {
  readonly isPending: boolean;
  readonly onSubmitPrompt: (followUpAnswers?: Record<string, string>) => void;
  readonly onStopGeneration: () => void;
  readonly onTypingChange?: (isTyping: boolean) => void;
}

export function PromptComposer({
  isPending,
  onSubmitPrompt,
  onStopGeneration,
  onTypingChange,
}: PromptComposerProps) {
  const { isAuthenticated } = useAuthSession();
  const { activeMode, activeDraft, isAdvancedOpen } = useComposerStore();

  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [isTextareaFocused, setIsTextareaFocused] = React.useState(false);

  const { prefersReducedMotion } = useReducedEffects();
  const dynamicPlaceholder = useTypingPlaceholder(MODE_PLACEHOLDERS[activeMode], {
    enabled: !isPending && !isTextareaFocused && activeDraft.rawInput.length === 0,
    reducedMotion: prefersReducedMotion,
  });

  const textareaRef = useAutoResizeTextarea(activeDraft.rawInput, {
    minHeightPx: 96,
    maxHeightPx: 320,
  });

  const billingQuery = useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: () => orpcClient.billing.status(),
  });

  const errorId = React.useId();
  const hintId = React.useId();

  const hasTypedOrConfigured = Boolean(
    activeDraft.rawInput.trim().length > 0 ||
      activeDraft.goal ||
      activeDraft.audience ||
      activeDraft.format ||
      activeDraft.persona ||
      activeDraft.tone ||
      activeDraft.constraints.length > 0 ||
      activeDraft.guardrails.length > 0,
  );

  const validateAndSubmit = () => {
    const trimmed = activeDraft.rawInput.trim();
    if (!trimmed) {
      setValidationError("Enter a prompt idea or instruction before compiling.");
      return;
    }
    if (activeDraft.rawInput.length > 8000) {
      setValidationError("Prompt input exceeds the 8,000 character limit.");
      return;
    }
    const quality = evaluatePromptQuality(activeDraft.rawInput, {
      supplementalText: extractDraftSupplementalText(activeDraft),
    });
    if (!quality.ok) {
      setValidationError(quality.message);
      return;
    }
    setValidationError(null);
    onSubmitPrompt();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobileTouch =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (shouldSubmitOnEnter(event, { isMobileTouch })) {
      event.preventDefault();
      if (!isPending) {
        validateAndSubmit();
      }
    }
  };

  const remainingGuestUses = billingQuery.data?.remainingDailyPrompts ?? 5;
  const dailyLimit = billingQuery.data?.dailyLimit ?? 5;
  const examples = QUICK_EXAMPLES[activeMode] ?? QUICK_EXAMPLES.text;

  return (
    <div className="relative">
      {/* Dedicated Hero Section for Anonymous Visitors */}
      {!isAuthenticated ? (
        <div className="text-center max-w-4xl mx-auto pt-0 pb-2.5 sm:pt-0.5 sm:pb-5 [@media(max-height:640px)]:pb-2 [@media(max-height:600px)]:pb-1 space-y-1.5 sm:space-y-2.5">
          <div className="hidden sm:inline-flex [@media(max-height:640px)]:hidden flex-wrap items-center justify-center gap-2 px-3.5 py-1 rounded-full bg-[var(--accent-subtle-bg)] border border-[var(--separator-strong)] font-mono text-xs uppercase tracking-[0.08em] font-normal text-[var(--text-primary)] max-w-full">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent-text)] shrink-0" />
            <span>The Operating System for Prompts · Instant free use</span>
          </div>

          <h1 className="text-[19px] sm:text-3xl lg:text-[40px] font-medium tracking-[-0.03em] leading-[1.08] text-balance text-[var(--text-primary)]">
            Prompts are trade secrets{" "}
            <span className="text-gradient-brand whitespace-nowrap">creators rarely share</span>
          </h1>

          <p className="text-xs sm:text-base [@media(max-height:600px)]:hidden text-[var(--text-secondary)] max-w-3xl mx-auto leading-relaxed">
            Top creators guard the exact wording that gets studio-grade AI results. Drop a rough
            idea below and hit Compile to generate the same pro-level structure in one click.
          </p>

          <div className="hidden sm:inline-flex [@media(max-height:640px)]:hidden items-center gap-2 text-xs sm:text-sm text-[var(--success-text)] font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Privacy by default: We never train on your prompts.</span>
          </div>
        </div>
      ) : (
        <div className="mb-2 sm:mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-medium tracking-[-0.03em]">Prompt Compiler</h1>
            <p className="text-xs sm:text-sm [@media(max-height:600px)]:hidden text-[var(--text-secondary)] max-w-2xl">
              Draft, parameterize, and dispatch model-specific prompts from your workspace.
            </p>
          </div>
        </div>
      )}

      {/* Main Frosted Glass Composer Card */}
      <section
        aria-label="Prompt operating system composer"
        className="relative p-3 sm:p-5 [@media(max-height:640px)]:p-3 [@media(max-height:600px)]:p-2.5 glass-surface space-y-2.5 sm:space-y-3.5 [@media(max-height:640px)]:space-y-2 [@media(max-height:600px)]:space-y-1.5"
      >
        {/* Top Row: Mode Switcher + Wrapping Quick Example Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-2.5 sm:pb-3 [@media(max-height:600px)]:pb-1.5 border-b border-[var(--separator-subtle)]">
          <Tabs
            ariaLabel="Prompt generation mode"
            value={activeMode}
            onValueChange={(mode) => {
              setValidationError(null);
              composerActions.setMode(mode);
            }}
            options={MODE_OPTIONS}
            className="w-full sm:w-auto justify-between sm:justify-start"
          />

          <div className="hidden min-[360px]:flex flex-wrap items-center gap-1.5 max-w-full py-0.5">
            <span className="text-xs sm:text-sm text-[var(--text-secondary)] inline-flex shrink-0 items-center gap-1 mr-1">
              <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent-text)]" />
              <span>Examples:</span>
            </span>
            {examples.map((ex, idx) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setValidationError(null);
                  composerActions.updateActiveDraft({ rawInput: ex.prompt });
                }}
                className={`${idx === 0 ? "inline-flex" : idx === 1 ? "hidden md:inline-flex" : "hidden xl:inline-flex"} min-h-[36px] items-center shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)] transition-colors focus-ring cursor-pointer`}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Input Surface */}
        <div className="rounded-2xl bg-[var(--page-bg)]/80 border border-[var(--separator-subtle)] focus-within:border-[var(--accent-primary)] transition-colors p-2 sm:p-3 [@media(max-height:600px)]:p-1.5">
          <label htmlFor="prompt-composer-textarea" className="sr-only">
            Prompt intent and instructions ({activeMode} mode)
          </label>
          <Textarea
            id="prompt-composer-textarea"
            ref={textareaRef}
            value={activeDraft.rawInput}
            disabled={isPending}
            placeholder={dynamicPlaceholder}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? `${errorId} ${hintId}` : hintId}
            onFocus={() => {
              setIsTextareaFocused(true);
              onTypingChange?.(true);
            }}
            onBlur={() => {
              setIsTextareaFocused(false);
              onTypingChange?.(false);
            }}
            onChange={(e) => {
              if (validationError) setValidationError(null);
              composerActions.updateActiveDraft({ rawInput: e.target.value });
            }}
            onKeyDown={handleKeyDown}
            className="leading-relaxed"
          />
        </div>

        {validationError ? (
          <div
            id={errorId}
            role="alert"
            className="rounded-xl px-4 py-3 text-sm font-medium bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/35"
          >
            {validationError}
          </div>
        ) : null}

        {/* Progressive Disclosure: Guided Parameters appear when typing or when explicitly toggled */}
        {hasTypedOrConfigured ? (
          <GuidedParameters
            draft={activeDraft}
            onUpdateDraft={(patch) => composerActions.updateActiveDraft(patch)}
            disabled={isPending}
          />
        ) : null}

        {/* Bottom Action Bar (wrapping cleanly on narrow screens, 1 balanced row on desktop) */}
        <div className="pt-2.5 sm:pt-3 [@media(max-height:600px)]:pt-1.5 border-t border-[var(--separator-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-2.5 [@media(max-height:600px)]:gap-1.5">
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 min-w-0">
            <ModelPicker
              mode={activeMode}
              selectedModelId={activeDraft.modelId}
              onSelectModel={(modelId) => composerActions.updateActiveDraft({ modelId })}
              disabled={isPending}
            />

            <div className="inline-flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={isAdvancedOpen}
                onClick={() => composerActions.setAdvancedOpen(!isAdvancedOpen)}
              >
                <SlidersHorizontal className="w-4 h-4 text-[var(--accent-text)]" />
                <span>Advanced</span>
                {activeDraft.framework && activeDraft.framework !== "none" ? (
                  <Badge variant="framework" className="ml-1">
                    {activeDraft.framework.toUpperCase()}
                  </Badge>
                ) : null}
              </Button>

              <PulseHotspot
                hotspotId="advanced_controls_v1"
                label="New: Prompt Frameworks"
                description="Switch between CO-STAR, RISE, CARE, and Chain-of-Thought or lock output length."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3">
            <span
              id={hintId}
              className="hidden xl:inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] shrink-0"
            >
              <CornerDownLeft className="w-4 h-4" />
              <span>Enter to compile · Shift+Enter for new line</span>
            </span>

            {!isAuthenticated ? (
              <span
                aria-label="Remaining free daily generations"
                className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] tabular-nums px-2.5 py-1.5 sm:px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] shrink-0 whitespace-nowrap"
              >
                {remainingGuestUses}/{dailyLimit} free runs left
              </span>
            ) : null}

            {isPending ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={onStopGeneration}
                aria-label="Stop prompt compilation"
                className="flex-1 sm:flex-initial px-6 sm:px-7"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop</span>
              </Button>
            ) : (
              <Button
                variant="primary-inverse"
                size="lg"
                onClick={validateAndSubmit}
                aria-label="Compile structured prompt"
                className="flex-1 sm:flex-initial px-4 sm:px-7"
              >
                <span>Compile Prompt</span>
                <ArrowRight className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Progressive Advanced Controls Drawer */}
        <AdvancedControls
          open={isAdvancedOpen}
          onOpenChange={(open) => composerActions.setAdvancedOpen(open)}
          draft={activeDraft}
          onUpdateDraft={(patch) => composerActions.updateActiveDraft(patch)}
        />
      </section>
    </div>
  );
}
