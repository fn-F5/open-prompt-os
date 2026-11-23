import { z } from "zod";

export const PlanTierSchema = z.enum(["free", "pro", "team"]);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const PricingPlanIdSchema = z.enum(["free", "pro", "team", "byok"]);
export type PricingPlanId = z.infer<typeof PricingPlanIdSchema>;

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

export const UpgradeInterestPlanSchema = z.enum(["pro", "team", "byok"]);
export type UpgradeInterestPlan = z.infer<typeof UpgradeInterestPlanSchema>;

export const RegisterPlanInterestInputSchema = z.object({
  plan: UpgradeInterestPlanSchema,
  interval: BillingIntervalSchema.default("yearly"),
  email: z.string().trim().email("Please enter a valid email address.").max(254).optional(),
});
export type RegisterPlanInterestInput = z.infer<typeof RegisterPlanInterestInputSchema>;

export const PlanInterestItemSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  plan: UpgradeInterestPlanSchema,
  interval: BillingIntervalSchema,
  createdAt: z.string(),
});
export type PlanInterestItem = z.infer<typeof PlanInterestItemSchema>;

export const EmulatePlanSwitchInputSchema = z.object({
  plan: PlanTierSchema,
  interval: BillingIntervalSchema.default("monthly"),
});
export type EmulatePlanSwitchInput = z.infer<typeof EmulatePlanSwitchInputSchema>;

export const PricingPlanItemSchema = z.object({
  id: PricingPlanIdSchema,
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
    name: "Free",
    badge: "Starter",
    audienceLabel: "No Card Required",
    description: "Try structured prompt compilation, autopsy, and reverse engineering.",
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    priceSuffix: "/ month",
    dailyPromptLimit: 5,
    guestDailyPromptLimit: 5,
    features: [
      "5 Compile requests / day",
      "2 Prompt Autopsy requests / day",
      "2 Reverse Engineer requests / day",
    ],
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro Studio",
    badge: "Recommended · Most Popular",
    audienceLabel: "",
    description: "For builders, writers, and engineers who rely on AI every day.",
    monthlyPriceUsd: 8,
    yearlyPriceUsd: 6,
    priceSuffix: "/ month",
    dailyPromptLimit: 20,
    guestDailyPromptLimit: null,
    features: [
      "20 Compile requests / day",
      "10 Prompt Autopsy requests / day",
      "5 Reverse Engineer requests / day",
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
    monthlyPriceUsd: 16,
    yearlyPriceUsd: 12,
    priceSuffix: "/ seat / mo",
    dailyPromptLimit: 30,
    guestDailyPromptLimit: null,
    features: [
      "30 Compile requests / day",
      "20 Prompt Autopsy requests / day",
      "10 Reverse Engineer requests / day",
      "Shared team prompt library",
      "PostgreSQL Row-Level Security tenant isolation",
    ],
    highlighted: false,
  },
  {
    id: "byok",
    name: "BYOK",
    badge: "Bring Your Own Key",
    audienceLabel: "Power Users",
    description: "Connect your own OpenAI, Anthropic, or Gemini API keys with zero markup.",
    monthlyPriceUsd: 5,
    yearlyPriceUsd: 4,
    priceSuffix: "/ month",
    dailyPromptLimit: 5000,
    guestDailyPromptLimit: null,
    features: [
      "Unlimited Compile, Autopsy & Reverse Engineer requests / day",
      "Use your own OpenAI, Anthropic & Gemini API keys",
      "Zero platform token markup — pay providers directly",
      "Encrypted server-side key vaulting",
    ],
    highlighted: false,
  },
];
