import { Badge, Button } from "@open-prompt-os/ui-web";
import type { IdleTourController } from "../../hooks/use-idle-tour.js";

const TOUR_STEPS = [
  {
    step: 1,
    badge: "Step 1 of 3 · Composer",
    title: "Write in Text, Image, or Video mode",
    description:
      "Start with a plain-English idea. Add building blocks like Goal, Audience, and Tone, or press Enter to compile right away.",
  },
  {
    step: 2,
    badge: "Step 2 of 3 · One-Click Send",
    title: "Variables & instant dispatch",
    description:
      "Your compiled prompt highlights customizable [Variables] and opens directly in ChatGPT, Claude, or Gemini.",
  },
  {
    step: 3,
    badge: "Step 3 of 3 · Auto-Save",
    title: "Sign in anytime without losing work",
    description:
      "Your latest prompt survives page refreshes and syncs into your private library when you create a free account.",
  },
] as const;

export interface AnonymousTourProps {
  readonly controller: IdleTourController;
}

export function AnonymousTour({ controller }: AnonymousTourProps) {
  if (!controller.isActive) return null;

  const current = TOUR_STEPS[controller.currentStep] ?? TOUR_STEPS[0];
  const isFinalStep = controller.currentStep + 1 >= controller.totalSteps;

  return (
    <aside
      aria-label="Product onboarding tour"
      className="fixed bottom-4 inset-x-4 sm:bottom-6 sm:left-6 sm:right-auto sm:w-full sm:max-w-md z-40 rounded-2xl p-4 sm:p-5 glass-surface"
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <Badge variant="framework">{current.badge}</Badge>
        <button
          type="button"
          onClick={controller.skipTour}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-0.5 rounded focus-ring"
        >
          Skip tour
        </button>
      </div>
      <h3 className="text-base font-semibold">{current.title}</h3>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
        {current.description}
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {TOUR_STEPS.map((s, idx) => (
            <span
              key={s.step}
              className={`h-2 rounded-full transition-all ${
                idx === controller.currentStep
                  ? "w-6 bg-[var(--accent-primary)]"
                  : "w-2 bg-[var(--separator-subtle)]"
              }`}
            />
          ))}
        </div>
        <Button size="sm" variant="solid" onClick={controller.nextStep}>
          {isFinalStep ? "Got it" : "Next"}
        </Button>
      </div>
    </aside>
  );
}
