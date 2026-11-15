import * as React from "react";

export const LANDING_SECTIONS = [
  {
    id: "landing_workspace",
    selector: "#main-workspace",
    label: "Prompt Compiler",
    shortLabel: "Compiler",
  },
  {
    id: "before_after_showcase",
    selector: '[data-section-id="before_after_showcase"]',
    label: "See the Difference",
    shortLabel: "See the Difference",
  },
  {
    id: "features_grid",
    selector: '[data-section-id="features_grid"]',
    label: "Built for Everyday Speed",
    shortLabel: "Built for Everyday Speed",
  },
  {
    id: "use_cases",
    selector: '[data-section-id="use_cases"]',
    label: "Curated Template Gallery",
    shortLabel: "Curated Template Gallery",
  },
  {
    id: "privacy_commitment",
    selector: '[data-section-id="privacy_commitment"]',
    label: "Privacy by Default Guarantee",
    shortLabel: "Privacy by Default Guarantee",
  },
  {
    id: "pricing_options",
    selector: '[data-section-id="pricing_options"]',
    label: "Simple, Fair Pricing",
    shortLabel: "Simple, Fair Pricing",
  },
] as const;

export const LANDING_SECTION_SELECTORS = LANDING_SECTIONS.map((s) => s.selector);

const DEFAULT_COOLDOWN_MS = 320;
const GESTURE_IDLE_RESET_MS = 120;
const MIN_WHEEL_DELTA = 1;
const MIN_TOUCH_SWIPE_PX = 45;
const KEYBOARD_INTERACTIVE_SELECTOR =
  'input, textarea, select, button, [contenteditable="true"], [role="listbox"], [role="combobox"]';

export interface UseSectionScrollOptions {
  readonly cooldownMs?: number;
}

export interface SectionScrollController {
  readonly activeIndex: number;
  readonly activeSectionId: string;
  readonly scrollToSection: (index: number) => void;
}

let activeScrollToSectionHandler: ((index: number) => void) | null = null;

/**
 * Transitions the landing page full-viewport deck directly to a slide index (0..5).
 */
export function scrollToLandingSection(index: number): void {
  activeScrollToSectionHandler?.(index);
}

/**
 * Returns all currently mounted landing page sections in top-to-bottom visual order.
 */
export function getOrderedLandingSections(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  const sections: HTMLElement[] = [];
  for (const selector of LANDING_SECTION_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      sections.push(el);
    }
  }
  return sections;
}

function shouldYieldToScrollableTarget(target: EventTarget | null, deltaY: number): boolean {
  if (!(target instanceof Element)) return false;
  const scrollable = target.closest<HTMLElement>(
    'textarea, [role="listbox"], [data-scrollable="true"]',
  );
  if (!scrollable) return false;

  if (scrollable.tagName === "TEXTAREA") {
    return scrollable.scrollHeight > scrollable.clientHeight + 1;
  }

  const canScrollDown = scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1;
  const canScrollUp = scrollable.scrollTop > 1;
  return deltaY > 0 ? canScrollDown : canScrollUp;
}

function isAnyOverlayOpen(): boolean {
  if (document.querySelector("dialog[open]") !== null) return true;
  if (document.querySelector('[aria-haspopup="listbox"][aria-expanded="true"]') !== null) {
    return true;
  }
  try {
    if (document.querySelector("[popover]:popover-open") !== null) return true;
  } catch {
    // Ignore unsupported selector in older/test environments
  }
  return false;
}

function syncDocumentSectionAttributes(index: number, sections: readonly HTMLElement[]): void {
  if (typeof document === "undefined") return;
  const sectionMeta = LANDING_SECTIONS[index];
  const sectionId =
    sectionMeta?.id ??
    sections[index]?.getAttribute("data-section-id") ??
    sections[index]?.id ??
    "landing_workspace";

  document.documentElement.setAttribute("data-active-section-index", String(index));
  document.documentElement.setAttribute("data-active-section", sectionId);

  for (let i = 0; i < sections.length; i += 1) {
    sections[i]?.setAttribute("data-fp-active", i === index ? "true" : "false");
  }
}

/**
 * Manages fullPage.js-style viewport slide transitions (one gesture = one slide)
 * via wheel, trackpad inertia filtering, keyboard navigation, touch swipe, and direct dot clicks.
 */
export function useSectionScroll(
  enabled: boolean,
  options: UseSectionScrollOptions = {},
): SectionScrollController {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const currentIndexRef = React.useRef(0);
  const lastStepTimeRef = React.useRef(0);
  const lastWheelTimeRef = React.useRef(0);
  const gestureLockedRef = React.useRef(false);
  const minAbsDeltaInGestureRef = React.useRef(Number.POSITIVE_INFINITY);
  const lastDirectionRef = React.useRef<1 | -1 | 0>(0);
  const touchStartYRef = React.useRef<number | null>(null);
  const touchStartXRef = React.useRef<number | null>(null);

  const commitSlideIndex = React.useCallback((targetIndex: number) => {
    const sections = getOrderedLandingSections();
    const maxIndex = Math.max(LANDING_SECTIONS.length - 1, sections.length - 1);
    const clampedIndex = Math.min(maxIndex, Math.max(0, targetIndex));
    currentIndexRef.current = clampedIndex;
    const targetSlide = sections[clampedIndex];
    if (targetSlide && targetSlide.scrollTop > 0) {
      targetSlide.scrollTop = 0;
    }
    setActiveIndex(clampedIndex);
    syncDocumentSectionAttributes(clampedIndex, sections);
  }, []);

  const scrollToSection = React.useCallback(
    (targetIndex: number) => {
      const now = Date.now();
      const clampedIndex = Math.min(LANDING_SECTIONS.length - 1, Math.max(0, targetIndex));
      const direction: 1 | -1 | 0 =
        clampedIndex > currentIndexRef.current
          ? 1
          : clampedIndex < currentIndexRef.current
            ? -1
            : 0;
      if (direction !== 0) {
        lastStepTimeRef.current = now;
        lastDirectionRef.current = direction;
      }
      gestureLockedRef.current = false;
      minAbsDeltaInGestureRef.current = Number.POSITIVE_INFINITY;
      commitSlideIndex(clampedIndex);
    },
    [cooldownMs, commitSlideIndex],
  );

  React.useEffect(() => {
    activeScrollToSectionHandler = scrollToSection;
    return () => {
      if (activeScrollToSectionHandler === scrollToSection) {
        activeScrollToSectionHandler = null;
      }
    };
  }, [scrollToSection]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const sections = getOrderedLandingSections();
    syncDocumentSectionAttributes(currentIndexRef.current, sections);
  }, []);

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      if (typeof document !== "undefined" && !enabled) {
        const sections = getOrderedLandingSections();
        if (sections.length < 2) {
          currentIndexRef.current = 0;
          setActiveIndex(0);
          document.documentElement?.removeAttribute("data-active-section-index");
          document.documentElement?.removeAttribute("data-active-section");
        }
      }
      return;
    }

    const sections = getOrderedLandingSections();
    if (sections.length > 0) {
      syncDocumentSectionAttributes(currentIndexRef.current, sections);
    }

    const stepInDirection = (direction: 1 | -1, absDelta = 100) => {
      const now = Date.now();
      const mountedSections = getOrderedLandingSections();
      const totalSlides = Math.max(mountedSections.length, LANDING_SECTIONS.length);
      const nextIndex = Math.min(totalSlides - 1, Math.max(0, currentIndexRef.current + direction));
      if (nextIndex === currentIndexRef.current) {
        lastWheelTimeRef.current = now;
        minAbsDeltaInGestureRef.current = Math.min(minAbsDeltaInGestureRef.current, absDelta);
        return;
      }

      lastStepTimeRef.current = now;
      lastDirectionRef.current = direction;
      lastWheelTimeRef.current = now;
      gestureLockedRef.current = true;
      minAbsDeltaInGestureRef.current = absDelta;
      commitSlideIndex(nextIndex);
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const absDelta = Math.abs(event.deltaY);
      if (absDelta < MIN_WHEEL_DELTA) return;
      if (isAnyOverlayOpen()) return;
      if (shouldYieldToScrollableTarget(event.target, event.deltaY)) return;

      const mountedSections = getOrderedLandingSections();
      if (mountedSections.length < 2) return;

      const now = Date.now();
      const direction: 1 | -1 = event.deltaY > 0 ? 1 : -1;
      const timeSinceLastWheel = now - lastWheelTimeRef.current;

      if (timeSinceLastWheel >= GESTURE_IDLE_RESET_MS || direction !== lastDirectionRef.current) {
        gestureLockedRef.current = false;
        minAbsDeltaInGestureRef.current = Number.POSITIVE_INFINITY;
      }

      const cooldownElapsed = now - lastStepTimeRef.current >= cooldownMs;

      if (gestureLockedRef.current && direction === lastDirectionRef.current) {
        const isClearNewFlick =
          cooldownElapsed &&
          minAbsDeltaInGestureRef.current <= 12 &&
          absDelta >= minAbsDeltaInGestureRef.current * 2.5 &&
          absDelta >= 24;
        if (!isClearNewFlick) {
          event.preventDefault();
          lastWheelTimeRef.current = now;
          minAbsDeltaInGestureRef.current = Math.min(minAbsDeltaInGestureRef.current, absDelta);
          return;
        }
      } else if (!cooldownElapsed) {
        event.preventDefault();
        lastWheelTimeRef.current = now;
        minAbsDeltaInGestureRef.current = Math.min(minAbsDeltaInGestureRef.current, absDelta);
        return;
      }

      event.preventDefault();
      stepInDirection(direction, absDelta);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const isJumpKey = event.key === "Home" || event.key === "End";
      const isStepKey =
        event.key === "PageDown" ||
        event.key === "PageUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp";
      if (!isJumpKey && !isStepKey) return;

      const active = document.activeElement;
      if (active instanceof Element && active.closest(KEYBOARD_INTERACTIVE_SELECTOR)) {
        return;
      }
      if (isAnyOverlayOpen()) return;

      const mountedSections = getOrderedLandingSections();
      if (mountedSections.length < 2) return;

      if (event.key === "Home") {
        if (currentIndexRef.current !== 0) {
          event.preventDefault();
          scrollToSection(0);
        }
        return;
      }

      if (event.key === "End") {
        const lastIdx = Math.max(mountedSections.length, LANDING_SECTIONS.length) - 1;
        if (currentIndexRef.current !== lastIdx) {
          event.preventDefault();
          scrollToSection(lastIdx);
        }
        return;
      }

      const direction: 1 | -1 = event.key === "PageDown" || event.key === "ArrowDown" ? 1 : -1;
      const maxIndex = Math.max(mountedSections.length, LANDING_SECTIONS.length) - 1;
      const nextIndex = Math.min(maxIndex, Math.max(0, currentIndexRef.current + direction));
      if (nextIndex !== currentIndexRef.current) {
        event.preventDefault();
        stepInDirection(direction);
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      touchStartYRef.current = touch.clientY;
      touchStartXRef.current = touch.clientX;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const startY = touchStartYRef.current;
      const startX = touchStartXRef.current;
      touchStartYRef.current = null;
      touchStartXRef.current = null;
      if (startY === null || startX === null) return;

      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaY = startY - touch.clientY;
      const deltaX = Math.abs(startX - touch.clientX);
      if (Math.abs(deltaY) < MIN_TOUCH_SWIPE_PX || Math.abs(deltaY) <= deltaX) return;
      if (isAnyOverlayOpen()) return;
      if (shouldYieldToScrollableTarget(event.target, deltaY)) return;

      const mountedSections = getOrderedLandingSections();
      if (mountedSections.length < 2) return;

      const now = Date.now();
      const direction: 1 | -1 = deltaY > 0 ? 1 : -1;
      if (now - lastStepTimeRef.current < cooldownMs && direction === lastDirectionRef.current) {
        return;
      }

      stepInDirection(direction, Math.abs(deltaY));
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, cooldownMs, commitSlideIndex, scrollToSection]);

  const activeSectionId = LANDING_SECTIONS[activeIndex]?.id ?? LANDING_SECTIONS[0].id;

  return {
    activeIndex,
    activeSectionId,
    scrollToSection,
  };
}
