import {
  createDisabledBillingProvider,
  createLocalBillingEmulator,
} from "@open-prompt-os/adapters";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRuntime } from "./runtime.js";
import {
  createCustomerPortalSession,
  startCheckoutSession,
  switchEmulatedPlan,
} from "./services/billing-service.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("billing production fail-closed guard", () => {
  it("uses disabled billing provider in production when Stripe config is missing or incomplete", () => {
    const prodMissing = createRuntime(loadConfig({ NODE_ENV: "production" }));
    expect(prodMissing.billingProvider.kind).toBe("disabled");

    // Missing STRIPE_WEBHOOK_SECRET must also fail closed in production
    const prodNoWebhook = createRuntime(
      loadConfig({
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "sk_live_test",
        STRIPE_PRICE_PRO_MONTHLY: "price_pm",
        STRIPE_PRICE_PRO_YEARLY: "price_py",
        STRIPE_PRICE_TEAM_MONTHLY: "price_tm",
        STRIPE_PRICE_TEAM_YEARLY: "price_ty",
      }),
    );
    expect(prodNoWebhook.billingProvider.kind).toBe("disabled");
  });

  it("uses Stripe provider in production when all Stripe secrets and prices are configured", () => {
    const prodFull = createRuntime(
      loadConfig({
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "sk_live_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        STRIPE_PRICE_PRO_MONTHLY: "price_pm",
        STRIPE_PRICE_PRO_YEARLY: "price_py",
        STRIPE_PRICE_TEAM_MONTHLY: "price_tm",
        STRIPE_PRICE_TEAM_YEARLY: "price_ty",
      }),
    );
    expect(prodFull.billingProvider.kind).toBe("stripe");
  });

  it("allows local emulator only in development and test", () => {
    expect(createRuntime(loadConfig({ NODE_ENV: "development" })).billingProvider.kind).toBe(
      "emulator",
    );
    expect(createRuntime(loadConfig({ NODE_ENV: "test" })).billingProvider.kind).toBe("emulator");
    expect(createRuntime(loadConfig({ NODE_ENV: "staging" })).billingProvider.kind).toBe(
      "disabled",
    );
  });

  it("rejects checkout, portal, emulatePlan, and emulator-signature webhooks when disabled or in production", async () => {
    const disabled = createDisabledBillingProvider();
    expect(disabled.parseWebhook('{"customerId":"cus_1"}', "emulator-signature")).toEqual({
      kind: "invalid",
    });
    expect((await disabled.listPlans()).length).toBeGreaterThan(0);

    const actor = {
      userId: "usr_1",
      spaceId: "spc_1",
      clientKey: "client_1",
      hashedClientKey: "hash_1",
    };

    await expect(
      startCheckoutSession(
        actor,
        { plan: "pro", interval: "monthly", seats: 1 },
        disabled,
        "https://openpromptos.com",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      createCustomerPortalSession(actor, disabled, "https://openpromptos.com"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      switchEmulatedPlan(actor, { plan: "pro", interval: "monthly" }, disabled),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Even if an emulator provider were passed directly, NODE_ENV=production blocks emulatePlan
    process.env.NODE_ENV = "production";
    await expect(
      switchEmulatedPlan(actor, { plan: "pro", interval: "monthly" }, createLocalBillingEmulator()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Webhook endpoint returns 503 when billing is disabled
    const runtime = createRuntime(loadConfig({ NODE_ENV: "production" }));
    const app = createApp({
      orchestrator: runtime.orchestrator,
      billingProvider: runtime.billingProvider,
      webOrigins: ["https://openpromptos.com"],
      allowRequest: () => true,
      trustProxy: false,
    });
    const res = await app.request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "emulator-signature",
      },
      body: JSON.stringify({ customerId: "cus_1" }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "BILLING_DISABLED" });
  });
});
