import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./database-url.js";

export * from "@prisma/client";
export { resolveDatabaseUrl } from "./database-url.js";

export const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Runs `fn` in a transaction scoped by RLS to a space (and optionally a guest client key). */
export function runAsTenant<T>(
  ctx: { spaceId?: string; userId?: string; clientKey?: string },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.space_id', ${ctx.spaceId ?? ""}, true),
                                set_config('app.user_id', ${ctx.userId ?? ""}, true),
                                set_config('app.client_key', ${ctx.clientKey ?? ""}, true),
                                set_config('app.is_system', 'false', true)`;
    return fn(tx);
  });
}

/** Runs `fn` with system-level privileges that bypass tenant isolation (e.g. background workers, probes). */
export function runAsSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_system', 'true', true),
                                set_config('app.space_id', '', true),
                                set_config('app.client_key', '', true)`;
    return fn(tx);
  });
}
