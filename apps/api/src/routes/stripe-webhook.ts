import type { BillingProvider } from "@open-prompt-os/adapter-kit";
import type { Hono } from "hono";
import type { ApiEnv } from "../app-env.js";
import { logger } from "../logger.js";
import { reconcileCustomerSubscription } from "../services/billing-service.js";

export function registerStripeWebhook(app: Hono<ApiEnv>, billingProvider: BillingProvider): void {
  app.post("/api/webhooks/stripe", async (c) => {
    const signature = c.req.header("stripe-signature") ?? null;
    const rawBody = await c.req.text();
    const parsed = billingProvider.parseWebhook(rawBody, signature);

    if (parsed.kind === "invalid") {
      logger.warn("Rejected invalid Stripe webhook signature", {
        event: "billing.webhook_invalid_signature",
      });
      return c.json(
        {
          code: "INVALID_SIGNATURE",
          message: "Invalid webhook signature.",
          requestId: c.get("requestId"),
        },
        400,
      );
    }
    if (parsed.kind === "reconcile") {
      await reconcileCustomerSubscription(parsed.customerId, billingProvider, parsed.eventId);
      logger.info("Reconciled Stripe webhook event", {
        event: "billing.webhook_reconciled",
        customerId: parsed.customerId,
      });
    }
    return c.json({ received: true }, 200);
  });
}
