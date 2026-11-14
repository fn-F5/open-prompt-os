import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createLocalBillingEmulator } from "./emulator.js";
import { createStripeBillingProvider } from "./stripe.js";

describe("createLocalBillingEmulator", () => {
  it("completes checkout and stores an active subscription snapshot", async () => {
    const emulator = createLocalBillingEmulator();
    const { customerId } = await emulator.createCustomer({
      email: "dev@example.com",
      spaceId: "spc_1",
    });
    expect(customerId).toBe("cus_local_spc_1");

    const checkout = await emulator.createCheckout({
      customerId,
      spaceId: "spc_1",
      plan: "pro",
      interval: "yearly",
      seats: 2,
      successUrl: "http://localhost:5173/billing/return?plan=pro",
      cancelUrl: "http://localhost:5173/pricing",
    });
    expect(checkout.url).toBe("/billing/return?plan=pro&emulated=1");

    const sub = await emulator.getCustomerSubscription(customerId);
    expect(sub).toMatchObject({
      subscriptionId: "sub_local_spc_1",
      customerId,
      plan: "pro",
      interval: "yearly",
      status: "active",
      seats: 2,
      cancelAtPeriodEnd: false,
    });

    const portal = await emulator.createPortal({
      customerId,
      returnUrl: "http://localhost:5173/settings/profile",
    });
    expect(portal.url).toBe("/settings/profile?portal=emulated");

    const downgraded = await emulator.setEmulatedPlan?.({
      customerId,
      spaceId: "spc_1",
      plan: "free",
      interval: "monthly",
    });
    expect(downgraded).toMatchObject({
      subscriptionId: "sub_local_spc_1",
      customerId,
      plan: "free",
      status: "canceled",
    });
  });

  it("validates emulator webhook signature", () => {
    const emulator = createLocalBillingEmulator();
    expect(emulator.parseWebhook("{}", "wrong")).toEqual({ kind: "invalid" });
    expect(
      emulator.parseWebhook(
        JSON.stringify({ customerId: "cus_local_1", eventId: "evt_1" }),
        "emulator-signature",
      ),
    ).toEqual({
      kind: "reconcile",
      customerId: "cus_local_1",
      eventId: "evt_1",
    });
  });
});

describe("createStripeBillingProvider", () => {
  const prices = {
    proMonthly: "price_pro_m",
    proYearly: "price_pro_y",
    teamMonthly: "price_team_m",
    teamYearly: "price_team_y",
  };

  it("verifies Stripe-Signature HMAC, rejects expired timestamps and tampered payloads", () => {
    const webhookSecret = "whsec_test_secret";
    const now = 1_700_000_000;
    const provider = createStripeBillingProvider({
      secretKey: "sk_test_123",
      webhookSecret,
      prices,
      nowSeconds: () => now,
    });

    const payload = JSON.stringify({
      id: "evt_stripe_1",
      type: "customer.subscription.updated",
      data: { object: { customer: "cus_stripe_1" } },
    });

    const sign = (ts: number, body: string) =>
      `t=${ts},v1=${createHmac("sha256", webhookSecret).update(`${ts}.${body}`).digest("hex")}`;

    expect(provider.parseWebhook(payload, sign(now - 30, payload))).toEqual({
      kind: "reconcile",
      customerId: "cus_stripe_1",
      eventId: "evt_stripe_1",
    });

    // Expired (> 300s)
    expect(provider.parseWebhook(payload, sign(now - 301, payload))).toEqual({
      kind: "invalid",
    });

    // Tampered payload
    expect(provider.parseWebhook(`${payload} `, sign(now, payload))).toEqual({
      kind: "invalid",
    });

    // Unrelated event type is ignored
    const ignoredPayload = JSON.stringify({
      id: "evt_stripe_2",
      type: "charge.succeeded",
      data: { object: { customer: "cus_stripe_1" } },
    });
    expect(provider.parseWebhook(ignoredPayload, sign(now, ignoredPayload))).toEqual({
      kind: "ignored",
    });
  });

  it("maps checkout and subscription API responses", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/v1/checkout/sessions")) {
        return new Response(JSON.stringify({ url: "https://checkout.stripe.com/pay/cs_1" }), {
          status: 200,
        });
      }
      if (urlStr.includes("/v1/subscriptions")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "sub_stripe_1",
                customer: "cus_stripe_1",
                status: "active",
                current_period_start: 1_700_000_000,
                current_period_end: 1_702_592_000,
                items: { data: [{ quantity: 3, price: { id: "price_team_y" } }] },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: "cus_stripe_1" }), { status: 200 });
    });

    const provider = createStripeBillingProvider({
      secretKey: "sk_test_123",
      prices,
      fetchImpl,
    });

    const checkout = await provider.createCheckout({
      customerId: "cus_stripe_1",
      spaceId: "spc_1",
      plan: "team",
      interval: "yearly",
      seats: 3,
      successUrl: "https://openpromptos.com/billing/return?plan=team",
      cancelUrl: "https://openpromptos.com/pricing",
    });
    expect(checkout.url).toBe("https://checkout.stripe.com/pay/cs_1");

    const sub = await provider.getCustomerSubscription("cus_stripe_1");
    expect(sub).toMatchObject({
      subscriptionId: "sub_stripe_1",
      plan: "team",
      interval: "yearly",
      status: "active",
      seats: 3,
    });
  });
});
