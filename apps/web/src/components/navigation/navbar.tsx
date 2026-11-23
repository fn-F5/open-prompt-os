import { DEFAULT_PRICING_PLANS } from "@open-prompt-os/contracts";
import { Button } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Menu, MessageSquarePlus, Moon, Sun, User, X } from "lucide-react";
import * as React from "react";
import { Link, useLocation } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { trackAnalyticsEvent } from "../../lib/analytics-events.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { safeGetItem, safeSetItem } from "../../lib/storage.js";
import { openAuthDialog } from "../../state/auth-dialog-store.js";
import { openFeedbackDialog } from "../../state/feedback-dialog-store.js";
import { BrandLogo } from "../brand/brand-logo.js";

const THEME_STORAGE_KEY = "open-prompt-os:theme";

function getSystemTheme(): "dark" | "light" {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}

function useThemeMode() {
  const [userOverride, setUserOverride] = React.useState<"dark" | "light" | null>(() => {
    const saved = safeGetItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  });

  const [systemTheme, setSystemTheme] = React.useState<"dark" | "light">(() => getSystemTheme());
  const theme = userOverride ?? systemTheme;

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "light" : "dark");
    };
    mql.addEventListener?.("change", handleChange);
    return () => {
      mql.removeEventListener?.("change", handleChange);
    };
  }, []);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        themeColorMeta.setAttribute("content", theme === "light" ? "#F2F5FA" : "#0F0F11");
      }
    }
  }, [theme]);

  const selectTheme = React.useCallback((next: "dark" | "light") => {
    setUserOverride(next);
    safeSetItem(THEME_STORAGE_KEY, next);
  }, []);

  const toggleTheme = React.useCallback(() => {
    selectTheme(theme === "dark" ? "light" : "dark");
  }, [theme, selectTheme]);

  return { theme, toggleTheme, selectTheme };
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  readonly theme: "dark" | "light";
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-analytics-tracked="true"
      onClick={() => {
        trackAnalyticsEvent("navigation:theme_toggle_click", {
          next_theme: theme === "dark" ? "light" : "dark",
        });
        onToggle();
      }}
      aria-label={`Theme is ${theme}. Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="inline-flex items-center justify-center w-9 h-9 min-w-[38px] min-h-[38px] shrink-0 rounded-xl bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)] transition-colors focus-ring cursor-pointer"
    >
      {theme === "dark" ? (
        <Moon className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
      ) : (
        <Sun className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
      )}
    </button>
  );
}

export function MarketingNavbar() {
  const location = useLocation();
  const { theme, toggleTheme } = useThemeMode();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const navLinks = [
    { to: "/", label: "Compiler" },
    { to: "/reverse-engineer", label: "Reverse Engineer" },
    { to: "/improve", label: "Improve & Autopsy" },
    { to: "/pricing", label: "Pricing" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full glass-surface rounded-none border-t-0 border-x-0">
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 xl:gap-5 min-w-0">
          <Link
            to="/"
            data-analytics-tracked="true"
            onClick={() =>
              trackAnalyticsEvent("navigation:brand_logo_click", {
                target_path: "/",
                nav_surface: "marketing_navbar",
              })
            }
            className="inline-flex items-center gap-2.5 sm:gap-3 font-bold tracking-tight text-base sm:text-lg whitespace-nowrap shrink-0 focus-ring rounded-xl py-1"
          >
            <BrandLogo className="w-9 h-9 shrink-0 shadow-sm" />
            <span>Open Prompt OS</span>
          </Link>

          <nav
            aria-label="Primary marketing navigation"
            className="hidden lg:flex items-center gap-0.5 xl:gap-1.5 min-w-0"
          >
            {navLinks.map((item) => {
              const isActive =
                item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  data-analytics-tracked="true"
                  onClick={() =>
                    trackAnalyticsEvent("navigation:nav_link_click", {
                      link_name: item.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                      target_path: item.to,
                      nav_surface: "marketing_navbar",
                      is_authenticated: false,
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-xl text-xs xl:text-sm whitespace-nowrap shrink-0 transition-all focus-ring ${
                    isActive
                      ? "bg-[var(--accent-subtle-bg)] text-[var(--text-primary)] font-semibold border border-[var(--separator-strong)] shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] font-medium border border-transparent"
                  }`}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full bg-[var(--accent-primary)]"
                    />
                  ) : null}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:flex items-center gap-2 xl:gap-3 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Send feedback or feature request"
            className="whitespace-nowrap shrink-0"
            data-analytics-tracked="true"
            onClick={() => {
              trackAnalyticsEvent("feedback:open_button_click", {
                source: "navbar",
                feedback_kind: "feature_request",
              });
              openFeedbackDialog({ defaultKind: "feature_request", source: "navbar" });
            }}
          >
            <MessageSquarePlus className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
            <span>Feedback</span>
          </Button>

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          <Button
            variant="ghost"
            size="sm"
            className="whitespace-nowrap shrink-0"
            data-analytics-tracked="true"
            onClick={() => {
              trackAnalyticsEvent("auth:sign_in_button_click", {
                source: "navbar",
                auth_mode: "signin",
              });
              openAuthDialog({ reason: "navbar_signin", mode: "signin" });
            }}
          >
            Sign In
          </Button>
          <Button
            variant="solid"
            size="sm"
            className="whitespace-nowrap shrink-0"
            data-analytics-tracked="true"
            onClick={() => {
              trackAnalyticsEvent("auth:get_started_button_click", {
                source: "navbar",
                auth_mode: "signup",
              });
              openAuthDialog({ reason: "navbar_signin", mode: "signup" });
            }}
          >
            Get Started
          </Button>
        </div>

        <div className="flex lg:hidden items-center gap-2 shrink-0">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <Button
            variant="icon"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            data-analytics-tracked="true"
            onClick={() => {
              trackAnalyticsEvent("navigation:mobile_menu_click", {
                menu_state: mobileOpen ? "close" : "open",
                nav_surface: "marketing_navbar",
              });
              setMobileOpen((o) => !o);
            }}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden border-t border-[var(--separator-subtle)] bg-[var(--surface-1)] px-4 py-5 space-y-2"
        >
          {navLinks.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-base ${
                  isActive
                    ? "bg-[var(--accent-subtle-bg)] text-[var(--text-primary)] font-semibold border border-[var(--separator-strong)]"
                    : "text-[var(--text-secondary)] font-medium"
                }`}
              >
                {isActive ? (
                  <span
                    className="w-2 h-2 rounded-full bg-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                ) : null}
                <span>{item.label}</span>
              </Link>
            );
          })}
          <div className="pt-3 flex flex-col gap-2.5 border-t border-[var(--separator-subtle)]">
            <Button
              variant="ghost"
              onClick={() => {
                setMobileOpen(false);
                openFeedbackDialog({ defaultKind: "feature_request", source: "navbar" });
              }}
            >
              <MessageSquarePlus className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
              <span>Feedback &amp; Feature Requests</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setMobileOpen(false);
                openAuthDialog({ reason: "navbar_signin", mode: "signin" });
              }}
            >
              Sign In
            </Button>
            <Button
              variant="solid"
              onClick={() => {
                setMobileOpen(false);
                openAuthDialog({ reason: "navbar_signin", mode: "signup" });
              }}
            >
              Get Started
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function AppNavbar() {
  const location = useLocation();
  const { user } = useAuthSession();
  const { theme, toggleTheme } = useThemeMode();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const billingQuery = useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: () => orpcClient.billing.status(),
  });

  const navLinks = [
    { to: "/", label: "Compiler" },
    { to: "/reverse-engineer", label: "Reverse Engineer" },
    { to: "/improve", label: "Improve & Autopsy" },
    { to: "/library", label: "Library" },
    { to: "/history", label: "History" },
  ];

  const isSettingsActive = location.pathname.startsWith("/settings");

  const defaultFreeLimit =
    DEFAULT_PRICING_PLANS.find((plan) => plan.id === "free")?.dailyPromptLimit ?? 20;
  const limit = billingQuery.data?.dailyLimit ?? defaultFreeLimit;
  const remaining = billingQuery.data?.remainingDailyPrompts ?? limit;

  return (
    <header className="sticky top-0 z-40 w-full glass-surface rounded-none border-t-0 border-x-0">
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 xl:gap-4 min-w-0">
          <Link
            to="/"
            data-analytics-tracked="true"
            onClick={() =>
              trackAnalyticsEvent("navigation:brand_logo_click", {
                target_path: "/",
                nav_surface: "app_navbar",
              })
            }
            className="inline-flex items-center gap-2.5 font-bold tracking-tight text-base sm:text-lg whitespace-nowrap shrink-0 focus-ring rounded-xl py-1"
          >
            <BrandLogo className="w-9 h-9 shrink-0 shadow-sm" />
            <span>Open Prompt OS</span>
          </Link>

          <nav
            aria-label="Workspace navigation"
            className="hidden lg:flex items-center gap-0.5 xl:gap-1.5 min-w-0"
          >
            {navLinks.map((item) => {
              const isActive =
                location.pathname === item.to ||
                (item.to !== "/" && location.pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  data-analytics-tracked="true"
                  onClick={() =>
                    trackAnalyticsEvent("navigation:nav_link_click", {
                      link_name: item.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                      target_path: item.to,
                      nav_surface: "marketing_navbar",
                      is_authenticated: false,
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-xl text-xs xl:text-sm whitespace-nowrap shrink-0 transition-all focus-ring ${
                    isActive
                      ? "bg-[var(--accent-subtle-bg)] text-[var(--text-primary)] font-semibold border border-[var(--separator-strong)] shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] font-medium border border-transparent"
                  }`}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full bg-[var(--accent-primary)]"
                    />
                  ) : null}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:flex items-center gap-2 xl:gap-2.5 shrink-0">
          <span
            aria-label="Daily prompt quota"
            className="hidden 2xl:inline-flex text-xs text-[var(--text-secondary)] tabular-nums whitespace-nowrap shrink-0 px-2.5 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]"
          >
            {remaining}/{limit} runs left
          </span>

          <Button
            variant="ghost"
            size="sm"
            aria-label="Send feedback or feature request"
            className="whitespace-nowrap shrink-0"
            data-analytics-tracked="true"
            onClick={() => {
              trackAnalyticsEvent("feedback:open_button_click", {
                source: "navbar",
                feedback_kind: "feature_request",
              });
              openFeedbackDialog({ defaultKind: "feature_request", source: "navbar" });
            }}
          >
            <MessageSquarePlus className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
            <span className="hidden xl:inline">Feedback</span>
          </Button>

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          <Link
            to="/settings/profile"
            aria-label={user?.name ?? "Operator"}
            aria-current={isSettingsActive ? "page" : undefined}
            data-analytics-tracked="true"
            onClick={() =>
              trackAnalyticsEvent("navigation:nav_link_click", {
                link_name: "settings_profile",
                target_path: "/settings/profile",
                nav_surface: "app_navbar",
                is_authenticated: true,
              })
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs xl:text-sm whitespace-nowrap shrink-0 transition-colors focus-ring ${
              isSettingsActive
                ? "bg-[var(--accent-subtle-bg)] text-[var(--text-primary)] font-semibold border border-[var(--separator-strong)] shadow-sm"
                : "bg-[var(--surface-2)] text-[var(--text-primary)] font-medium border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)]"
            }`}
          >
            <User className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
            <span className="max-w-[120px] xl:max-w-[150px] truncate">
              {user?.name ?? "Operator"}
            </span>
          </Link>
        </div>

        <div className="flex lg:hidden items-center gap-2 shrink-0">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <Button
            variant="icon"
            aria-label={mobileOpen ? "Close workspace menu" : "Open workspace menu"}
            aria-expanded={mobileOpen}
            data-analytics-tracked="true"
            onClick={() => {
              trackAnalyticsEvent("navigation:mobile_menu_click", {
                menu_state: mobileOpen ? "close" : "open",
                nav_surface: "app_navbar",
              });
              setMobileOpen((o) => !o);
            }}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <nav
          aria-label="Mobile workspace navigation"
          className="lg:hidden border-t border-[var(--separator-subtle)] bg-[var(--surface-1)] px-4 py-5 space-y-2"
        >
          {navLinks.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-base ${
                  isActive
                    ? "bg-[var(--accent-subtle-bg)] text-[var(--text-primary)] font-semibold border border-[var(--separator-strong)]"
                    : "text-[var(--text-secondary)] font-medium"
                }`}
              >
                {isActive ? (
                  <span
                    className="w-2 h-2 rounded-full bg-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                ) : null}
                <span>{item.label}</span>
              </Link>
            );
          })}
          <div className="pt-3 border-t border-[var(--separator-subtle)] space-y-2.5">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setMobileOpen(false);
                openFeedbackDialog({ defaultKind: "feature_request", source: "navbar" });
              }}
            >
              <MessageSquarePlus className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
              <span>Feedback &amp; Feature Requests</span>
            </Button>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[var(--text-secondary)] tabular-nums">
                {remaining}/{limit} runs left
              </span>
              <Link
                to="/settings/profile"
                aria-current={isSettingsActive ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)] focus-ring max-w-[180px]"
              >
                <User className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                <span className="truncate">{user?.name ?? "Operator"}</span>
              </Link>
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
