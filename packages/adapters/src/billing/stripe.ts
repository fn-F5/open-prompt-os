import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  BillingCheckoutRequest,
  BillingProvider,
  BillingSubscriptionSnapshot,
  WebhookParseResult,
} from "@open-prompt-os/adapter-kit";
import type { BillingInterval, PlanTier } from "@open-prompt-os/contracts";

export interface StripePriceMap {
  readonly proMonthly: string;
  readonly proYearly: string;
  readonly teamMonthly: string;
  readonly teamYearly: string;
}

export interface StripeBillingOptions {
  readonly secretKey: string;
  readonly webhookSecret?: string;
  readonly prices: StripePriceMap;
  readonly baseUrl?: string;
  readonly fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly nowSeconds?: () => number;
}

interface StripeCustomerResponse {
  id: string;
}

interface StripeSessionResponse {
  url: string;
}

interface StripeSubscriptionObject {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: {
    data?: Array<{
      quantity?: number;
      price?: { id?: string };
    }>;
  };
}

interface StripeListResponse<T> {
  data?: T[];
}

const RELEVANT_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
]);

function priceFor(
  prices: StripePriceMap,
  plan: Exclude<PlanTier, "free">,
  interval: BillingInterval,
): string {
  if (plan === "pro") {
    return interval === "yearly" ? prices.proYearly : prices.proMonthly;
  }
  return interval === "yearly" ? prices.teamYearly : prices.teamMonthly;
}

function planAndIntervalForPrice(
  prices: StripePriceMap,
  priceId: string | undefined,
  metadata?: Record<string, string>,
): { plan: PlanTier; interval: BillingInterval } {
  if (priceId === prices.proMonthly) return { plan: "pro", interval: "monthly" };
  if (priceId === prices.proYearly) return { plan: "pro", interval: "yearly" };
  if (priceId === prices.teamMonthly) return { plan: "team", interval: "monthly" };
  if (priceId === prices.teamYearly) return { plan: "team", interval: "yearly" };

  const metaPlan = metadata?.plan;
  const metaInterval = metadata?.interval;
  return {
    plan: metaPlan === "team" || metaPlan === "pro" || metaPlan === "free" ? metaPlan : "pro",
    interval: metaInterval === "yearly" ? "yearly" : "monthly",
  };
}

function normalizeStatus(status: string): BillingSubscriptionSnapshot["status"] {
  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "canceled"
  ) {
    return status;
  }
  if (status === "incomplete" || status === "unpaid") return "past_due";
  return "canceled";
}

function statusPriority(status: BillingSubscriptionSnapshot["status"]): number {
  if (status === "active") return 0;
  if (status === "trialing") return 1;
  if (status === "past_due") return 2;
  return 3;
}

export function createStripeBillingProvider(options: StripeBillingOptions): BillingProvider {
  const secretKey = options.secretKey.trim();
  const webhookSecret = options.webhookSecret?.trim();
  const baseUrl = (options.baseUrl ?? "https://api.stripe.com").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));

  async function requestStripe<T>(
    method: "GET" | "POST",
    path: string,
    formParams?: Record<string, string>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${secretKey}`,
    };
    let body: string | undefined;
    if (formParams) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(formParams).toString();
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stripe API error (${response.status}): ${errorText.slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }

  return {
    kind: "stripe",
    async createCustomer({ email, spaceId }) {
      const customer = await requestStripe<StripeCustomerResponse>("POST", "/v1/customers", {
        email,
        "metadata[spaceId]": spaceId,
      });
      return { customerId: customer.id };
    },
    async createCheckout(input: BillingCheckoutRequest) {
      const priceId = priceFor(options.prices, input.plan, input.interval);
      const session = await requestStripe<StripeSessionResponse>("POST", "/v1/checkout/sessions", {
        mode: "subscription",
        customer: input.customerId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": String(input.seats),
        "metadata[spaceId]": input.spaceId,
        "metadata[plan]": input.plan,
        "metadata[interval]": input.interval,
        "subscription_data[metadata][spaceId]": input.spaceId,
        "subscription_data[metadata][plan]": input.plan,
        "subscription_data[metadata][interval]": input.interval,
      });
      return { url: session.url };
    },
    async createPortal({ customerId, returnUrl }) {
      const portal = await requestStripe<StripeSessionResponse>(
        "POST",
        "/v1/billing_portal/sessions",
        {
          customer: customerId,
          return_url: returnUrl,
        },
      );
      return { url: portal.url };
    },
    async getCustomerSubscription(customerId) {
      const list = await requestStripe<StripeListResponse<StripeSubscriptionObject>>(
        "GET",
        `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
      );
      const items = list.data ?? [];
      if (items.length === 0) return null;

      const sorted = [...items].sort(
        (a, b) =>
          statusPriority(normalizeStatus(a.status)) - statusPriority(normalizeStatus(b.status)),
      );
      const sub = sorted[0];
      if (!sub) return null;

      const firstItem = sub.items?.data?.[0];
      const { plan, interval } = planAndIntervalForPrice(
        options.prices,
        firstItem?.price?.id,
        sub.metadata,
      );
      const status = normalizeStatus(sub.status);
      const nowMs = nowSeconds() * 1000;

      return {
        subscriptionId: sub.id,
        customerId: typeof sub.customer === "string" ? sub.customer : customerId,
        plan: status === "canceled" ? "free" : plan,
        interval,
        status,
        seats: firstItem?.quantity ?? 1,
        currentPeriodStart: new Date((sub.current_period_start ?? Math.floor(nowMs / 1000)) * 1000),
        currentPeriodEnd: new Date((sub.current_period_end ?? Math.floor(nowMs / 1000)) * 1000),
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      };
    },
    parseWebhook(rawBody, signatureHeader): WebhookParseResult {
      if (!webhookSecret || !signatureHeader) {
        return { kind: "invalid" };
      }

      let timestampStr: string | undefined;
      const v1Signatures: string[] = [];
      for (const part of signatureHeader.split(",")) {
        const [rawKey, rawVal] = part.split("=", 2);
        const key = rawKey?.trim();
        const val = rawVal?.trim();
        if (!key || !val) continue;
        if (key === "t") timestampStr = val;
        if (key === "v1") v1Signatures.push(val);
      }

      const timestamp = Number(timestampStr);
      if (!timestampStr || !Number.isFinite(timestamp) || v1Signatures.length === 0) {
        return { kind: "invalid" };
      }
      if (Math.abs(nowSeconds() - timestamp) > 300) {
        return { kind: "invalid" };
      }

      const expectedHex = createHmac("sha256", webhookSecret)
        .update(`${timestampStr}.${rawBody}`)
        .digest("hex");
      const expectedBuf = Buffer.from(expectedHex, "hex");

      const signatureMatched = v1Signatures.some((sig) => {
        if (!/^[0-9a-f]+$/i.test(sig)) return false;
        const actualBuf = Buffer.from(sig, "hex");
        return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
      });
      if (!signatureMatched) {
        return { kind: "invalid" };
      }

      try {
        const event = JSON.parse(rawBody) as {
          id?: string;
          type?: string;
          data?: { object?: { customer?: unknown } };
        };
        if (!event.id || !event.type || !RELEVANT_EVENTS.has(event.type)) {
          return { kind: "ignored" };
        }
        const customer = event.data?.object?.customer;
        if (typeof customer !== "string" || customer.length === 0) {
          return { kind: "ignored" };
        }
        return {
          kind: "reconcile",
          customerId: customer,
          eventId: event.id,
        };
      } catch {
        return { kind: "invalid" };
      }
    },
  };
}
