import { createHash } from "node:crypto";
import type { Auth } from "@open-prompt-os/auth";
import { prisma, runAsSystem } from "@open-prompt-os/db";
import type { Context } from "hono";
import { clientKey } from "../client-key.js";

export interface ResolvedActor {
  readonly clientKey: string;
  readonly hashedClientKey: string;
  readonly userId?: string;
  readonly spaceId?: string;
}

export function hashClientKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

async function ensureDevUserAndSpace(userId: string, spaceId: string): Promise<void> {
  try {
    await runAsSystem(async (tx) => {
      await tx.space.upsert({
        where: { id: spaceId },
        update: {},
        create: {
          id: spaceId,
          name: "Workspace",
          plan: "free",
        },
      });

      await tx.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          email: `${userId.replace(/[^a-zA-Z0-9]/g, "")}@openprompt.local`,
          name: "User",
        },
      });

      await tx.spaceMember.upsert({
        where: { spaceId_userId: { spaceId, userId } },
        update: {},
        create: {
          spaceId,
          userId,
          role: "owner",
        },
      });
    });
  } catch {
    // Best-effort in development / tests
  }
}

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Resolves the acting user and space from the request context.
 * Prioritizes:
 * 1. Explicit internal/test headers (`x-user-id`, `x-space-id`)
 * 2. Bearer token in `Authorization` header or `session_token` cookie against the `sessions` table
 * 3. Anonymous guest identified by hashed clientKey
 */
export async function resolveActor(
  c: Context,
  trustProxy: boolean,
  auth?: Auth,
): Promise<ResolvedActor> {
  const rawKey = clientKey(c, trustProxy);
  const hashedClientKey = hashClientKey(rawKey);

  // 1. Direct header overrides (strictly test-only; never trusted in dev or production)
  if (process.env.NODE_ENV === "test") {
    const headerUserId = c.req.header("x-user-id")?.trim();
    const headerSpaceId = c.req.header("x-space-id")?.trim();
    if (headerUserId || headerSpaceId) {
      if (headerUserId && headerSpaceId) {
        await ensureDevUserAndSpace(headerUserId, headerSpaceId);
      }
      return {
        clientKey: rawKey,
        hashedClientKey,
        userId: headerUserId || undefined,
        spaceId: headerSpaceId || undefined,
      };
    }
  }

  // 2. Better Auth session (verifies signed better-auth.session_token cookie)
  if (auth) {
    try {
      const result = await auth.api.getSession({ headers: c.req.raw.headers });
      if (result?.user?.id) {
        return {
          clientKey: rawKey,
          hashedClientKey,
          userId: result.user.id,
          spaceId: result.user.spaceId,
        };
      }
    } catch {
      // Fall through to raw token / guest lookup
    }
  }

  // 3. Session token from Authorization header or cookie
  const authHeader = c.req.header("authorization")?.trim();
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  const rawCookieHeader = c.req.header("cookie");
  const betterAuthCookie =
    parseCookie(rawCookieHeader, "__Secure-better-auth.session_token") ??
    parseCookie(rawCookieHeader, "better-auth.session_token");
  const betterAuthToken = betterAuthCookie?.split(".")[0];
  const legacyCookieToken = parseCookie(rawCookieHeader, "session_token");
  const token = bearerToken || betterAuthToken || legacyCookieToken;

  if (token) {
    try {
      const session = await prisma.session.findUnique({
        where: { token },
        select: {
          userId: true,
          activeSpaceId: true,
          expiresAt: true,
        },
      });

      if (session && session.expiresAt > new Date()) {
        let spaceId = session.activeSpaceId ?? undefined;
        if (!spaceId) {
          const membership = await runAsSystem((tx) =>
            tx.spaceMember.findFirst({
              where: { userId: session.userId },
              select: { spaceId: true },
              orderBy: { createdAt: "asc" },
            }),
          );
          spaceId = membership?.spaceId;
        }

        return {
          clientKey: rawKey,
          hashedClientKey,
          userId: session.userId,
          spaceId,
        };
      }
    } catch {
      // In case DB is temporarily unreachable or erroring, fall back to guest actor
    }
  }

  return {
    clientKey: rawKey,
    hashedClientKey,
  };
}
