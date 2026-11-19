import { randomUUID } from "node:crypto";
import type {
  BillingInterval,
  PlanInterestItem,
  RegisterPlanInterestInput,
  UpgradeInterestPlan,
} from "@open-prompt-os/contracts";
import { runAsTenant } from "@open-prompt-os/db";
import { ORPCError } from "@orpc/server";
import type { ResolvedActor } from "../auth/session-resolver.js";
import { logger } from "../logger.js";

const devFallbackPlanInterestStore: Array<
  PlanInterestItem & { readonly userId?: string; readonly spaceId?: string }
> = [];

function isDatabaseUnavailableError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 3) return false;
  const record = error as { code?: unknown; message?: unknown; cause?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  if (
    code === "P1001" ||
    code === "P1002" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    message.includes("Can't reach database server") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT")
  ) {
    return true;
  }
  return record.cause ? isDatabaseUnavailableError(record.cause, depth + 1) : false;
}

function isMissingTableError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 3) return false;
  const record = error as { code?: unknown; message?: unknown; cause?: unknown };
  if (
    record.code === "P2021" ||
    (typeof record.message === "string" && record.message.includes("does not exist"))
  ) {
    return true;
  }
  return record.cause ? isMissingTableError(record.cause, depth + 1) : false;
}

/**
 * Records a user's or visitor's email and selected plan when expressing upgrade interest
 * during the MVP pre-Stripe phase.
 */
export async function registerPlanInterest(
  actor: ResolvedActor,
  input: RegisterPlanInterestInput,
): Promise<PlanInterestItem> {
  const id = `int_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const providedEmail = input.email?.trim().toLowerCase() || null;

  if (!actor.userId && !providedEmail) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Please enter your email address so we can notify you.",
    });
  }

  try {
    return await runAsTenant(
      {
        spaceId: actor.spaceId,
        userId: actor.userId,
        clientKey: actor.hashedClientKey,
      },
      async (tx) => {
        let resolvedEmail = providedEmail;
        if (actor.userId) {
          const user = await tx.user.findUnique({
            where: { id: actor.userId },
            select: { email: true },
          });
          if (user?.email) {
            resolvedEmail = user.email.trim().toLowerCase();
          }
        }

        if (!resolvedEmail) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Please enter a valid email address so we can notify you.",
          });
        }

        const created = await tx.planInterest.create({
          data: {
            id,
            spaceId: actor.spaceId ?? null,
            userId: actor.userId ?? null,
            clientKey: actor.spaceId ? null : actor.hashedClientKey,
            email: resolvedEmail,
            plan: input.plan,
            interval: input.interval,
          },
        });

        return {
          id: created.id,
          email: created.email,
          plan: created.plan as UpgradeInterestPlan,
          interval: created.interval as BillingInterval,
          createdAt: created.createdAt.toISOString(),
        };
      },
    );
  } catch (error) {
    if (error instanceof ORPCError) {
      throw error;
    }
    if (
      process.env.NODE_ENV === "development" &&
      (isDatabaseUnavailableError(error) || isMissingTableError(error))
    ) {
      logger.warn(
        "PostgreSQL is unavailable or unmigrated in development; storing plan interest in local memory.",
        { event: "plan_interest.dev_fallback", err: error },
      );
      const fallbackEmail = providedEmail ?? "dev@openpromptos.local";
      const item: PlanInterestItem = {
        id,
        email: fallbackEmail,
        plan: input.plan,
        interval: input.interval,
        createdAt: new Date().toISOString(),
      };
      devFallbackPlanInterestStore.unshift({
        ...item,
        userId: actor.userId,
        spaceId: actor.spaceId,
      });
      return item;
    }
    if (isMissingTableError(error)) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Plan interest storage is not migrated yet. Run database migrations first.",
      });
    }
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Unable to save your request right now. Please try again shortly.",
    });
  }
}
