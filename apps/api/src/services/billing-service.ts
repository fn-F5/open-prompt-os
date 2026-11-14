import type { BillingProvider } from "@open-prompt-os/adapter-kit";
import type {
  BillingStatus,
  CheckoutInput,
  EmulatePlanSwitchInput,
} from "@open-prompt-os/contracts";
import { type Prisma, prisma, runAsSystem, runAsTenant } from "@open-prompt-os/db";
import { ORPCError } from "@orpc/server";
import type { ResolvedActor } from "../auth/session-resolver.js";
import { getBillingStatus } from "./usage-quota.js";

async function ensureStripeCustomerId(
  actor: ResolvedActor,
  billingProvider: BillingProvider,
): Promise<{ spaceId: string; customerId: string }> {
  if (!actor.spaceId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "UNAUTHENTICATED: Sign in to manage workspace billing.",
    });
  }

  const spaceId = actor.spaceId;
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { id: true, stripeCustomerId: true },
  });
  if (!space) {
    throw new ORPCError("NOT_FOUND", { message: "Workspace not found." });
  }
  if (space.stripeCustomerId) {
    return { spaceId, customerId: space.stripeCustomerId };
  }

  let email = `owner+${spaceId}@openpromptos.local`;
  if (actor.userId) {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { email: true },
    });
    if (user?.email) {
      email = user.email;
    }
  }

  const { customerId } = await billingProvider.createCustomer({ email, spaceId });
  await prisma.space.update({
    where: { id: spaceId },
    data: { stripeCustomerId: customerId },
  });

  return { spaceId, customerId };
}

export async function startCheckoutSession(
  actor: ResolvedActor,
  input: CheckoutInput,
  billingProvider: BillingProvider,
  webOrigin: string,
): Promise<{ url: string }> {
  const { spaceId, customerId } = await ensureStripeCustomerId(actor, billingProvider);
  const origin = webOrigin.replace(/\/$/, "");
  const checkout = await billingProvider.createCheckout({
    customerId,
    spaceId,
    plan: input.plan,
    interval: input.interval,
    seats: input.seats,
    successUrl: `${origin}/billing/return?plan=${input.plan}`,
    cancelUrl: `${origin}/pricing`,
  });

  await runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    await tx.billingAuditEvent.create({
      data: {
        spaceId,
        kind: "checkout.created",
        customerId,
        payload: {
          plan: input.plan,
          interval: input.interval,
          seats: input.seats,
          provider: billingProvider.kind,
        } as Prisma.InputJsonValue,
      },
    });
  });

  if (billingProvider.kind === "emulator") {
    await reconcileCustomerSubscription(
      customerId,
      billingProvider,
      `evt_emu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    );
  }

  return checkout;
}

export async function createCustomerPortalSession(
  actor: ResolvedActor,
  billingProvider: BillingProvider,
  webOrigin: string,
): Promise<{ url: string }> {
  const { customerId } = await ensureStripeCustomerId(actor, billingProvider);
  const origin = webOrigin.replace(/\/$/, "");
  return billingProvider.createPortal({
    customerId,
    returnUrl: `${origin}/settings/profile`,
  });
}

export async function reconcileCustomerSubscription(
  customerId: string,
  billingProvider: BillingProvider,
  externalEventId?: string,
): Promise<{ spaceId: string; plan: string } | null> {
  const space = await prisma.space.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (!space) return null;

  if (externalEventId) {
    const existing = await runAsSystem((tx) =>
      tx.billingAuditEvent.findUnique({
        where: { externalId: externalEventId },
        select: { id: true },
      }),
    );
    if (existing) {
      return null;
    }
  }

  const snapshot = await billingProvider.getCustomerSubscription(customerId);
  if (!snapshot) return null;

  const effectivePlan = snapshot.status === "canceled" ? "free" : snapshot.plan;

  await runAsTenant({ spaceId: space.id }, async (tx) => {
    if (snapshot.status !== "canceled") {
      // Enforce the partial unique index (at most one live subscription per space).
      await tx.subscription.updateMany({
        where: {
          spaceId: space.id,
          stripeSubscriptionId: { not: snapshot.subscriptionId },
          status: { in: ["active", "trialing", "past_due"] },
        },
        data: {
          status: "canceled",
          canceledAt: new Date(),
        },
      });
    }

    await tx.subscription.upsert({
      where: { stripeSubscriptionId: snapshot.subscriptionId },
      create: {
        spaceId: space.id,
        plan: snapshot.plan,
        interval: snapshot.interval,
        status: snapshot.status,
        seats: snapshot.seats,
        stripeSubscriptionId: snapshot.subscriptionId,
        currentPeriodStart: snapshot.currentPeriodStart,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        canceledAt: snapshot.status === "canceled" ? new Date() : null,
      },
      update: {
        plan: snapshot.plan,
        interval: snapshot.interval,
        status: snapshot.status,
        seats: snapshot.seats,
        currentPeriodStart: snapshot.currentPeriodStart,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        canceledAt: snapshot.status === "canceled" ? new Date() : null,
      },
    });

    await tx.space.update({
      where: { id: space.id },
      data: { plan: effectivePlan },
    });

    await tx.billingAuditEvent.create({
      data: {
        spaceId: space.id,
        kind: "subscription.synced",
        customerId,
        externalId: externalEventId ?? null,
        payload: {
          subscriptionId: snapshot.subscriptionId,
          plan: snapshot.plan,
          interval: snapshot.interval,
          status: snapshot.status,
          seats: snapshot.seats,
          currentPeriodStart: snapshot.currentPeriodStart.toISOString(),
          currentPeriodEnd: snapshot.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        } as Prisma.InputJsonValue,
      },
    });
  });

  return { spaceId: space.id, plan: effectivePlan };
}

export async function refreshBillingStatus(
  actor: ResolvedActor,
  billingProvider: BillingProvider,
): Promise<BillingStatus> {
  if (actor.spaceId) {
    const space = await prisma.space.findUnique({
      where: { id: actor.spaceId },
      select: { stripeCustomerId: true },
    });
    if (space?.stripeCustomerId) {
      await reconcileCustomerSubscription(space.stripeCustomerId, billingProvider);
    }
  }
  return getBillingStatus(actor);
}

export async function switchEmulatedPlan(
  actor: ResolvedActor,
  input: EmulatePlanSwitchInput,
  billingProvider: BillingProvider,
): Promise<BillingStatus> {
  if (billingProvider.kind !== "emulator" || !billingProvider.setEmulatedPlan) {
    throw new ORPCError("FORBIDDEN", {
      message: "Emulated plan switching is only available in local emulator mode.",
    });
  }

  const { spaceId, customerId } = await ensureStripeCustomerId(actor, billingProvider);
  await billingProvider.setEmulatedPlan({
    customerId,
    spaceId,
    plan: input.plan,
    interval: input.interval,
  });

  if (input.plan === "free") {
    await runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
      await tx.subscription.updateMany({
        where: {
          spaceId,
          status: { in: ["active", "trialing", "past_due"] },
        },
        data: {
          status: "canceled",
          canceledAt: new Date(),
        },
      });
    });
  }

  await reconcileCustomerSubscription(
    customerId,
    billingProvider,
    `evt_emu_switch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );

  return getBillingStatus(actor);
}
