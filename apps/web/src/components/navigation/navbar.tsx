import { Badge, Button } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, LogOut, Menu, Moon, Sun, Terminal, User, X } from "lucide-react";
import * as React from "react";
import { Link, useLocation } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { safeGetItem, safeSetItem } from "../../lib/storage.js";
import { openAuthDialog } from "../../state/auth-dialog-store.js";

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
        themeColorMeta.setAttribute("content", theme === "light" ? "#F1F5F9" : "#07090E");
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

function LabeledThemeSwitch({
  theme,
  onToggle,
}: {
  readonly theme: "dark" | "light";
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Theme is ${theme}. Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)] text-xs sm:text-sm transition-colors focus-ring cursor-pointer"
    >
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
          theme === "dark"
            ? "bg-[var(--surface-1)] text-[var(--text-primary)] font-semibold border border-[var(--accent-primary)] shadow-sm"
            : "text-[var(--text-secondary)] font-medium border border-transparent"
        }`}
      >
        <Moon className="w-3.5 h-3.5 text-[var(--accent-text)]" />
        <span>Dark</span>
      </span>
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
          theme === "light"
            ? "bg-[var(--surface-1)] text-[var(--text-primary)] font-semibold border border-[var(--accent-primary)] shadow-sm"
            : "text-[var(--text-secondary)] font-medium border border-transparent"
        }`}
      >
        <Sun className="w-3.5 h-3.5 text-[var(--accent-text)]" />
        <span>Light</span>
      </span>
    </button>
  );
}

export interface NavbarProps {
  readonly onReplayTour?: () => void;
}

export function MarketingNavbar({ onReplayTour }: NavbarProps) {
  const location = useLocation();
  const { theme, toggleTheme } = useThemeMode();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const navLinks = [
    { to: "/", label: "Composer" },
    { to: "/improve", label: "Improve & Autopsy" },
    { to: "/templates", label: "Templates" },
    { to: "/pricing", label: "Pricing" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full glass-surface border-t-0 border-x-0">
      <div className="mx-auto max-w-[1360px] px-4 sm:px-8 h-14 sm:h-20 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="inline-flex items-center gap-3 font-bold tracking-tight text-base sm:text-lg focus-ring rounded-xl py-1"
          >
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
              <Terminal className="w-4 h-4" />
            </span>
            <span>Open Prompt OS</span>
          </Link>

          <nav
            aria-label="Primary marketing navigation"
            className="hidden md:flex items-center gap-1.5"
          >
            {navLinks.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all focus-ring ${
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

        <div className="hidden md:flex items-center gap-3">
          {onReplayTour ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReplayTour}
              aria-label="Replay interactive tour"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Tour</span>
            </Button>
          ) : null}

          <LabeledThemeSwitch theme={theme} onToggle={toggleTheme} />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => openAuthDialog({ reason: "navbar_signin" })}
          >
            Sign in
          </Button>
          <Button
            variant="solid"
            size="sm"
            onClick={() => openAuthDialog({ reason: "navbar_signin" })}
          >
            Get Started Free
          </Button>
        </div>

        <div className="flex md:hidden items-center gap-2">
          <LabeledThemeSwitch theme={theme} onToggle={toggleTheme} />
          <Button
            variant="icon"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden border-t border-[var(--separator-subtle)] bg-[var(--surface-1)] px-4 py-5 space-y-2"
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
              variant="secondary"
              onClick={() => {
                setMobileOpen(false);
                openAuthDialog({ reason: "navbar_signin" });
              }}
            >
              Sign in
            </Button>
            <Button
              variant="solid"
              onClick={() => {
                setMobileOpen(false);
                openAuthDialog({ reason: "navbar_signin" });
              }}
            >
              Get Started Free
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function AppNavbar() {
  const location = useLocation();
  const { user, signOut } = useAuthSession();
  const { theme, toggleTheme } = useThemeMode();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const billingQuery = useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: () => orpcClient.billing.status(),
  });

  const navLinks = [
    { to: "/", label: "Composer" },
    { to: "/improve", label: "Improve" },
    { to: "/library", label: "Library" },
    { to: "/templates", label: "Templates" },
    { to: "/settings/profile", label: "Settings" },
  ];

  const remaining = billingQuery.data?.remainingDailyPrompts ?? 48;
  const limit = billingQuery.data?.dailyLimit ?? 50;

  return (
    <header className="sticky top-0 z-40 w-full glass-surface border-t-0 border-x-0">
      <div className="mx-auto max-w-[1360px] px-4 sm:px-8 h-14 sm:h-20 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="inline-flex items-center gap-3 font-bold tracking-tight text-base sm:text-lg focus-ring rounded-xl py-1"
          >
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
              <Terminal className="w-4 h-4" />
            </span>
            <span>Open Prompt OS</span>
          </Link>

          {user?.spaceName ? (
            <Badge variant="framework" className="hidden sm:inline-flex">
              {user.spaceName}
            </Badge>
          ) : null}

          <nav aria-label="Workspace navigation" className="hidden md:flex items-center gap-1.5">
            {navLinks.map((item) => {
              const isActive =
                location.pathname === item.to ||
                (item.to !== "/" && location.pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all focus-ring ${
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

        <div className="hidden md:flex items-center gap-3">
          <span
            aria-label="Daily prompt quota"
            className="text-sm text-[var(--text-secondary)] tabular-nums px-3.5 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]"
          >
            {remaining}/{limit} runs left
          </span>

          <LabeledThemeSwitch theme={theme} onToggle={toggleTheme} />

          <Link
            to="/settings/profile"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)] focus-ring"
          >
            <User className="w-4 h-4 text-[var(--accent-text)]" />
            <span>{user?.name ?? "Operator"}</span>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            aria-label="Sign out of workspace"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </Button>
        </div>

        <div className="flex md:hidden items-center gap-2">
          <LabeledThemeSwitch theme={theme} onToggle={toggleTheme} />
          <Button
            variant="icon"
            aria-label={mobileOpen ? "Close workspace menu" : "Open workspace menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <nav
          aria-label="Mobile workspace navigation"
          className="md:hidden border-t border-[var(--separator-subtle)] bg-[var(--surface-1)] px-4 py-5 space-y-2"
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
          <div className="pt-3 border-t border-[var(--separator-subtle)] flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)] tabular-nums">
              {remaining}/{limit} runs left
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMobileOpen(false);
                signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
