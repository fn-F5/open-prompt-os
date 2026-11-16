import { z } from "zod";

export const PlanTierSchema = z.enum(["free", "pro", "team"]);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const BillingIntervalSchema = z.enum(["monthly", "yearly"]);
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;

export const BillingStatusSchema = z.object({
  plan: PlanTierSchema,
  status: z.enum(["active", "trialing", "past_due", "canceled"]),
  remainingDailyPrompts: z.number(),
  dailyLimit: z.number(),
  resetAt: z.string(),
  seats: z.number(),
  currentPeriodEnd: z.string().nullable(),
});
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

export const CheckoutInputSchema = z.object({
  plan: z.enum(["pro", "team"]),
  interval: BillingIntervalSchema,
  seats: z.number().int().min(1).max(100).default(1),
});
export type CheckoutInput = z.infer<typeof CheckoutInputSchema>;

export const EmulatePlanSwitchInputSchema = z.object({
  plan: PlanTierSchema,
  interval: BillingIntervalSchema.default("monthly"),
});
export type EmulatePlanSwitchInput = z.infer<typeof EmulatePlanSwitchInputSchema>;

export const PricingPlanItemSchema = z.object({
  id: PlanTierSchema,
  name: z.string(),
  badge: z.string(),
  audienceLabel: z.string(),
  description: z.string(),
  monthlyPriceUsd: z.number(),
  yearlyPriceUsd: z.number(),
  priceSuffix: z.string(),
  dailyPromptLimit: z.number(),
  guestDailyPromptLimit: z.number().nullable(),
  features: z.array(z.string()),
  highlighted: z.boolean(),
});
export type PricingPlanItem = z.infer<typeof PricingPlanItemSchema>;

export const DEFAULT_PRICING_PLANS: readonly PricingPlanItem[] = [
  {
    id: "free",
    name: "Starter Workspace",
    badge: "Free Forever",
    audienceLabel: "Starter",
    description: "Everything you need to start writing better prompts right away.",
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    priceSuffix: "/ forever",
    dailyPromptLimit: 20,
    guestDailyPromptLimit: 5,
    features: [
      "5 daily guest prompts · 20 daily with free account",
      "Guided builder across Text, Image & Video",
      "Personal prompt library & guest sync",
    ],
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro Studio",
    badge: "Recommended · Most Popular",
    audienceLabel: "Power Users",
    description: "For builders, writers, and engineers who rely on AI every day.",
    monthlyPriceUsd: 19,
    yearlyPriceUsd: 15,
    priceSuffix: "/ month",
    dailyPromptLimit: 500,
    guestDailyPromptLimit: null,
    features: [
      "500 daily AI-compiled prompts & autopsies",
      "Unlimited Prompt Autopsy failure diagnostics",
      "Multi-provider auto-healing failover",
    ],
    highlighted: true,
  },
  {
    id: "team",
    name: "Team Space",
    badge: "Multi-Seat RLS",
    audienceLabel: "Enterprise",
    description: "Standardize prompts and guardrails across your entire team.",
    monthlyPriceUsd: 49,
    yearlyPriceUsd: 39,
    priceSuffix: "/ seat / mo",
    dailyPromptLimit: 2000,
    guestDailyPromptLimit: null,
    features: [
      "2,000 daily AI-compiled prompts & autopsies",
      "Shared team prompt library & templates",
      "PostgreSQL Row-Level Security tenant isolation",
    ],
    highlighted: false,
  },
];
