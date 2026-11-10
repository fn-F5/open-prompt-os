import { Badge, Button } from "@open-prompt-os/ui-web";
import { KeyRound, Shield, User } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";

export function SettingsLayout() {
  const { isAuthenticated } = useAuthSession();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <section className="rounded-2xl p-8 flat-surface text-center max-w-lg mx-auto my-8 space-y-4">
        <Badge variant="framework">Authenticated Route</Badge>
        <h1 className="text-xl font-semibold">Sign in to manage Workspace Settings</h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
          Profile preferences, passkey security, and workspace configuration require an active
          session.
        </p>
        <Button
          variant="primary-inverse"
          onClick={() =>
            openAuthDialog({
              reason: "protected_route",
              intendedRoute: location.pathname,
            })
          }
        >
          Sign in to continue
        </Button>
      </section>
    );
  }

  const tabs = [
    { to: "/settings/profile", label: "Profile & Space", icon: User },
    { to: "/settings/security", label: "Passkeys & Security", icon: KeyRound },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <aside className="space-y-2">
        <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Workspace Settings
        </div>
        <nav aria-label="Settings navigation" className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = location.pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors focus-ring ${
                  active
                    ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)] font-medium"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 p-3 rounded-xl bg-[var(--surface-1)] border border-[var(--separator-subtle)] text-xs text-[var(--text-secondary)] space-y-1">
          <div className="font-medium text-[var(--text-primary)] flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>BYOK Status</span>
          </div>
          <p>
            Bring Your Own Key (BYOK) will unlock once encrypted server-side key vaulting is
            enabled.
          </p>
        </div>
      </aside>
      <div className="md:col-span-3">
        <Outlet />
      </div>
    </div>
  );
}
