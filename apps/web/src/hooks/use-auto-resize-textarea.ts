import * as React from "react";

export interface AutoResizeOptions {
  readonly minHeightPx?: number;
  readonly maxHeightPx?: number;
}

export interface SubmitKeyEventLike {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly isComposing?: boolean;
  readonly nativeEvent?: {
    readonly isComposing?: boolean;
  };
}

/**
 * Pure helper tested in unit suites:
 * Enter submits when no modifier is held, IME composition is inactive, and not on touch mobile.
 */
export function shouldSubmitOnEnter(
  event: SubmitKeyEventLike,
  options?: { isMobileTouch?: boolean },
): boolean {
  if (event.key !== "Enter") return false;
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.isComposing || event.nativeEvent?.isComposing) return false;
  if (options?.isMobileTouch) return false;
  return true;
}

export function useAutoResizeTextarea(
  value: string,
  options: AutoResizeOptions = {},
): React.RefObject<HTMLTextAreaElement | null> {
  const { minHeightPx = 96, maxHeightPx = 320 } = options;
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: value triggers height recalculation
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollHeight = el.scrollHeight;
    const clampedHeight = Math.min(Math.max(scrollHeight, minHeightPx), maxHeightPx);
    el.style.height = `${clampedHeight}px`;
    el.style.overflowY = scrollHeight > maxHeightPx ? "auto" : "hidden";
  }, [value, minHeightPx, maxHeightPx]);

  return textareaRef;
}
