import type { ComposerMode } from "@open-prompt-os/contracts";
import { evaluatePromptQuality, extractDraftSupplementalText } from "@open-prompt-os/core";
import { Badge, Button, Tabs, Textarea } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CornerDownLeft, SlidersHorizontal, Square, Wand2 } from "lucide-react";
import * as React from "react";
import { useLocation } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import {
  shouldSubmitOnEnter,
  useAutoResizeTextarea,
} from "../../hooks/use-auto-resize-textarea.js";
import { useReducedEffects } from "../../hooks/use-reduced-effects.js";
import { useTypingPlaceholder } from "../../hooks/use-typing-placeholder.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { openAuthDialog } from "../../state/auth-dialog-store.js";
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
      label: "Follow-up Email",
      prompt:
        "Write a short, friendly follow-up email after a job interview thanking the hiring manager and asking about next steps.",
    },
    {
      label: "Meeting Summary",
      prompt:
        "Turn messy team meeting notes into a clear summary with key decisions, action items, and owners.",
    },
    {
      label: "Explain Simply",
      prompt:
        "Explain how compound interest works in plain language with a simple real-life example for beginners.",
    },
  ],
  image: [
    {
      label: "Coffee Shop Photo",
      prompt:
        "A warm, sunlit photo of a latte and croissant on a wooden cafe table by a rainy window.",
    },
    {
      label: "Product Shot",
      prompt:
        "A clean studio photo of minimalist white wireless headphones on a soft light gray background.",
    },
  ],
  video: [
    {
      label: "Ocean Sunset",
      prompt:
        "A slow drone shot gliding over calm ocean waves at golden sunset with warm orange light.",
    },
    {
      label: "Product Spin",
      prompt:
        "A smooth 5-second camera spin around a sleek stainless steel watch with soft studio lighting.",
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
  const location = useLocation();
  const { isAuthenticated } = useAuthSession();
  const { activeMode, activeDraft, isAdvancedOpen } = useComposerStore();

  const requireAuth = () => {
    if (!isAuthenticated) {
      openAuthDialog({ reason: "action_required", intendedRoute: location.pathname });
      return false;
    }
    return true;
  };

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

  useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: () => orpcClient.billing.status(),
    enabled: isAuthenticated,
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
    if (!requireAuth()) return;
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

  const examples = QUICK_EXAMPLES[activeMode] ?? QUICK_EXAMPLES.text;

  return (
    <div className="relative">
      <div className="mb-2 sm:mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-medium tracking-[-0.03em]">Prompt Compiler</h1>
          <p className="text-xs sm:text-sm [@media(max-height:600px)]:hidden text-[var(--text-secondary)] max-w-2xl">
            Draft, parameterize, and dispatch model-specific prompts from your workspace.
          </p>
        </div>
      </div>

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
