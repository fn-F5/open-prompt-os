import {
  type BillingInterval,
  DEFAULT_PRICING_PLANS,
  type PricingPlanItem,
  type UpgradeInterestPlan,
} from "@open-prompt-os/contracts";
import { Badge, Button, Tabs, toast } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Check, ShieldCheck } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { shouldAnimateCard } from "../../hooks/use-card-parallax.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { PlanInterestDialog } from "./plan-interest-dialog.js";

export function formatUsdPrice(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export interface PricingPlansSectionProps {
  readonly headingAs?: "h1" | "h2";
  readonly showPrivacyBanner?: boolean;
}

/**
 * Single pricing section shared across `/pricing` and the landing marketing showcase
 * for both anonymous visitors and signed-in users.
 */
export function PricingPlansSection({
  headingAs = "h2",
  showPrivacyBanner = false,
}: PricingPlansSectionProps) {
  const { isAuthenticated, user } = useAuthSession();
  const navigate = useNavigate();
  const [interval, setInterval] = React.useState<BillingInterval>("yearly");
  const [loadingPlan, setLoadingPlan] = React.useState<UpgradeInterestPlan | null>(null);
  const [interestModalPlan, setInterestModalPlan] = React.useState<PricingPlanItem | null>(null);
  const [interestEmail, setInterestEmail] = React.useState("");
  const [interestError, setInterestError] = React.useState<string | null>(null);
  const [isSubmittingEmail, setIsSubmittingEmail] = React.useState(false);
  const [confirmedEmail, setConfirmedEmail] = React.useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: queryKeys.billing.plans(),
    queryFn: () => orpcClient.billing.plans(),
    placeholderData: () => DEFAULT_PRICING_PLANS.map((p) => ({ ...p, features: [...p.features] })),
  });

  const plans = plansQuery.data ?? DEFAULT_PRICING_PLANS;

  const closeInterestModal = () => {
    if (isSubmittingEmail) return;
    setInterestModalPlan(null);
    setInterestEmail("");
    setInterestError(null);
    setConfirmedEmail(null);
  };

  const handlePlanSelect = async (plan: PricingPlanItem) => {
    if (plan.id === "free") {
      navigate("/");
      return;
    }
    const upgradePlan: UpgradeInterestPlan = plan.id;

    setInterestError(null);

    if (isAuthenticated) {
      try {
        setLoadingPlan(upgradePlan);
        const result = await orpcClient.billing.registerInterest({
          plan: upgradePlan,
          interval,
          email: user?.email,
        });
        setConfirmedEmail(result.email);
        setInterestModalPlan(plan);
      } catch (err) {
        toast({
          title: "Could not save your request",
          description: err instanceof Error ? err.message : "Please try again shortly.",
        });
      } finally {
        setLoadingPlan(null);
      }
      return;
    }

    setConfirmedEmail(null);
    setInterestModalPlan(plan);
  };

  const handleGuestEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!interestModalPlan || interestModalPlan.id === "free") return;
    const trimmedEmail = interestEmail.trim();
    if (!trimmedEmail) {
      setInterestError("Please enter your email address.");
      return;
    }

    setInterestError(null);
    setIsSubmittingEmail(true);
    try {
      const result = await orpcClient.billing.registerInterest({
        plan: interestModalPlan.id,
        interval,
        email: trimmedEmail,
      });
      setConfirmedEmail(result.email);
      setInterestEmail("");
    } catch (err) {
      setInterestError(err instanceof Error ? err.message : "Please enter a valid email address.");
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const HeadingTag = headingAs;

  const renderPlanAction = (plan: PricingPlanItem) => {
    const label =
      plan.id === "pro"
        ? "Upgrade to Pro"
        : plan.id === "team"
          ? "Start Team Space"
          : plan.id === "byok"
            ? "Get Started with BYOK"
            : "Get Started";

    return (
      <Button
        variant={plan.highlighted ? "primary-inverse" : "solid"}
        size="lg"
        disabled={loadingPlan !== null}
        onClick={() => void handlePlanSelect(plan)}
      >
        {loadingPlan === plan.id ? "Saving..." : label}
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
            organizing your library are always free.
          </p>
        </div>

        <Tabs
          ariaLabel="Billing interval"
          value={interval}
          onValueChange={setInterval}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly", badge: "Save More" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch pt-2">
        {plans.map((plan) => {
          const displayedPrice = interval === "yearly" ? plan.yearlyPriceUsd : plan.monthlyPriceUsd;
          const isHighlighted = plan.highlighted;

          return (
            <div
              key={plan.id}
              data-animate={shouldAnimateCard("pricingPlanCard", isAuthenticated)}
              className={`rounded-3xl p-6 flex flex-col justify-between gap-6 ${
                isHighlighted ? "glow-card overflow-hidden" : "flat-surface"
              }`}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
                  <Badge variant={isHighlighted ? "framework" : "neutral"}>{plan.badge}</Badge>
                  {plan.audienceLabel ? (
                    <span
                      className={`font-mono text-xs font-normal uppercase tracking-wider ${
                        isHighlighted ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {plan.audienceLabel}
                    </span>
                  ) : null}
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

      <PlanInterestDialog
        open={interestModalPlan !== null}
        onOpenChange={(open) => {
          if (!open) closeInterestModal();
        }}
        planName={interestModalPlan?.name}
        interval={interval}
        confirmedEmail={confirmedEmail}
        email={interestEmail}
        onEmailChange={setInterestEmail}
        error={interestError}
        isSubmitting={isSubmittingEmail}
        onSubmit={handleGuestEmailSubmit}
      />
    </div>
  );
}
