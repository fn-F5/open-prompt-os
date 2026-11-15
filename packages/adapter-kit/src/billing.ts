import type { BillingInterval, PlanTier } from "@open-prompt-os/contracts";

export interface BillingSubscriptionSnapshot {
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly plan: PlanTier;
  readonly interval: BillingInterval;
  readonly status: "active" | "trialing" | "past_due" | "canceled";
  readonly seats: number;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
}

export interface BillingCheckoutRequest {
  readonly customerId: string;
  readonly spaceId: string;
  readonly plan: Exclude<PlanTier, "free">;
  readonly interval: BillingInterval;
  readonly seats: number;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export type WebhookParseResult =
  | { readonly kind: "reconcile"; readonly customerId: string; readonly eventId: string }
  | { readonly kind: "ignored" }
  | { readonly kind: "invalid" };

export interface BillingProvider {
  readonly kind: "stripe" | "emulator";
  createCustomer(input: { email: string; spaceId: string }): Promise<{ customerId: string }>;
  createCheckout(input: BillingCheckoutRequest): Promise<{ url: string }>;
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  getCustomerSubscription(customerId: string): Promise<BillingSubscriptionSnapshot | null>;
  parseWebhook(rawBody: string, signatureHeader: string | null): WebhookParseResult;
  setEmulatedPlan?(input: {
    customerId: string;
    spaceId: string;
    plan: PlanTier;
    interval: BillingInterval;
  }): Promise<BillingSubscriptionSnapshot>;
}
