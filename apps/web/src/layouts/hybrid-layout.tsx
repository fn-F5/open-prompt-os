import { Button, ToastViewport } from "@open-prompt-os/ui-web";
import { ChevronDown, ChevronUp, ShieldCheck, Terminal } from "lucide-react";
import * as React from "react";
import { Link, Outlet, useLocation } from "react-router";
import { AuthDialog } from "../components/auth/auth-dialog.js";
import { StorageAndNetworkBanner } from "../components/feedback/storage-banner.js";
import { MarketingScrollContent } from "../components/marketing/marketing-scroll-content.js";
import { AppNavbar, MarketingNavbar } from "../components/navigation/navbar.js";
import { AnonymousTour } from "../components/onboarding/anonymous-tour.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { useCardParallax } from "../hooks/use-card-parallax.js";
import { useGuestHydration } from "../hooks/use-guest-hydration.js";
import { useIdleTour } from "../hooks/use-idle-tour.js";
import { useReducedEffects } from "../hooks/use-reduced-effects.js";
import { LANDING_SECTIONS, useSectionScroll } from "../hooks/use-section-scroll.js";
import { openAuthDialog, useAuthDialogStore } from "../state/auth-dialog-store.js";
import { useComposerStore } from "../state/composer-store.js";

export function HybridLayout() {
  const { isAuthenticated, isLoading } = useAuthSession();
  const { isOpen: isAuthDialogOpen } = useAuthDialogStore();
  const { streamingBuffer } = useComposerStore();
  const { prefersReducedMotion, shouldReduceEffects } = useReducedEffects();
  const location = useLocation();

  // Trigger post-authentication guest interaction migration
  useGuestHydration();

  // Drive 3D tilt and cursor-following spotlight across cards
  useCardParallax(!prefersReducedMotion);

  const isIndexRoute = location.pathname === "/";
  const isFullPageDeck = !isAuthenticated && isIndexRoute;
  const isStreaming = streamingBuffer !== null;

  // Step through landing sections one slide per wheel gesture or navigation key
  const sectionScroll = useSectionScroll(isFullPageDeck);

  const tourController = useIdleTour({
    isAuthenticated,
    isAuthLoading: isLoading,
    isDialogOpen: isAuthDialogOpen,
    isTypingOrStreaming: isStreaming,
    prefersReducedMotion,
  });

  if (isLoading) {
    return (
      <div
        data-testid="auth-loading-shell"
        aria-busy="true"
        className="min-h-[100dvh] flex flex-col bg-[var(--page-bg)] text-[var(--text-primary)]"
      >
        <div className="h-20 border-b border-[var(--separator-subtle)] px-8 flex items-center justify-between">
          <div className="h-6 w-44 rounded-lg bg-[var(--surface-2)] animate-pulse" />
          <div className="h-9 w-32 rounded-lg bg-[var(--surface-2)] animate-pulse" />
        </div>
        <main id="main-workspace" className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-8 py-10">
          <div className="h-80 rounded-3xl bg-[var(--surface-1)] border border-[var(--separator-subtle)] animate-pulse" />
        </main>
      </div>
    );
  }

  const anonymousFooter = (
    <footer
      aria-label="Site footer"
      className="border-t border-[var(--separator-subtle)] bg-[var(--surface-1)]/80 py-10 sm:py-14 px-4 sm:px-8 text-sm text-[var(--text-secondary)] rounded-2xl"
    >
      <div className="mx-auto max-w-[1360px] grid grid-cols-1 md:grid-cols-12 gap-8 sm:gap-10 pb-8 sm:pb-10 border-b border-[var(--separator-subtle)]">
        <div className="md:col-span-5 space-y-4">
          <div className="inline-flex items-center gap-3 font-bold text-lg text-[var(--text-primary)]">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
              <Terminal className="w-4 h-4" />
            </span>
            <span>Open Prompt OS</span>
          </div>
          <p className="text-base text-[var(--text-secondary)] max-w-sm leading-relaxed">
            The complete lifecycle platform for creating, diagnosing, organizing, and sending
            high-performing AI prompts across any model.
          </p>
          <div className="inline-flex items-center gap-2 text-sm text-[var(--success-text)] font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>We never train on your prompts.</span>
          </div>
        </div>

        <div className="md:col-span-2 space-y-3">
          <div className="font-semibold text-[var(--text-primary)]">Product</div>
          <ul className="space-y-2.5">
            <li>
              <Link to="/" className="hover:text-[var(--text-primary)] focus-ring rounded">
                Prompt Composer
              </Link>
            </li>
            <li>
              <Link
                to="/improve"
                className="hover:text-[var(--text-primary)] focus-ring rounded"
              >
                Improve & Autopsy
              </Link>
            </li>
            <li>
              <Link
                to="/templates"
                className="hover:text-[var(--text-primary)] focus-ring rounded"
              >
                Template Gallery
              </Link>
            </li>
            <li>
              <Link
                to="/pricing"
                className="hover:text-[var(--text-primary)] focus-ring rounded"
              >
                Pricing Plans
              </Link>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2 space-y-3">
          <div className="font-semibold text-[var(--text-primary)]">Modes</div>
          <ul className="space-y-2.5">
            <li>
              <Link to="/" className="hover:text-[var(--text-primary)] focus-ring rounded">
                Text & Work Prompts
              </Link>
            </li>
            <li>
              <Link to="/" className="hover:text-[var(--text-primary)] focus-ring rounded">
                Image Studio Prompts
              </Link>
            </li>
            <li>
              <Link to="/" className="hover:text-[var(--text-primary)] focus-ring rounded">
                Cinema Video Prompts
              </Link>
            </li>
          </ul>
        </div>

        <div className="md:col-span-3 space-y-3">
          <div className="font-semibold text-[var(--text-primary)]">Workspace</div>
          <p className="text-sm text-[var(--text-secondary)]">
            Save your prompts and sync across devices with a free account.
          </p>
          <Button
            variant="solid"
            size="sm"
            onClick={() => openAuthDialog({ reason: "navbar_signin" })}
          >
            Sign in / Create Account
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1360px] pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-[var(--text-muted)]">
        <span>© {new Date().getFullYear()} Open Prompt OS. All rights reserved.</span>
        <span>PolyForm Noncommercial License 1.0.0</span>
      </div>
    </footer>
  );

  const compactSlideFooter = (
    <footer
      aria-label="Site footer"
      className="border-t border-[var(--separator-subtle)] pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-[var(--text-secondary)]"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-2 font-semibold text-[var(--text-primary)]">
          <Terminal className="w-4 h-4 text-[var(--accent-text)]" />
          <span>Open Prompt OS</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--success-text)] font-medium">
          <ShieldCheck className="w-4 h-4" />
          <span>We never train on your prompts.</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[var(--text-muted)]">
        <Link to="/improve" className="hover:text-[var(--text-primary)] focus-ring rounded">
          Improve & Autopsy
        </Link>
        <Link to="/templates" className="hover:text-[var(--text-primary)] focus-ring rounded">
          Templates
        </Link>
        <Link to="/pricing" className="hover:text-[var(--text-primary)] focus-ring rounded">
          Pricing
        </Link>
        <span>© {new Date().getFullYear()} Open Prompt OS</span>
      </div>
    </footer>
  );

  const nextSlide =
    sectionScroll.activeIndex < LANDING_SECTIONS.length - 1
      ? LANDING_SECTIONS[sectionScroll.activeIndex + 1]
      : null;

  return (
    <div
      className={`relative flex flex-col bg-[var(--page-bg)] text-[var(--text-primary)] isolate overflow-x-hidden ${
        isFullPageDeck ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
      }`}
    >
      {/* Top Hero Warm Wash & Subtle Radial Bloom */}
      {!shouldReduceEffects ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div
            className="absolute inset-x-0 top-0 h-[560px]"
            style={{
              background:
                "linear-gradient(180deg, var(--ambient-indigo) 0%, transparent 100%)",
            }}
          />
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-[780px] h-[440px] rounded-full blur-[120px]"
            style={{ backgroundColor: "var(--ambient-cyan)" }}
          />
        </div>
      ) : null}

      {/* 1. Global Skip Link */}
      <a
        href="#main-workspace"
        onClick={() => {
          if (isFullPageDeck) sectionScroll.scrollToSection(0);
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-[var(--surface-inverse)] focus:text-[var(--text-inverse)] focus:font-semibold"
      >
        Skip to main workspace
      </a>

      <StorageAndNetworkBanner />

      {/* 2. Navbar */}
      {isAuthenticated ? (
        <AppNavbar />
      ) : (
        <MarketingNavbar onReplayTour={tourController.replayTour} />
      )}

      {/* 3. Main Content: Locked FullPage Slide Deck on anonymous "/" vs normal scroll */}
      {isFullPageDeck ? (
        <div data-testid="fullpage-viewport" className="relative flex-1 overflow-hidden">
          <div
            data-testid="fullpage-track"
            className="flex flex-col h-full w-full will-change-transform"
            style={{
              transform: `translate3d(0, -${sectionScroll.activeIndex * 100}%, 0)`,
              transition: prefersReducedMotion
                ? "none"
                : "transform 550ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {/* Slide 0: Prompt Compiler */}
            <main
              id="main-workspace"
              data-section-id="landing_workspace"
              data-fp-active={sectionScroll.activeIndex === 0 ? "true" : "false"}
              className="fp-slide h-full w-full shrink-0 overflow-y-auto overscroll-contain flex flex-col justify-center px-4 sm:px-8 pt-2 pb-12"
            >
              <div className="fp-slide-inner mx-auto w-full max-w-[1360px]">
                <Outlet />
              </div>
            </main>

            {/* Slides 1–5: Marketing Showcase Slides */}
            <MarketingScrollContent
              activeSectionId={sectionScroll.activeSectionId}
              footer={compactSlideFooter}
            />
          </div>

          {/* Right-Side Vertical Dot Navigation Rail */}
          <nav
            aria-label="Landing page sections"
            data-testid="fullpage-nav"
            className="hidden md:flex absolute right-3 xl:right-6 top-1/2 -translate-y-1/2 z-30 flex-col items-end gap-2"
          >
            {LANDING_SECTIONS.map((section, index) => {
              const isActive = sectionScroll.activeIndex === index;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-label={`Go to ${section.label}`}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => sectionScroll.scrollToSection(index)}
                  className="group inline-flex items-center gap-2.5 py-1 px-1 cursor-pointer focus-ring rounded-full"
                >
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border opacity-0 translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 bg-[var(--surface-1)]/95 backdrop-blur-md shadow-sm ${
                      isActive
                        ? "border-[var(--accent-primary)] text-[var(--text-primary)]"
                        : "border-[var(--separator-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {section.shortLabel}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`block rounded-full transition-all duration-200 ${
                      isActive
                        ? "w-3 h-3 bg-[var(--accent-primary)] ring-4 ring-[var(--accent-glow)] shadow-sm"
                        : "w-2.5 h-2.5 bg-[var(--text-muted)]/60 group-hover:bg-[var(--text-primary)] group-hover:scale-110"
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Bottom-Center Next Section Indicator */}
          <button
            type="button"
            data-testid="fullpage-scroll-hint"
            onClick={() =>
              sectionScroll.scrollToSection(
                nextSlide ? sectionScroll.activeIndex + 1 : 0,
              )
            }
            className="hidden sm:inline-flex items-center gap-1.5 absolute bottom-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[var(--surface-1)]/85 backdrop-blur-md border border-[var(--separator-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--separator-strong)] shadow-sm transition-all cursor-pointer focus-ring"
          >
            {nextSlide ? (
              <>
                <span>{nextSlide.label}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--accent-text)]" />
              </>
            ) : (
              <>
                <span>Prompt Compiler</span>
                <ChevronUp className="w-3.5 h-3.5 text-[var(--accent-text)]" />
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <main
            id="main-workspace"
            className="flex-1 mx-auto w-full max-w-[1360px] px-4 sm:px-8 pt-3 sm:pt-8 pb-8 sm:pb-12"
          >
            <Outlet />
          </main>

          {isAuthenticated ? (
            <footer
              aria-label="Workspace status footer"
              className="border-t border-[var(--separator-subtle)] py-4 px-4 sm:px-8 text-sm text-[var(--text-secondary)]"
            >
              <div className="mx-auto max-w-[1360px] flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--success-text)]" />
                  <span>Open Prompt OS · Authenticated Workspace</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--success-text)]" />
                  <span>We never train on your prompts</span>
                </span>
              </div>
            </footer>
          ) : (
            anonymousFooter
          )}
        </>
      )}

      {/* 6. Global Dialogs, Onboarding Tour & Toasts */}
      <AuthDialog />
      {isFullPageDeck ? <AnonymousTour controller={tourController} /> : null}
      <ToastViewport />
    </div>
  );
}
