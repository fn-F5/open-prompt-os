import { Button, ToastViewport } from "@open-prompt-os/ui-web";
import { ShieldCheck, Terminal } from "lucide-react";
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
  const isStreaming = streamingBuffer !== null;

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

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-[var(--page-bg)] text-[var(--text-primary)] isolate overflow-x-hidden">
      {/* Top Hero Warm Wash & Subtle Radial Bloom */}
      {!shouldReduceEffects ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div
            className="absolute inset-x-0 top-0 h-[560px]"
            style={{
              background: "linear-gradient(180deg, var(--ambient-indigo) 0%, transparent 100%)",
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

      {/* 3. Main Product Workspace */}
      <main
        id="main-workspace"
        className="flex-1 mx-auto w-full max-w-[1360px] px-4 sm:px-8 pt-2 sm:pt-4 pb-8 sm:pb-12"
      >
        <Outlet />
      </main>

      {/* 4. Anonymous-only marketing content below the fold on index route */}
      {!isAuthenticated && isIndexRoute ? <MarketingScrollContent /> : null}

      {/* 5. Footer: Structured multi-column footer for anonymous; compact bar for authenticated */}
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
        <footer
          aria-label="Site footer"
          className="border-t border-[var(--separator-subtle)] bg-[var(--surface-1)]/80 py-12 sm:py-16 px-4 sm:px-8 text-sm text-[var(--text-secondary)]"
        >
          <div className="mx-auto max-w-[1360px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 sm:gap-10 pb-10 sm:pb-12 border-b border-[var(--separator-subtle)]">
            <div className="sm:col-span-2 lg:col-span-5 space-y-4">
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

            <div className="lg:col-span-2 space-y-3">
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

            <div className="lg:col-span-2 space-y-3">
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

            <div className="sm:col-span-2 lg:col-span-3 space-y-3">
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

          <div className="mx-auto max-w-[1360px] pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-[var(--text-muted)]">
            <span>© {new Date().getFullYear()} Open Prompt OS. All rights reserved.</span>
            <span>PolyForm Noncommercial License 1.0.0</span>
          </div>
        </footer>
      )}

      {/* 6. Global Dialogs, Onboarding Tour & Toasts */}
      <AuthDialog />
      {!isAuthenticated && isIndexRoute ? <AnonymousTour controller={tourController} /> : null}
      <ToastViewport />
    </div>
  );
}
