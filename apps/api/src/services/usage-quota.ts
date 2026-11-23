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
  runAsSystem,
  runAsTenant,
} from "@open-prompt-os/db";
import type { ResolvedActor } from "../auth/session-resolver.js";
import { logger } from "../logger.js";

export function getTodayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function getTomorrowUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
}

const DEFAULT_LIMITS: Record<PlanTier, Record<UsageAction, number>> = {
  free: { compose: 10, refine: 10, autopsy: 10, reverse_engineer: 10 },
  pro: { compose: 35, refine: 35, autopsy: 35, reverse_engineer: 35 },
  team: { compose: 60, refine: 60, autopsy: 60, reverse_engineer: 60 },
};

const GUEST_DEFAULT_LIMITS: Record<UsageAction, number> = {
  compose: 10,
  refine: 10,
  autopsy: 10,
  reverse_engineer: 10,
};

const DEFAULT_GLOBAL_GUEST_DAILY_LIMIT = 500;

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function resolveGlobalGuestDailyLimit(): number {
  const raw = process.env.GLOBAL_GUEST_DAILY_LIMIT?.trim();
  if (!raw) return DEFAULT_GLOBAL_GUEST_DAILY_LIMIT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_GLOBAL_GUEST_DAILY_LIMIT;
}

export interface QuotaCheckResult {
  readonly allowed: boolean;
  readonly remainingDaily: number;
  readonly dailyLimit: number;
  readonly currentUsage: number;
}

export interface QuotaReservationResult extends QuotaCheckResult {
  readonly reserved: boolean;
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

  const lookupTodayUsage = async (): Promise<{
    actionUsage: number;
    totalUsage: number;
  }> => {
    try {
      const rows = actor.spaceId
        ? await runAsTenant({ spaceId: actor.spaceId, userId: actor.userId }, async (tx) =>
            tx.usageCounter.findMany({
              where: {
                spaceId: actor.spaceId,
                usageDate: today,
              },
              select: { action: true, count: true },
            }),
          )
        : await runAsTenant({ clientKey: actor.hashedClientKey }, async (tx) =>
            tx.usageCounter.findMany({
              where: {
                clientKey: actor.hashedClientKey,
                usageDate: today,
              },
              select: { action: true, count: true },
            }),
          );

      let actionUsage = 0;
      let totalUsage = 0;
      for (const row of rows) {
        totalUsage += row.count;
        if (row.action === action) {
          actionUsage += row.count;
        }
      }
      return { actionUsage, totalUsage };
    } catch (error) {
      logger.error("Quota usage lookup failed", {
        event: "quota.usage_lookup_failed",
        action,
        err: error,
      });
      if (isProductionEnv()) {
        throw new Error("Quota storage is temporarily unavailable.");
      }
      return { actionUsage: 0, totalUsage: 0 };
    }
  };

  const lookupDailyLimit = async (plan: PlanTier, targetAction: UsageAction): Promise<number> => {
    try {
      const limitRow = await prisma.planLimit.findUnique({
        where: {
          plan_action_isGuest: {
            plan,
            action: targetAction,
            isGuest,
          },
        },
      });
      return (
        limitRow?.dailyLimit ??
        (isGuest ? GUEST_DEFAULT_LIMITS[targetAction] : DEFAULT_LIMITS[plan][targetAction])
      );
    } catch (error) {
      logger.error("Quota plan limit lookup failed; using default limit", {
        event: "quota.limit_lookup_failed",
        plan,
        action: targetAction,
        err: error,
      });
      return isGuest ? GUEST_DEFAULT_LIMITS[targetAction] : DEFAULT_LIMITS[plan][targetAction];
    }
  };

  const lookupGlobalGuestUsage = async (): Promise<number> => {
    try {
      const agg = await runAsSystem((tx) =>
        tx.usageCounter.aggregate({
          _sum: { count: true },
          where: {
            spaceId: null,
            usageDate: today,
          },
        }),
      );
      return agg._sum.count ?? 0;
    } catch (error) {
      logger.error("Global guest quota lookup failed", {
        event: "quota.global_guest_lookup_failed",
        err: error,
      });
      if (isProductionEnv()) {
        throw new Error("Quota storage is temporarily unavailable.");
      }
      return 0;
    }
  };

  let plan: PlanTier = "free";
  let usage: { actionUsage: number; totalUsage: number };
  let globalGuestRemaining = Number.POSITIVE_INFINITY;

  if (actor.spaceId) {
    const spaceId = actor.spaceId;
    const [space, todayUsage] = await Promise.all([
      prisma.space
        .findUnique({
          where: { id: spaceId },
          select: { plan: true },
        })
        .catch((error: unknown) => {
          logger.error("Quota space plan lookup failed; defaulting to free", {
            event: "quota.space_lookup_failed",
            spaceId,
            err: error,
          });
          return null;
        }),
      lookupTodayUsage(),
    ]);
    plan = space?.plan ?? "free";
    usage = todayUsage;
  } else {
    const [todayUsage, globalGuestUsage] = await Promise.all([
      lookupTodayUsage(),
      lookupGlobalGuestUsage(),
    ]);
    usage = todayUsage;
    const globalLimit = resolveGlobalGuestDailyLimit();
    globalGuestRemaining = Math.max(0, globalLimit - globalGuestUsage);
    if (globalGuestRemaining === 0) {
      logger.warn("Global anonymous guest daily limit reached", {
        event: "quota.global_guest_exhausted",
        globalGuestUsage,
        globalLimit,
      });
    }
  }

  const [dailyLimit, totalDailyLimit] =
    action === "compose"
      ? await lookupDailyLimit(plan, "compose").then((limit) => [limit, limit] as const)
      : await Promise.all([lookupDailyLimit(plan, action), lookupDailyLimit(plan, "compose")]);

  const actionRemaining = Math.max(0, dailyLimit - usage.actionUsage);
  const totalRemaining = Math.max(0, totalDailyLimit - usage.totalUsage);
  const remainingDaily = Math.min(actionRemaining, totalRemaining, globalGuestRemaining);
  return {
    allowed: remainingDaily > 0,
    remainingDaily,
    dailyLimit,
    currentUsage: usage.actionUsage,
  };
}

/**
 * Atomically checks quota and reserves (increments) 1 unit inside a single transaction
 * guarded by a per-actor advisory lock so parallel bursts cannot bypass daily limits.
 * Fails closed in production if the database cannot be reached.
 */
export async function reserveQuota(
  actor: ResolvedActor,
  action: UsageAction,
): Promise<QuotaReservationResult> {
  const today = getTodayUtcDate();
  const isGuest = !actor.spaceId;

  const lookupDailyLimit = async (plan: PlanTier, targetAction: UsageAction): Promise<number> => {
    try {
      const limitRow = await prisma.planLimit.findUnique({
        where: {
          plan_action_isGuest: {
            plan,
            action: targetAction,
            isGuest,
          },
        },
      });
      return (
        limitRow?.dailyLimit ??
        (isGuest ? GUEST_DEFAULT_LIMITS[targetAction] : DEFAULT_LIMITS[plan][targetAction])
      );
    } catch (error) {
      logger.error("Quota plan limit lookup failed; using default limit", {
        event: "quota.limit_lookup_failed",
        plan,
        action: targetAction,
        err: error,
      });
      return isGuest ? GUEST_DEFAULT_LIMITS[targetAction] : DEFAULT_LIMITS[plan][targetAction];
    }
  };

  let plan: PlanTier = "free";
  if (actor.spaceId) {
    const spaceId = actor.spaceId;
    const space = await prisma.space
      .findUnique({
        where: { id: spaceId },
        select: { plan: true },
      })
      .catch((error: unknown) => {
        logger.error("Quota space plan lookup failed", {
          event: "quota.space_lookup_failed",
          spaceId,
          err: error,
        });
        if (isProductionEnv()) {
          throw new Error("Quota storage is temporarily unavailable.");
        }
        return null;
      });
    plan = space?.plan ?? "free";
  }

  const [dailyLimit, totalDailyLimit] =
    action === "compose"
      ? await lookupDailyLimit(plan, "compose").then((limit) => [limit, limit] as const)
      : await Promise.all([lookupDailyLimit(plan, action), lookupDailyLimit(plan, "compose")]);

  let globalGuestRemaining = Number.POSITIVE_INFINITY;
  if (isGuest) {
    try {
      const agg = await runAsSystem((tx) =>
        tx.usageCounter.aggregate({
          _sum: { count: true },
          where: {
            spaceId: null,
            usageDate: today,
          },
        }),
      );
      const globalGuestUsage = agg._sum.count ?? 0;
      const globalLimit = resolveGlobalGuestDailyLimit();
      globalGuestRemaining = Math.max(0, globalLimit - globalGuestUsage);
      if (globalGuestRemaining === 0) {
        logger.warn("Global anonymous guest daily limit reached", {
          event: "quota.global_guest_exhausted",
          globalGuestUsage,
          globalLimit,
        });
        return {
          allowed: false,
          remainingDaily: 0,
          dailyLimit,
          currentUsage: 0,
          reserved: false,
        };
      }
    } catch (error) {
      logger.error("Global guest quota lookup failed", {
        event: "quota.global_guest_lookup_failed",
        err: error,
      });
      if (isProductionEnv()) {
        throw new Error("Quota storage is temporarily unavailable.");
      }
    }
  }

  const lockKey = `quota:${actor.spaceId ?? actor.hashedClientKey}:${today.toISOString().slice(0, 10)}`;

  try {
    return await runAsTenant(
      {
        spaceId: actor.spaceId,
        userId: actor.userId,
        clientKey: actor.spaceId ? undefined : actor.hashedClientKey,
      },
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const rows = actor.spaceId
          ? await tx.usageCounter.findMany({
              where: { spaceId: actor.spaceId, usageDate: today },
              select: { action: true, count: true },
            })
          : await tx.usageCounter.findMany({
              where: { clientKey: actor.hashedClientKey, usageDate: today },
              select: { action: true, count: true },
            });

        let actionUsage = 0;
        let totalUsage = 0;
        for (const row of rows) {
          totalUsage += row.count;
          if (row.action === action) actionUsage += row.count;
        }

        const actionRemaining = Math.max(0, dailyLimit - actionUsage);
        const totalRemaining = Math.max(0, totalDailyLimit - totalUsage);
        const minRemaining = Math.min(actionRemaining, totalRemaining, globalGuestRemaining);

        if (minRemaining <= 0) {
          return {
            allowed: false,
            remainingDaily: 0,
            dailyLimit,
            currentUsage: actionUsage,
            reserved: false,
          };
        }

        if (actor.spaceId) {
          await tx.usageCounter.upsert({
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
          });
        } else {
          await tx.usageCounter.upsert({
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
          });
        }

        return {
          allowed: true,
          remainingDaily: Math.max(0, minRemaining - 1),
          dailyLimit,
          currentUsage: actionUsage + 1,
          reserved: true,
        };
      },
    );
  } catch (error) {
    logger.error("Atomic quota reservation failed", {
      event: "quota.reserve_failed",
      action,
      err: error,
    });
    if (isProductionEnv()) {
      throw new Error("Quota storage is temporarily unavailable.");
    }
    return {
      allowed: true,
      remainingDaily: Math.max(0, dailyLimit - 1),
      dailyLimit,
      currentUsage: 0,
      reserved: false,
    };
  }
}

/**
 * Refunds 1 reserved quota unit if an AI request fails or aborts before completion.
 */
export async function releaseQuota(actor: ResolvedActor, action: UsageAction): Promise<void> {
  const today = getTodayUtcDate();
  try {
    await runAsTenant(
      {
        spaceId: actor.spaceId,
        userId: actor.userId,
        clientKey: actor.spaceId ? undefined : actor.hashedClientKey,
      },
      async (tx) => {
        if (actor.spaceId) {
          await tx.usageCounter.updateMany({
            where: {
              spaceId: actor.spaceId,
              usageDate: today,
              action,
              count: { gt: 0 },
            },
            data: { count: { decrement: 1 } },
          });
          return;
        }
        await tx.usageCounter.updateMany({
          where: {
            clientKey: actor.hashedClientKey,
            usageDate: today,
            action,
            count: { gt: 0 },
          },
          data: { count: { decrement: 1 } },
        });
      },
    );
  } catch (error) {
    logger.warn("Failed to release reserved quota after request error", {
      event: "quota.release_failed",
      action,
      err: error,
    });
  }
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
  readonly draft?: (ComposerDraft & { readonly sourcePreviewDataUrl?: string }) | null;
  readonly mode: ComposerMode;
  readonly framework: PromptFramework;
  readonly modelId?: string | null;
  readonly providerId: string;
  readonly latencyMs: number;
}

/**
 * Persists an execution into `prompt_generations` for both authenticated workspaces and anonymous guests.
 */
export async function recordPromptGeneration(
  actor: ResolvedActor,
  payload: PromptGenerationPayload,
): Promise<string | null> {
  const spaceId = actor.spaceId ?? null;
  const clientKey = spaceId ? null : actor.hashedClientKey;

  return runAsTenant(
    {
      spaceId: actor.spaceId,
      userId: actor.userId,
      clientKey: spaceId ? undefined : actor.hashedClientKey,
    },
    async (tx) => {
      const created = await tx.promptGeneration.create({
        data: {
          spaceId,
          userId: actor.userId ?? null,
          clientKey,
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
    },
  );
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
