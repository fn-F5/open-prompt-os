import { randomUUID } from "node:crypto";
import type {
  FeedbackItem,
  FeedbackKind,
  FeedbackStatus,
  SubmitFeedbackInput,
} from "@open-prompt-os/contracts";
import { prisma, runAsTenant } from "@open-prompt-os/db";
import { ORPCError } from "@orpc/server";
import type { ResolvedActor } from "../auth/session-resolver.js";
import { logger } from "../logger.js";
import { type FeedbackMailer, createDefaultFeedbackMailer } from "./feedback-mailer.js";

const devFallbackFeedbackStore: Array<
  FeedbackItem & { readonly userId?: string; readonly spaceId?: string }
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

function formatFeedbackItem(row: {
  id: string;
  kind: string;
  title: string | null;
  message: string;
  status: string;
  pagePath: string | null;
  createdAt: Date;
}): FeedbackItem {
  return {
    id: row.id,
    kind: row.kind as FeedbackKind,
    title: row.title,
    message: row.message,
    status: row.status as FeedbackStatus,
    pagePath: row.pagePath,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Persists user or guest feedback / feature requests into `user_feedback` under RLS
 * and dispatches an email notification to the product inbox.
 */
export async function submitFeedback(
  actor: ResolvedActor,
  input: SubmitFeedbackInput,
  deps?: { readonly mailer?: FeedbackMailer },
): Promise<FeedbackItem> {
  const id = `fbk_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const title = input.title?.trim() || null;
  const contactEmail = input.contactEmail?.trim() || null;
  const pagePath = input.pagePath?.trim() || null;
  const message = input.message.trim();

  let item: FeedbackItem;
  try {
    item = await runAsTenant(
      {
        spaceId: actor.spaceId,
        userId: actor.userId,
        clientKey: actor.hashedClientKey,
      },
      async (tx) => {
        const created = await tx.userFeedback.create({
          data: {
            id,
            spaceId: actor.spaceId ?? null,
            userId: actor.userId ?? null,
            clientKey: actor.spaceId ? null : actor.hashedClientKey,
            kind: input.kind,
            title,
            message,
            contactEmail,
            pagePath,
            status: "open",
          },
        });
        return formatFeedbackItem(created);
      },
    );
  } catch (error) {
    if (
      process.env.NODE_ENV === "development" &&
      (isDatabaseUnavailableError(error) || isMissingTableError(error))
    ) {
      logger.warn(
        "PostgreSQL is unavailable or unmigrated in development; storing feedback in local memory.",
        { event: "feedback.dev_fallback", err: error },
      );
      item = {
        id,
        kind: input.kind,
        title,
        message,
        status: "open",
        pagePath,
        createdAt: new Date().toISOString(),
      };
      devFallbackFeedbackStore.unshift({
        ...item,
        userId: actor.userId,
        spaceId: actor.spaceId,
      });
    } else if (isMissingTableError(error)) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Feedback storage is not migrated yet. Run database migrations first.",
      });
    } else {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Unable to save feedback right now. Please try again shortly.",
      });
    }
  }

  let userEmail: string | null = null;
  let userName: string | null = null;
  if (actor.userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: actor.userId },
        select: { email: true, name: true },
      });
      userEmail = user?.email ?? null;
      userName = user?.name ?? null;
    } catch {
      // Best-effort lookup; email notification still proceeds without user details
    }
  }

  const mailer = deps?.mailer ?? createDefaultFeedbackMailer();
  try {
    await mailer.send({
      id: item.id,
      kind: item.kind,
      title: item.title,
      message: item.message,
      contactEmail,
      userEmail,
      userName,
      userId: actor.userId,
      spaceId: actor.spaceId,
      pagePath: item.pagePath,
      createdAt: item.createdAt,
    });
  } catch (err) {
    logger.error("Failed to send feedback notification email", {
      event: "feedback.email_failed",
      feedbackId: item.id,
      err,
    });
  }

  return item;
}

/**
 * Lists feedback and feature requests submitted by the currently authenticated user.
 */
export async function listMyFeedback(actor: ResolvedActor, limit = 20): Promise<FeedbackItem[]> {
  if (!actor.userId || !actor.spaceId) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 50);

  try {
    return await runAsTenant(
      {
        spaceId: actor.spaceId,
        userId: actor.userId,
        clientKey: actor.hashedClientKey,
      },
      async (tx) => {
        const rows = await tx.userFeedback.findMany({
          where: {
            spaceId: actor.spaceId,
            userId: actor.userId,
          },
          orderBy: { createdAt: "desc" },
          take: safeLimit,
        });
        return rows.map(formatFeedbackItem);
      },
    );
  } catch (error) {
    if (
      process.env.NODE_ENV === "development" &&
      (isDatabaseUnavailableError(error) || isMissingTableError(error))
    ) {
      return devFallbackFeedbackStore
        .filter((item) => item.spaceId === actor.spaceId && item.userId === actor.userId)
        .slice(0, safeLimit)
        .map(({ userId: _u, spaceId: _s, ...item }) => item);
    }
    throw error;
  }
}
