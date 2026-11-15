import type {
  BillingCheckoutRequest,
  BillingProvider,
  BillingSubscriptionSnapshot,
} from "@open-prompt-os/adapter-kit";

export function createLocalBillingEmulator(): BillingProvider {
  const subscriptions = new Map<string, BillingSubscriptionSnapshot>();

  return {
    kind: "emulator",
    async createCustomer({ spaceId }) {
      return { customerId: `cus_local_${spaceId}` };
    },
    async createCheckout(input: BillingCheckoutRequest) {
      const now = new Date();
      const periodEnd = new Date(
        now.getTime() + (input.interval === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000,
      );
      subscriptions.set(input.customerId, {
        subscriptionId: `sub_local_${input.spaceId}`,
        customerId: input.customerId,
        plan: input.plan,
        interval: input.interval,
        status: "active",
        seats: input.seats,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });
      const url = new URL(input.successUrl);
      url.searchParams.set("emulated", "1");
      return { url: `${url.pathname}${url.search}` };
    },
    async createPortal({ returnUrl }) {
      const url = new URL(returnUrl);
      url.searchParams.set("portal", "emulated");
      return { url: `${url.pathname}${url.search}` };
    },
    async getCustomerSubscription(customerId) {
      return subscriptions.get(customerId) ?? null;
    },
    async setEmulatedPlan({ customerId, spaceId, plan, interval }) {
      const now = new Date();
      const periodEnd = new Date(
        now.getTime() + (interval === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000,
      );
      const existing = subscriptions.get(customerId);
      const snapshot: BillingSubscriptionSnapshot =
        plan === "free"
          ? {
              subscriptionId: existing?.subscriptionId ?? `sub_local_${spaceId}`,
              customerId,
              plan: "free",
              interval,
              status: "canceled",
              seats: 1,
              currentPeriodStart: existing?.currentPeriodStart ?? now,
              currentPeriodEnd: now,
              cancelAtPeriodEnd: false,
            }
          : {
              subscriptionId: existing?.subscriptionId ?? `sub_local_${spaceId}`,
              customerId,
              plan,
              interval,
              status: "active",
              seats: existing?.seats ?? 1,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            };
      subscriptions.set(customerId, snapshot);
      return snapshot;
    },
    parseWebhook(rawBody, signatureHeader) {
      if (signatureHeader !== "emulator-signature") return { kind: "invalid" };
      try {
        const parsed = JSON.parse(rawBody) as { customerId?: string; eventId?: string };
        if (!parsed.customerId) return { kind: "ignored" };
        return {
          kind: "reconcile",
          customerId: parsed.customerId,
          eventId: parsed.eventId ?? `evt_local_${Date.now()}`,
        };
      } catch {
        return { kind: "invalid" };
      }
    },
  };
}
