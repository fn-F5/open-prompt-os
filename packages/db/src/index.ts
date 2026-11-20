import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDatabaseUrl } from "./database-url.js";
import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";
export { resolveDatabaseUrl } from "./database-url.js";

export type DbLogHandler = (event: string, data: Record<string, unknown>) => void;

let dbLogHandler: DbLogHandler | null = null;

/** Registers a structured logger for DB query timing and insert payloads. */
export function setDbLogger(handler: DbLogHandler | null): void {
  dbLogHandler = handler;
}

const INSERT_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
const basePrisma = new PrismaClient({ adapter });

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (INSERT_OPERATIONS.has(operation) && dbLogHandler) {
          const payload = args as { data?: unknown; create?: unknown } | undefined;
          dbLogHandler("db.insert", {
            model,
            operation,
            insertData: payload?.data ?? payload?.create ?? null,
          });
        }
        const started = performance.now();
        try {
          return await query(args);
        } finally {
          if (dbLogHandler) {
            const durationMs = Math.round((performance.now() - started) * 100) / 100;
            dbLogHandler("db.query", {
              model,
              operation,
              durationMs,
            });
          }
        }
      },
    },
  },
}) as unknown as PrismaClient;

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
