import type { BillingInterval, PlanTier } from "@open-prompt-os/contracts";
import { Badge, Button, Dialog, Tabs, toast } from "@open-prompt-os/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, ExternalLink } from "lucide-react";
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { authClient } from "../../lib/auth-client.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";

const EMULATED_PLANS: Array<{
  id: PlanTier;
  name: string;
  limitLabel: string;
  monthlyPriceLabel: string;
  yearlyPriceLabel: string;
}> = [
  {
    id: "free",
    name: "Free Starter",
    limitLabel: "20 daily prompts",
    monthlyPriceLabel: "$0 / mo",
    yearlyPriceLabel: "$0 / mo",
  },
  {
    id: "pro",
    name: "Pro Studio",
    limitLabel: "500 daily prompts",
    monthlyPriceLabel: "$19 / mo",
    yearlyPriceLabel: "$15 / mo",
  },
  {
    id: "team",
    name: "Team Space",
    limitLabel: "2,000 daily prompts",
    monthlyPriceLabel: "$49 / seat",
    yearlyPriceLabel: "$39 / seat",
  },
];

export function ProfileSettingsPage() {
  const { user } = useAuthSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openingPortal, setOpeningPortal] = React.useState(false);
  const [emulatedInterval, setEmulatedInterval] = React.useState<BillingInterval>("monthly");
  const [switchingPlan, setSwitchingPlan] = React.useState<PlanTier | null>(null);

  const isEmulatedPortalOpen = searchParams.get("portal") === "emulated";

  const billingQuery = useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: () => orpcClient.billing.status(),
  });

  const billing = billingQuery.data;
  const activePlan = billing?.plan ?? user?.plan ?? "free";

  const closeEmulatedPortal = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("portal");
        return next;
      },
      { replace: true },
    );
  };

  const handleOpenPortal = async () => {
    try {
      setOpeningPortal(true);
      const res = await orpcClient.billing.portal();
      if (res.url.startsWith("http://") || res.url.startsWith("https://")) {
        window.location.assign(res.url);
      } else {
        navigate(res.url);
      }
    } catch (err) {
      toast({
        title: "Billing portal unavailable",
        description: err instanceof Error ? err.message : "Could not open billing portal.",
      });
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleSwitchEmulatedPlan = async (targetPlan: PlanTier) => {
    try {
      setSwitchingPlan(targetPlan);
      const updated = await orpcClient.billing.emulatePlan({
        plan: targetPlan,
        interval: emulatedInterval,
      });
      queryClient.setQueryData(queryKeys.billing.status(), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.billing.status() });
      void authClient.refresh().catch(() => {
        // Ignore session refresh errors in test/offline mode
      });
      toast({
        title: "Plan updated (Local Emulator)",
        description: `Workspace switched to ${updated.plan.toUpperCase()}.`,
      });
      closeEmulatedPortal();
    } catch (err) {
      toast({
        title: "Could not switch plan",
        description: err instanceof Error ? err.message : "Emulated plan switch failed.",
      });
    } finally {
      setSwitchingPlan(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl p-6 flat-surface space-y-4">
        <div>
          <Badge variant="framework">Workspace Identity</Badge>
          <h1 className="mt-2 text-xl font-semibold">Profile & Workspace</h1>
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

      <section className="rounded-xl p-6 flat-surface space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <Badge variant="neutral">Subscription & Billing</Badge>
            <h2 className="mt-2 text-lg font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--accent-text)]" />
              <span>Workspace Plan & Quota</span>
            </h2>
          </div>

          {activePlan === "free" ? (
            <Button variant="primary-inverse" size="sm" onClick={() => navigate("/pricing")}>
              Upgrade Plan
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={openingPortal}
              onClick={handleOpenPortal}
            >
              <span>{openingPortal ? "Opening Portal..." : "Manage Billing Portal"}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          )}
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

      <Dialog
        open={isEmulatedPortalOpen}
        onOpenChange={(open) => {
          if (!open) closeEmulatedPortal();
        }}
        title="Emulated Billing Portal"
        description="Local development emulator active (no Stripe keys configured). Switch workspace tiers immediately for testing."
        variant="solid"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="neutral">Local Emulator</Badge>
            <Tabs
              ariaLabel="Emulated billing interval"
              value={emulatedInterval}
              onValueChange={setEmulatedInterval}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
          </div>

          <div className="space-y-2.5">
            {EMULATED_PLANS.map((planOption) => {
              const isCurrent = activePlan === planOption.id;
              const priceLabel =
                emulatedInterval === "yearly"
                  ? planOption.yearlyPriceLabel
                  : planOption.monthlyPriceLabel;
              return (
                <div
                  key={planOption.id}
                  className="flex items-center justify-between gap-3 rounded-lg p-3 bg-[var(--surface-2)]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{planOption.name}</span>
                      {isCurrent ? <Badge variant="framework">Current</Badge> : null}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {priceLabel} · {planOption.limitLabel}
                    </p>
                  </div>
                  <Button
                    variant={planOption.id === "free" ? "secondary" : "primary-inverse"}
                    size="sm"
                    disabled={isCurrent || switchingPlan !== null}
                    onClick={() => handleSwitchEmulatedPlan(planOption.id)}
                  >
                    {isCurrent ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Active</span>
                      </>
                    ) : switchingPlan === planOption.id ? (
                      "Switching..."
                    ) : planOption.id === "free" ? (
                      "Downgrade to Free"
                    ) : (
                      `Switch to ${planOption.id.toUpperCase()}`
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
