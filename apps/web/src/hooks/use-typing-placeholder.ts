import * as React from "react";

export interface TypingPlaceholderOptions {
  readonly enabled?: boolean;
  readonly reducedMotion?: boolean;
  readonly showCursor?: boolean;
  readonly typeSpeedMs?: number;
  readonly deleteSpeedMs?: number;
  readonly pauseAfterTypeMs?: number;
  readonly pauseBeforeNextMs?: number;
}

type TypingPhase = "typing" | "holding" | "deleting" | "pausing";

/**
 * Cycles through an array of placeholder prompts with a typewriter ("running") effect.
 * Falls back to the first static prompt when `reducedMotion` is enabled.
 */
export function useTypingPlaceholder(
  prompts: readonly string[],
  options: TypingPlaceholderOptions = {},
): string {
  const {
    enabled = true,
    reducedMotion = false,
    showCursor = true,
    typeSpeedMs = 26,
    deleteSpeedMs = 14,
    pauseAfterTypeMs = 2200,
    pauseBeforeNextMs = 260,
  } = options;

  const [prevPrompts, setPrevPrompts] = React.useState(prompts);
  const [promptIndex, setPromptIndex] = React.useState(0);
  const [charIndex, setCharIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<TypingPhase>("typing");

  // Reset immediately when the prompt list reference changes (e.g., composer mode switch)
  if (prompts !== prevPrompts) {
    setPrevPrompts(prompts);
    setPromptIndex(0);
    setCharIndex(0);
    setPhase("typing");
  }

  const activePrompt = prompts[promptIndex % Math.max(prompts.length, 1)] ?? "";

  React.useEffect(() => {
    if (!enabled || reducedMotion || prompts.length === 0) return;

    let delayMs = typeSpeedMs;
    if (phase === "holding") delayMs = pauseAfterTypeMs;
    else if (phase === "deleting") delayMs = deleteSpeedMs;
    else if (phase === "pausing") delayMs = pauseBeforeNextMs;

    const timer = window.setTimeout(() => {
      if (phase === "typing") {
        if (charIndex < activePrompt.length) {
          setCharIndex((c) => c + 1);
        } else {
          setPhase("holding");
        }
      } else if (phase === "holding") {
        if (prompts.length > 1) {
          setPhase("deleting");
        }
      } else if (phase === "deleting") {
        if (charIndex > 0) {
          // Delete 2 chars at a time so cycling to the next audience prompt feels brisk
          setCharIndex((c) => Math.max(0, c - 2));
        } else {
          setPhase("pausing");
        }
      } else {
        setPromptIndex((idx) => (idx + 1) % prompts.length);
        setPhase("typing");
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    enabled,
    reducedMotion,
    prompts.length,
    activePrompt.length,
    phase,
    charIndex,
    typeSpeedMs,
    deleteSpeedMs,
    pauseAfterTypeMs,
    pauseBeforeNextMs,
  ]);

  if (prompts.length === 0) return "";
  if (reducedMotion) return prompts[0] ?? "";

  const visibleText = !enabled && charIndex === 0 ? activePrompt : activePrompt.slice(0, charIndex);
  if (!enabled || !showCursor) return visibleText;

  return `${visibleText}|`;
}
