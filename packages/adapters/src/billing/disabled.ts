import type { BillingProvider } from "@open-prompt-os/adapter-kit";
import { DEFAULT_PRICING_PLANS } from "@open-prompt-os/contracts";

/**
 * Fail-closed billing provider used in production when Stripe is not fully configured.
 * Allows listing public pricing plans while rejecting checkout, portal, plan emulation, and webhooks.
 */
export function createDisabledBillingProvider(): BillingProvider {
  const unavailable = () => {
    throw new Error("Paid billing is not enabled in this environment.");
  };

  return {
    kind: "disabled",
    async listPlans() {
      return DEFAULT_PRICING_PLANS.map((plan) => ({
        ...plan,
        features: [...plan.features],
      }));
    },
    async createCustomer() {
      return unavailable();
    },
    async createCheckout() {
      return unavailable();
    },
    async createPortal() {
      return unavailable();
    },
    async getCustomerSubscription() {
      return null;
    },
    parseWebhook() {
      return { kind: "invalid" };
    },
  };
}
