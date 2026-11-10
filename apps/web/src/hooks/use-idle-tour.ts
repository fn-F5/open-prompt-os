import * as React from "react";
import { safeGetItem, safeSetItem } from "../lib/storage.js";
import { trackEvent } from "../lib/telemetry.js";

export const HAS_SEEN_TOUR_KEY = "open-prompt-os:has-seen-tour:v1";
export const IDLE_TOUR_DELAY_MS = 3000;

export interface UseIdleTourOptions {
  readonly isAuthenticated: boolean;
  readonly isAuthLoading: boolean;
  readonly isDialogOpen: boolean;
  readonly isTypingOrStreaming: boolean;
  readonly prefersReducedMotion: boolean;
}

export interface IdleTourController {
  readonly isActive: boolean;
  readonly currentStep: number;
  readonly totalSteps: number;
  readonly nextStep: () => void;
  readonly skipTour: () => void;
  readonly replayTour: () => void;
}

export function useIdleTour({
  isAuthenticated,
  isAuthLoading,
  isDialogOpen,
  isTypingOrStreaming,
  prefersReducedMotion,
}: UseIdleTourOptions): IdleTourController {
  const [isActive, setIsActive] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [hasSeen, setHasSeen] = React.useState<boolean>(() => {
    return safeGetItem(HAS_SEEN_TOUR_KEY) === "true";
  });

  const totalSteps = 3;

  const markSeen = React.useCallback(() => {
    safeSetItem(HAS_SEEN_TOUR_KEY, "true");
    setHasSeen(true);
    setIsActive(false);
  }, []);

  React.useEffect(() => {
    if (
      isAuthLoading ||
      isAuthenticated ||
      hasSeen ||
      isDialogOpen ||
      isTypingOrStreaming ||
      prefersReducedMotion ||
      isActive
    ) {
      return;
    }

    let timerId: number | null = null;

    const startTimer = () => {
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        setIsActive(true);
        setCurrentStep(0);
        trackEvent("tour_started", { trigger: "idle_3s" });
      }, IDLE_TOUR_DELAY_MS);
    };

    const handleActivity = () => {
      if (!isActive) {
        startTimer();
      }
    };

    startTimer();
    window.addEventListener("keydown", handleActivity, { passive: true });
    window.addEventListener("pointerdown", handleActivity, { passive: true });

    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("pointerdown", handleActivity);
    };
  }, [
    isAuthLoading,
    isAuthenticated,
    hasSeen,
    isDialogOpen,
    isTypingOrStreaming,
    prefersReducedMotion,
    isActive,
  ]);

  const nextStep = React.useCallback(() => {
    if (currentStep + 1 >= totalSteps) {
      markSeen();
      trackEvent("tour_completed", { stepsCompleted: totalSteps });
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep, markSeen]);

  const skipTour = React.useCallback(() => {
    markSeen();
    trackEvent("tour_completed", { skippedAtStep: currentStep });
  }, [currentStep, markSeen]);

  const replayTour = React.useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
    trackEvent("tour_started", { trigger: "manual_replay" });
  }, []);

  return {
    isActive,
    currentStep,
    totalSteps,
    nextStep,
    skipTour,
    replayTour,
  };
}
