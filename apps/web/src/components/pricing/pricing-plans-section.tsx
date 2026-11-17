import {
  type BillingInterval,
  DEFAULT_PRICING_PLANS,
  type PricingPlanItem,
} from "@open-prompt-os/contracts";
import { Badge, Button, Tabs, toast } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Check, ShieldCheck } from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { shouldAnimateCard } from "../../hooks/use-card-parallax.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { openAuthDialog } from "../../state/auth-dialog-store.js";

function redirectToBillingUrl(url: string, navigate: (to: string) => void): void {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    window.location.assign(url);
    return;
  }
  navigate(url);
}

export function formatUsdPrice(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export interface PricingPlansSectionProps {
  readonly headingAs?: "h1" | "h2";
  readonly showPrivacyBanner?: boolean;
}

/**
 * Single pricing section shared across `/pricing` and the landing marketing showcase
 * for both anonymous visitors and signed-in users, backed by live Stripe catalog prices.
 */
export function PricingPlansSection({
  headingAs = "h2",
  showPrivacyBanner = false,
}: PricingPlansSectionProps) {
  const { isAuthenticated } = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [interval, setInterval] = React.useState<BillingInterval>("monthly");
  const [loadingPlan, setLoadingPlan] = React.useState<"pro" | "team" | "portal" | null>(null);

  const plansQuery = useQuery({
    queryKey: queryKeys.billing.plans(),
    queryFn: () => orpcClient.billing.plans(),
    placeholderData: () => DEFAULT_PRICING_PLANS.map((p) => ({ ...p, features: [...p.features] })),
  });

  const billingQuery = useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: () => orpcClient.billing.status(),
    enabled: isAuthenticated,
  });

  const activePlan = isAuthenticated ? (billingQuery.data?.plan ?? "free") : "free";
  const plans = plansQuery.data ?? DEFAULT_PRICING_PLANS;
  const isLandingRoute = location.pathname === "/";

  const handleCheckout = async (plan: "pro" | "team") => {
    if (!isAuthenticated) {
      openAuthDialog({ reason: "navbar_signin", intendedRoute: "/pricing" });
      return;
    }
    try {
      setLoadingPlan(plan);
      const res = await orpcClient.billing.checkout({ plan, interval, seats: 1 });
      redirectToBillingUrl(res.url, navigate);
    } catch (err) {
      toast({
        title: "Checkout failed",
        description: err instanceof Error ? err.message : "Could not start checkout session.",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const handlePortal = async () => {
    try {
      setLoadingPlan("portal");
      const res = await orpcClient.billing.portal();
      redirectToBillingUrl(res.url, navigate);
    } catch (err) {
      toast({
        title: "Portal unavailable",
        description: err instanceof Error ? err.message : "Could not open billing portal.",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const HeadingTag = headingAs;

  const renderPlanAction = (plan: PricingPlanItem) => {
    if (plan.id === "free") {
      if (!isAuthenticated && isLandingRoute) {
        return (
          <Button
            variant="solid"
            size="lg"
            onClick={() => openAuthDialog({ reason: "navbar_signin" })}
          >
            Create Free Account
          </Button>
        );
      }
      return (
        <Button variant="solid" size="lg" onClick={() => navigate("/")}>
          Open Composer
        </Button>
      );
    }

    const paidTier = plan.id;
    const isCurrentPaidPlan = isAuthenticated && activePlan === paidTier;

    if (isCurrentPaidPlan) {
      return (
        <Button
          variant={plan.highlighted ? "primary-inverse" : "solid"}
          size="lg"
          disabled={loadingPlan !== null}
          onClick={handlePortal}
        >
          {loadingPlan === "portal" ? "Opening Portal..." : "Manage Subscription"}
        </Button>
      );
    }

    return (
      <Button
        variant={plan.highlighted ? "primary-inverse" : "solid"}
        size="lg"
        disabled={loadingPlan !== null}
        onClick={() => handleCheckout(paidTier)}
      >
        {loadingPlan === paidTier
          ? "Starting Checkout..."
          : paidTier === "pro"
            ? "Upgrade to Pro"
            : "Start Team Space"}
      </Button>
    );
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2.5">
          <Badge variant="framework">Simple, Fair Pricing</Badge>
          <HeadingTag
            className={
              headingAs === "h1"
                ? "text-3xl sm:text-5xl font-bold tracking-tight"
                : "text-2xl sm:text-4xl font-medium tracking-[-0.025em] text-balance"
            }
          >
            Plans for individuals and teams
          </HeadingTag>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] max-w-2xl leading-relaxed">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch pt-2">
        {plans.map((plan) => {
          const displayedPrice = interval === "yearly" ? plan.yearlyPriceUsd : plan.monthlyPriceUsd;
          const isHighlighted = plan.highlighted;

          return (
            <div
              key={plan.id}
              data-animate={shouldAnimateCard("pricingPlanCard", isAuthenticated)}
              className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between gap-6 sm:gap-8 ${
                isHighlighted ? "glow-card overflow-hidden" : "flat-surface"
              }`}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
                  <Badge variant={isHighlighted ? "framework" : "neutral"}>{plan.badge}</Badge>
                  <span
                    className={`font-mono text-xs font-normal uppercase tracking-wider ${
                      isHighlighted ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {plan.audienceLabel}
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold tracking-[-0.02em]">{plan.name}</h3>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tabular-nums">
                    {formatUsdPrice(displayedPrice)}
                  </span>
                  <span className="font-mono text-[13px] text-[var(--text-secondary)]">
                    {plan.priceSuffix}
                  </span>
                </div>

                <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                  {plan.description}
                </p>

                <ul
                  className={`space-y-3 text-sm sm:text-base pt-2 ${
                    isHighlighted ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  }`}
                >
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5">
                      <Check
                        className={`w-5 h-5 shrink-0 ${
                          isHighlighted ? "text-[var(--accent-text)]" : "text-[var(--success-text)]"
                        }`}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {renderPlanAction(plan)}
            </div>
          );
        })}
      </div>

      {showPrivacyBanner ? (
        <div
          data-animate={shouldAnimateCard("pricingPrivacyBanner", isAuthenticated)}
          className="rounded-2xl p-5 flat-surface flex items-center justify-center gap-2.5 text-sm sm:text-base text-[var(--text-secondary)]"
        >
          <ShieldCheck className="w-5 h-5 text-[var(--success-text)] shrink-0" />
          <span>Privacy Commitment: We never train on your prompts, regardless of plan tier.</span>
        </div>
      ) : null}
    </div>
  );
}
