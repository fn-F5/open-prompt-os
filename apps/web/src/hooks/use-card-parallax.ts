import * as React from "react";
import { authClient } from "../lib/auth-client.js";

/**
 * Per-card hover animation toggles when authenticated (3D tilt + spotlight).
 * Anonymous pages animate all cards; once logged in, only Templates cards keep hover animations.
 */
export const CARD_HOVER_ANIMATION = {
  profileIdentity: false,
  profileBilling: false,
  settingsAuthGate: true,
  outputLoading: false,
  outputResult: false,
  improveInput: false,
  improveOutput: false,
  reverseEngineerInput: false,
  reverseEngineerOutput: false,
  historyAuthGate: true,
  historyLoading: false,
  historyEmpty: false,
  historyItem: false,
  libraryAuthGate: true,
  libraryEmpty: false,
  libraryItem: false,
  templateGalleryEmpty: true,
  templateGalleryItem: true,
  templateDetailLoading: true,
  templateDetailNotFound: true,
  templateDetailMain: true,
  templateDetailRelated: true,
  pricingPlanCard: false,
  pricingPrivacyBanner: false,
  docsHubEmpty: false,
  docsHubItem: false,
  docsArticleNotFound: false,
  docsArticleHeader: false,
  docsArticleSection: false,
  docsArticleRelatedTemplates: false,
  docsArticleContinueReading: false,
  publicPromptNotFound: false,
  publicPromptMain: false,
  billingReturnCard: false,
  notFoundCard: false,
  marketingBeforeCard: true,
  marketingAfterCard: true,
  marketingBentoCard: true,
  marketingShowcaseTab: true,
  marketingFaqCard: true,
};

export type CardAnimationKey = keyof typeof CARD_HOVER_ANIMATION;

/**
 * Returns whether a card should animate on hover given authentication state.
 * All cards animate for anonymous visitors; logged-in sessions use `CARD_HOVER_ANIMATION`.
 */
export function shouldAnimateCard(key: CardAnimationKey, isAuthenticated: boolean): boolean {
  if (!isAuthenticated) return true;
  return CARD_HOVER_ANIMATION[key];
}

/**
 * Reactively resolves per-card hover animation flags from the current auth session.
 */
export function useCardHoverAnimation(): (key: CardAnimationKey) => boolean {
  const isAuthenticated = React.useSyncExternalStore(
    (listener) => authClient.subscribe(listener),
    () => authClient.getSession().isAuthenticated,
    () => authClient.getSession().isAuthenticated,
  );
  return React.useCallback(
    (key: CardAnimationKey) => shouldAnimateCard(key, isAuthenticated),
    [isAuthenticated],
  );
}

const PARALLAX_CARD_SELECTOR =
  '.flat-surface:not([data-animate="false"]), .glow-card:not([data-animate="false"])';

/**
 * Updates 3D tilt (`--rx`, `--ry`) and cursor-following spotlight (`--mx`, `--my`)
 * CSS custom properties on a card element matching openpromptos.com.
 */
export function updateCardParallax(card: HTMLElement, clientX: number, clientY: number): void {
  if (card.getAttribute("data-animate") === "false") return;
  const rect = card.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const r = (clientX - rect.left) / rect.width - 0.5;
  const i = (clientY - rect.top) / rect.height - 0.5;

  card.style.setProperty("--rx", `${(-i * 6).toFixed(2)}deg`);
  card.style.setProperty("--ry", `${(r * 8).toFixed(2)}deg`);
  card.style.setProperty("--mx", `${((r + 0.5) * 100).toFixed(1)}%`);
  card.style.setProperty("--my", `${((i + 0.5) * 100).toFixed(1)}%`);
}

/**
 * Resets 3D tilt angles (`--rx`, `--ry`) back to 0deg while leaving the last spotlight position.
 */
export function resetCardParallax(card: HTMLElement): void {
  card.style.setProperty("--rx", "0deg");
  card.style.setProperty("--ry", "0deg");
}

/**
 * Attaches delegated pointer tracking to drive 3D hover tilt and radial spotlight glow
 * across all `.flat-surface` and `.glow-card` elements in the document.
 */
export function useCardParallax(enabled: boolean): void {
  const activeCardRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      if (activeCardRef.current) {
        resetCardParallax(activeCardRef.current);
        activeCardRef.current = null;
      }
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") return;

      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest<HTMLElement>(PARALLAX_CARD_SELECTOR) ?? null;

      if (activeCardRef.current && activeCardRef.current !== card) {
        resetCardParallax(activeCardRef.current);
      }

      if (card) {
        activeCardRef.current = card;
        updateCardParallax(card, event.clientX, event.clientY);
      } else {
        activeCardRef.current = null;
      }
    };

    const handlePointerOut = (event: PointerEvent) => {
      const active = activeCardRef.current;
      if (!active) return;

      const related = event.relatedTarget as Node | null;
      if (!related || !active.contains(related)) {
        resetCardParallax(active);
        activeCardRef.current = null;
      }
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerout", handlePointerOut, { passive: true });

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerout", handlePointerOut);
      if (activeCardRef.current) {
        resetCardParallax(activeCardRef.current);
        activeCardRef.current = null;
      }
    };
  }, [enabled]);
}
