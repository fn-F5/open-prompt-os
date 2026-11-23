import { Button, ToastViewport } from "@open-prompt-os/ui-web";
import { ShieldCheck } from "lucide-react";
import * as React from "react";
import { Link, Outlet, useLocation } from "react-router";
import { AuthDialog } from "../components/auth/auth-dialog.js";
import { BrandLogo } from "../components/brand/brand-logo.js";
import { GitHubLogo } from "../components/brand/github-logo.js";
import { FeedbackDialog } from "../components/feedback/feedback-dialog.js";
import { StorageAndNetworkBanner } from "../components/feedback/storage-banner.js";
import { MarketingScrollContent } from "../components/marketing/marketing-scroll-content.js";
import { AppNavbar, MarketingNavbar } from "../components/navigation/navbar.js";
import { AnonymousTour } from "../components/onboarding/anonymous-tour.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { useCardParallax } from "../hooks/use-card-parallax.js";
import { useGuestHydration } from "../hooks/use-guest-hydration.js";
import { useIdleTour } from "../hooks/use-idle-tour.js";
import { useReducedEffects } from "../hooks/use-reduced-effects.js";
import { trackAnalyticsEvent } from "../lib/analytics-events.js";
import { identifyPostHogUser, resetPostHogUser } from "../lib/posthog.js";
import { flushPendingSignupReferral } from "../lib/signup-referral.js";
import { openAuthDialog, useAuthDialogStore } from "../state/auth-dialog-store.js";
import { useComposerStore } from "../state/composer-store.js";
import { openFeedbackDialog } from "../state/feedback-dialog-store.js";

export function HybridLayout() {
  const { isAuthenticated, isLoading, user } = useAuthSession();
  const { isOpen: isAuthDialogOpen } = useAuthDialogStore();
  const { streamingBuffer } = useComposerStore();
  const { prefersReducedMotion, shouldReduceEffects } = useReducedEffects();
  const location = useLocation();
  const lastTrackedPathRef = React.useRef<string | null>(null);
  const identifiedUserIdRef = React.useRef<string | null>(null);

  // Trigger post-authentication guest interaction migration
  useGuestHydration();

  // Identify authenticated user in PostHog with internal UUID (no PII)
  React.useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user?.id) {
      if (identifiedUserIdRef.current !== user.id) {
        identifyPostHogUser(user.id);
        identifiedUserIdRef.current = user.id;
      }
    } else if (identifiedUserIdRef.current !== null) {
      resetPostHogUser();
      identifiedUserIdRef.current = null;
    }
  }, [isAuthenticated, isLoading, user?.id]);

  // Track route views across SPA navigation
  React.useEffect(() => {
    if (isLoading) return;
    if (lastTrackedPathRef.current === location.pathname) return;
    lastTrackedPathRef.current = location.pathname;
    trackAnalyticsEvent("navigation:route_view", {
      route_path: location.pathname,
      is_authenticated: isAuthenticated,
    });
  }, [isAuthenticated, isLoading, location.pathname]);

  // Flush any pending OAuth signup attribution once authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      void flushPendingSignupReferral();
    }
  }, [isAuthenticated]);

  // Drive 3D tilt and cursor-following spotlight across cards on anonymous pages and Templates
  const isTemplatesRoute =
    location.pathname === "/templates" || location.pathname.startsWith("/templates/");
  useCardParallax(!prefersReducedMotion && (!isAuthenticated || isTemplatesRoute));

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
      {isAuthenticated ? <AppNavbar /> : <MarketingNavbar />}

      {/* 3. Main Product Workspace + Anonymous Marketing Content */}
      <main
        id="main-workspace"
        className={`flex-1 mx-auto w-full max-w-[1360px] px-4 sm:px-8 ${
          isIndexRoute ? "min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] " : ""
        }${
          !isAuthenticated && isIndexRoute
            ? "pt-4 pb-8 sm:pt-7 sm:pb-12"
            : "pt-3 sm:pt-6 pb-8 sm:pb-12"
        }`}
      >
        <div
          className={
            !isAuthenticated && isIndexRoute
              ? "min-h-[calc(100dvh-4.5rem)] sm:min-h-[calc(100dvh-5.75rem)]"
              : undefined
          }
        >
          <Outlet />
        </div>
        {!isAuthenticated && isIndexRoute ? <MarketingScrollContent /> : null}
      </main>

      {/* 5. Footer: Structured multi-column footer for both guests and authenticated users */}
      <footer
        aria-label="Site footer"
        className="border-t border-[var(--separator-subtle)] bg-[var(--surface-1)]/80 py-12 sm:py-16 px-4 sm:px-8 text-sm text-[var(--text-secondary)]"
      >
        <div className="mx-auto max-w-[1360px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 sm:gap-10 pb-10 sm:pb-12 border-b border-[var(--separator-subtle)]">
          <div className="sm:col-span-2 lg:col-span-4 space-y-4">
            <div className="inline-flex items-center gap-3 font-bold text-lg text-[var(--text-primary)]">
              <BrandLogo className="w-8 h-8 shrink-0 shadow-sm" />
              <span>Open Prompt OS</span>
            </div>
            <p className="text-base text-[var(--text-secondary)] max-w-sm leading-relaxed">
              The complete lifecycle platform for creating, diagnosing, organizing, and sending
              high-performing AI prompts across any model.
            </p>
            <div className="flex flex-col items-start gap-2.5">
              <div className="inline-flex items-center gap-2 text-sm text-[var(--success-text)] font-medium">
                <ShieldCheck className="w-4 h-4" />
                <span>We never train on your prompts.</span>
              </div>
              <a
                href="https://github.com/fn-F5/open-prompt-os"
                target="_blank"
                rel="noopener noreferrer"
                data-analytics-tracked="true"
                onClick={() =>
                  trackAnalyticsEvent("navigation:footer_link_click", {
                    link_name: "github",
                    target_path: "https://github.com/fn-F5/open-prompt-os",
                    is_external: true,
                  })
                }
                className="inline-flex items-center gap-2.5 text-base font-medium text-[var(--text-primary)] hover:text-[var(--accent-text)] transition-colors focus-ring rounded"
              >
                <GitHubLogo className="w-5 h-5 shrink-0" />
                <span>Open Source on GitHub</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <div className="font-semibold text-[var(--text-primary)]">Product</div>
            <ul className="space-y-2.5">
              <li>
                <Link to="/" className="hover:text-[var(--text-primary)] focus-ring rounded">
                  Prompt Compiler
                </Link>
              </li>
              <li>
                <Link to="/improve" className="hover:text-[var(--text-primary)] focus-ring rounded">
                  Improve & Autopsy
                </Link>
              </li>
              <li>
                <Link
                  to="/reverse-engineer"
                  className="hover:text-[var(--text-primary)] focus-ring rounded"
                >
                  Reverse Engineer
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
                <Link to="/pricing" className="hover:text-[var(--text-primary)] focus-ring rounded">
                  Pricing Plans
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  data-analytics-tracked="true"
                  onClick={() => {
                    trackAnalyticsEvent("feedback:open_button_click", {
                      source: "footer",
                      feedback_kind: "feature_request",
                    });
                    openFeedbackDialog({ defaultKind: "feature_request", source: "footer" });
                  }}
                  className="hover:text-[var(--text-primary)] focus-ring rounded cursor-pointer text-left"
                >
                  Feedback &amp; Feature Requests
                </button>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-3 space-y-3">
            <div className="font-semibold text-[var(--text-primary)]">Docs & Guides</div>
            <ul className="space-y-2.5">
              <li>
                <Link to="/docs" className="hover:text-[var(--text-primary)] focus-ring rounded">
                  Documentation Hub
                </Link>
              </li>
              <li>
                <Link
                  to="/docs/prompt-frameworks-costar-rise-care-cot"
                  className="hover:text-[var(--text-primary)] focus-ring rounded"
                >
                  CO-STAR, RISE, CARE & CoT
                </Link>
              </li>
              <li>
                <Link
                  to="/docs/prompt-autopsy-and-debugging"
                  className="hover:text-[var(--text-primary)] focus-ring rounded"
                >
                  Prompt Autopsy Guide
                </Link>
              </li>
              <li>
                <Link
                  to="/docs/privacy-and-security"
                  className="hover:text-[var(--text-primary)] focus-ring rounded"
                >
                  Zero-Training Privacy
                </Link>
              </li>
              <li>
                <a
                  href="/llms.txt"
                  className="hover:text-[var(--text-primary)] focus-ring rounded font-mono text-xs"
                >
                  llms.txt
                </a>
                {" · "}
                <a
                  href="/sitemap.xml"
                  className="hover:text-[var(--text-primary)] focus-ring rounded font-mono text-xs"
                >
                  sitemap.xml
                </a>
              </li>
            </ul>
          </div>

          <div className="sm:col-span-2 lg:col-span-3 space-y-3">
            <div className="font-semibold text-[var(--text-primary)]">Workspace</div>
            {isAuthenticated ? (
              <ul className="space-y-2.5">
                <li>
                  <Link
                    to="/library"
                    className="hover:text-[var(--text-primary)] focus-ring rounded"
                  >
                    Prompt Library
                  </Link>
                </li>
                <li>
                  <Link
                    to="/library?tab=history"
                    className="hover:text-[var(--text-primary)] focus-ring rounded"
                  >
                    Prompt History
                  </Link>
                </li>
                <li>
                  <Link
                    to="/settings/profile"
                    className="hover:text-[var(--text-primary)] focus-ring rounded"
                  >
                    Account &amp; Settings
                  </Link>
                </li>
              </ul>
            ) : (
              <>
                <p className="text-sm text-[var(--text-secondary)]">
                  Save your prompts and sync across devices with a free account.
                </p>
                <Button
                  variant="solid"
                  size="sm"
                  data-analytics-tracked="true"
                  onClick={() => {
                    trackAnalyticsEvent("auth:get_started_button_click", {
                      source: "footer",
                      auth_mode: "signup",
                    });
                    openAuthDialog({ reason: "navbar_signin", mode: "signup" });
                  }}
                >
                  Sign in / Create Account
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-[1360px] pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-[var(--text-muted)]">
          <span>© {new Date().getFullYear()} Open Prompt OS. All rights reserved.</span>
          <span>PolyForm Noncommercial License 1.0.0</span>
        </div>
      </footer>

      {/* 6. Global Dialogs, Onboarding Tour & Toasts */}
      <AuthDialog />
      <FeedbackDialog />
      {!isAuthenticated && isIndexRoute ? <AnonymousTour controller={tourController} /> : null}
      <ToastViewport />
    </div>
  );
}
