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
