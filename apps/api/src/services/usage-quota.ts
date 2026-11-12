import type {
  BillingStatus,
  ComposerDraft,
  ComposerMode,
  PromptFramework,
} from "@open-prompt-os/contracts";
import {
  type GenerationKind,
  type PlanTier,
  Prisma,
  type UsageAction,
  prisma,
  runAsTenant,
} from "@open-prompt-os/db";
import type { ResolvedActor } from "../auth/session-resolver.js";

export function getTodayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function getTomorrowUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
}

const DEFAULT_LIMITS: Record<PlanTier, Record<UsageAction, number>> = {
  free: { compose: 20, refine: 10, autopsy: 5, reverse_engineer: 3 },
  pro: { compose: 500, refine: 250, autopsy: 100, reverse_engineer: 50 },
  team: { compose: 2000, refine: 1000, autopsy: 500, reverse_engineer: 200 },
};

const GUEST_DEFAULT_LIMITS: Record<UsageAction, number> = {
  compose: 5,
  refine: 3,
  autopsy: 2,
  reverse_engineer: 1,
};

export interface QuotaCheckResult {
  readonly allowed: boolean;
  readonly remainingDaily: number;
  readonly dailyLimit: number;
  readonly currentUsage: number;
}

/**
 * Checks whether the actor (tenant space or guest) has remaining quota for the specified action today.
 */
export async function checkQuota(
  actor: ResolvedActor,
  action: UsageAction,
): Promise<QuotaCheckResult> {
  const today = getTodayUtcDate();
  const isGuest = !actor.spaceId;

  let plan: PlanTier = "free";
  if (actor.spaceId) {
    const space = await prisma.space.findUnique({
      where: { id: actor.spaceId },
      select: { plan: true },
    });
    if (space?.plan) {
      plan = space.plan;
    }
  }

  // Lookup configurable limit from DB, falling back to static defaults
  let dailyLimit: number;
  try {
    const limitRow = await prisma.planLimit.findUnique({
      where: {
        plan_action_isGuest: {
          plan,
          action,
          isGuest,
        },
      },
    });
    dailyLimit =
      limitRow?.dailyLimit ??
      (isGuest ? GUEST_DEFAULT_LIMITS[action] : DEFAULT_LIMITS[plan][action]);
  } catch {
    dailyLimit = isGuest ? GUEST_DEFAULT_LIMITS[action] : DEFAULT_LIMITS[plan][action];
  }

  // Lookup current usage today
  let currentUsage = 0;
  try {
    if (actor.spaceId) {
      const spaceId = actor.spaceId;
      const counter = await runAsTenant({ spaceId, userId: actor.userId }, async (tx) =>
        tx.usageCounter.findUnique({
          where: {
            spaceId_usageDate_action: {
              spaceId,
              usageDate: today,
              action,
            },
          },
          select: { count: true },
        }),
      );
      currentUsage = counter?.count ?? 0;
    } else {
      const counter = await runAsTenant({ clientKey: actor.hashedClientKey }, async (tx) =>
        tx.usageCounter.findUnique({
          where: {
            clientKey_usageDate_action: {
              clientKey: actor.hashedClientKey,
              usageDate: today,
              action,
            },
          },
          select: { count: true },
        }),
      );
      currentUsage = counter?.count ?? 0;
    }
  } catch {
    // If DB is unreachable, fail open or default to 0
    currentUsage = 0;
  }

  const remainingDaily = Math.max(0, dailyLimit - currentUsage);
  return {
    allowed: remainingDaily > 0,
    remainingDaily,
    dailyLimit,
    currentUsage,
  };
}

/**
 * Atomically increments today's usage counter for the actor using PostgreSQL ON CONFLICT.
 */
export async function recordUsage(
  actor: ResolvedActor,
  action: UsageAction,
): Promise<{ newCount: number }> {
  const today = getTodayUtcDate();

  return runAsTenant(
    {
      spaceId: actor.spaceId,
      userId: actor.userId,
      clientKey: actor.spaceId ? undefined : actor.hashedClientKey,
    },
    async (tx) => {
      if (actor.spaceId) {
        const row = await tx.usageCounter.upsert({
          where: {
            spaceId_usageDate_action: {
              spaceId: actor.spaceId,
              usageDate: today,
              action,
            },
          },
          create: {
            spaceId: actor.spaceId,
            usageDate: today,
            action,
            count: 1,
          },
          update: {
            count: { increment: 1 },
          },
          select: { count: true },
        });
        return { newCount: row.count };
      }

      const row = await tx.usageCounter.upsert({
        where: {
          clientKey_usageDate_action: {
            clientKey: actor.hashedClientKey,
            usageDate: today,
            action,
          },
        },
        create: {
          clientKey: actor.hashedClientKey,
          usageDate: today,
          action,
          count: 1,
        },
        update: {
          count: { increment: 1 },
        },
        select: { count: true },
      });
      return { newCount: row.count };
    },
  );
}

export interface PromptGenerationPayload {
  readonly kind: GenerationKind;
  readonly rawInput: string;
  readonly compiledPrompt: string;
  readonly draft?: ComposerDraft | null;
  readonly mode: ComposerMode;
  readonly framework: PromptFramework;
  readonly modelId?: string | null;
  readonly providerId: string;
  readonly latencyMs: number;
}

/**
 * Persists an execution into `prompt_generations` if the actor has a space.
 */
export async function recordPromptGeneration(
  actor: ResolvedActor,
  payload: PromptGenerationPayload,
): Promise<string | null> {
  if (!actor.spaceId) return null;
  const spaceId = actor.spaceId;

  return runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    const created = await tx.promptGeneration.create({
      data: {
        spaceId,
        userId: actor.userId ?? null,
        kind: payload.kind,
        rawInput: payload.rawInput,
        compiledPrompt: payload.compiledPrompt,
        draft: payload.draft ? (payload.draft as Prisma.InputJsonValue) : Prisma.JsonNull,
        mode: payload.mode,
        framework: payload.framework,
        modelId: payload.modelId ?? null,
        providerId: payload.providerId,
        latencyMs: payload.latencyMs,
      },
      select: { id: true },
    });
    return created.id;
  });
}

/**
 * Computes live billing and remaining prompt entitlement status for the actor.
 */
export async function getBillingStatus(actor: ResolvedActor): Promise<BillingStatus> {
  const isGuest = !actor.spaceId;
  let plan: PlanTier = "free";
  let status: "active" | "trialing" | "past_due" | "canceled" = "active";
  let seats = 1;
  let currentPeriodEnd: string | null = null;

  if (actor.spaceId) {
    const space = await prisma.space.findUnique({
      where: { id: actor.spaceId },
      include: {
        subscriptions: {
          where: { status: { in: ["active", "trialing", "past_due"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (space) {
      plan = space.plan;
      const sub = space.subscriptions[0];
      if (sub) {
        plan = sub.plan;
        status = sub.status;
        seats = sub.seats;
        currentPeriodEnd = sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null;
      }
    }
  }

  // Quota for compose action
  const quota = await checkQuota(actor, "compose");

  return {
    plan,
    status,
    remainingDailyPrompts: quota.remainingDaily,
    dailyLimit: quota.dailyLimit,
    resetAt: getTomorrowUtcMidnight().toISOString(),
    seats,
    currentPeriodEnd,
  };
}
