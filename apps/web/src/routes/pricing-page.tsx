import type { BillingInterval } from "@open-prompt-os/contracts";
import { Badge, Button, Tabs } from "@open-prompt-os/ui-web";
import { Check, ShieldCheck } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { orpcClient } from "../lib/orpc.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";

export function PricingPage() {
  const { isAuthenticated } = useAuthSession();
  const navigate = useNavigate();
  const [interval, setInterval] = React.useState<BillingInterval>("monthly");

  const handleCheckout = async (plan: "pro" | "team") => {
    if (!isAuthenticated) {
      openAuthDialog({ reason: "navbar_signin", intendedRoute: "/pricing" });
      return;
    }
    const res = await orpcClient.billing.checkout({ plan, interval, seats: 1 });
    navigate(res.url);
  };

  return (
    <div className="space-y-12 max-w-6xl mx-auto py-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <Badge variant="framework">Simple, Fair Pricing</Badge>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
            Plans for individuals and teams
          </h1>
          <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl">
            Only AI-powered compilations count toward your daily limit. Editing, copying, and
            browsing templates are always free.
          </p>
        </div>

        <Tabs
          ariaLabel="Billing interval"
          value={interval}
          onValueChange={setInterval}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly", badge: "Save 20%" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch pt-4">
        <div className="rounded-3xl p-7 sm:p-8 flat-surface flex flex-col justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
              <Badge variant="neutral">Free Forever</Badge>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Starter
              </span>
            </div>
            <h2 className="text-2xl font-bold">Starter Workspace</h2>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tabular-nums">$0</span>
              <span className="text-sm text-[var(--text-secondary)]">/ forever</span>
            </div>
            <ul className="space-y-3 text-base text-[var(--text-secondary)] pt-2">
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                <span>5 daily guest prompts · 50 daily with account</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                <span>Guided builder across Text, Image & Video</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                <span>Personal prompt library & guest sync</span>
              </li>
            </ul>
          </div>
          <Button variant="solid" size="lg" onClick={() => navigate("/")}>
            Open Composer
          </Button>
        </div>

        <div className="rounded-3xl p-7 sm:p-8 glow-card flex flex-col justify-between gap-8 overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
              <Badge variant="framework">Recommended · Most Popular</Badge>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-text)]">
                Power Users
              </span>
            </div>
            <h2 className="text-2xl font-bold">Pro Studio</h2>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tabular-nums">
                {interval === "monthly" ? "$19" : "$15"}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">/ month</span>
            </div>
            <ul className="space-y-3 text-base text-[var(--text-primary)] pt-2">
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
                <span>500 daily AI-compiled prompts & autopsies</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
                <span>Unlimited Prompt Autopsy diagnostics</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
                <span>Multi-provider auto-healing failover</span>
              </li>
            </ul>
          </div>
          <Button variant="primary-inverse" size="lg" onClick={() => handleCheckout("pro")}>
            Upgrade to Pro
          </Button>
        </div>

        <div className="rounded-3xl p-7 sm:p-8 flat-surface flex flex-col justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
              <Badge variant="neutral">Multi-Seat RLS</Badge>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Enterprise
              </span>
            </div>
            <h2 className="text-2xl font-bold">Team Space</h2>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tabular-nums">
                {interval === "monthly" ? "$49" : "$39"}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">/ seat / mo</span>
            </div>
            <ul className="space-y-3 text-base text-[var(--text-secondary)] pt-2">
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                <span>Shared team prompt library & templates</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                <span>PostgreSQL Row-Level Security tenant isolation</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                <span>Team access & role controls</span>
              </li>
            </ul>
          </div>
          <Button variant="solid" size="lg" onClick={() => handleCheckout("team")}>
            Start Team Space
          </Button>
        </div>
      </div>

      <div className="rounded-2xl p-5 flat-surface flex items-center justify-center gap-2.5 text-sm sm:text-base text-[var(--text-secondary)]">
        <ShieldCheck className="w-5 h-5 text-[var(--success-text)]" />
        <span>Privacy Commitment: We never train on your prompts, regardless of plan tier.</span>
      </div>
    </div>
  );
}
