import { Badge, Button, toast } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, LogOut } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";
import { PlanInterestDialog } from "../../components/pricing/plan-interest-dialog.js";
import { SeoHead } from "../../components/seo/seo-head.js";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { CARD_HOVER_ANIMATION } from "../../hooks/use-card-parallax.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";

export function ProfileSettingsPage() {
  const { user, signOut } = useAuthSession();
  const navigate = useNavigate();
  const [submittingInterest, setSubmittingInterest] = React.useState(false);
  const [confirmedEmail, setConfirmedEmail] = React.useState<string | null>(null);

  const billingQuery = useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: () => orpcClient.billing.status(),
  });

  const billing = billingQuery.data;
  const activePlan = billing?.plan ?? user?.plan ?? "free";

  const handleRegisterUpgradeInterest = async () => {
    try {
      setSubmittingInterest(true);
      const result = await orpcClient.billing.registerInterest({
        plan: activePlan === "team" ? "team" : "pro",
        interval: "yearly",
        email: user?.email,
      });
      setConfirmedEmail(result.email);
    } catch (err) {
      toast({
        title: "Could not save your request",
        description: err instanceof Error ? err.message : "Please try again shortly.",
      });
    } finally {
      setSubmittingInterest(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="space-y-6">
      <SeoHead
        meta={{
          title: "Profile & Workspace Settings | Open Prompt OS",
          description: "Manage Open Prompt OS workspace identity, passkeys, and billing.",
          canonicalPath: "/settings/profile",
          noindex: true,
        }}
      />
      <section
        data-animate={CARD_HOVER_ANIMATION.profileIdentity}
        className="rounded-xl p-6 flat-surface space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <Badge variant="framework">Workspace Identity</Badge>
            <h1 className="mt-2 text-xl font-semibold">Profile & Workspace</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </Button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2">
          <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
            <dt className="text-xs text-[var(--text-secondary)]">Operator Name</dt>
            <dd className="font-medium mt-1">{user?.name ?? "Operator"}</dd>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
            <dt className="text-xs text-[var(--text-secondary)]">Email</dt>
            <dd className="font-medium mt-1">{user?.email ?? "—"}</dd>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
            <dt className="text-xs text-[var(--text-secondary)]">Active Space</dt>
            <dd className="font-medium mt-1">{user?.spaceName ?? "Default Space"}</dd>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
            <dt className="text-xs text-[var(--text-secondary)]">Plan Tier</dt>
            <dd className="font-medium mt-1 uppercase">{activePlan}</dd>
          </div>
        </dl>
      </section>

      <section
        data-animate={CARD_HOVER_ANIMATION.profileBilling}
        className="rounded-xl p-6 flat-surface space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <Badge variant="neutral">Subscription & Billing</Badge>
            <h2 className="mt-2 text-lg font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--accent-text)]" />
              <span>Workspace Plan & Quota</span>
            </h2>
          </div>

          <Button
            variant="primary-inverse"
            size="sm"
            disabled={submittingInterest}
            onClick={() => void handleRegisterUpgradeInterest()}
          >
            {submittingInterest ? "Saving..." : "Upgrade Plan"}
          </Button>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
            <dt className="text-xs text-[var(--text-secondary)]">Status</dt>
            <dd className="font-medium mt-1 capitalize">{billing?.status ?? "active"}</dd>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
            <dt className="text-xs text-[var(--text-secondary)]">Daily Compose Quota</dt>
            <dd className="font-medium mt-1 tabular-nums">
              {billing ? `${billing.remainingDailyPrompts} / ${billing.dailyLimit} left` : "—"}
            </dd>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
            <dt className="text-xs text-[var(--text-secondary)]">Current Period Ends</dt>
            <dd className="font-medium mt-1">
              {billing?.currentPeriodEnd
                ? new Date(billing.currentPeriodEnd).toLocaleDateString()
                : "No renewal"}
            </dd>
          </div>
        </dl>
      </section>

      <PlanInterestDialog
        open={confirmedEmail !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmedEmail(null);
        }}
        planName={activePlan === "team" ? "Team Space" : "Pro Studio"}
        interval="yearly"
        confirmedEmail={confirmedEmail}
        email={confirmedEmail ?? ""}
        onEmailChange={() => {}}
        error={null}
        isSubmitting={submittingInterest}
        onSubmit={(e) => e.preventDefault()}
      />
    </div>
  );
}
