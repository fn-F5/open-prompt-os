import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Env = Record<string, string | undefined>;

const POOLED_URL_KEYS = [
  "OPOS_POSTGRES_PRISMA_URL",
  "POSTGRES_PRISMA_URL",
  "OPOS_POSTGRES_URL",
  "POSTGRES_URL",
  "OPOS_POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL_NON_POOLING",
] as const;

const DIRECT_URL_KEYS = [
  "DIRECT_URL",
  "OPOS_POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL_NON_POOLING",
] as const;

function firstValidUrl(env: Env, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value && !value.includes("${")) return value;
  }
  return undefined;
}

function hasConfiguredDbEnv(env: Env): boolean {
  return Boolean(
    env.DATABASE_URL ||
      env.DIRECT_URL ||
      env.POSTGRES_USER ||
      env.OPOS_POSTGRES_USER ||
      POOLED_URL_KEYS.some((key) => Boolean(env[key])),
  );
}

function maybeLoadRootEnv(env: Env): void {
  if (
    env === process.env &&
    !env.VERCEL &&
    !hasConfiguredDbEnv(env) &&
    typeof process !== "undefined" &&
    typeof process.loadEnvFile === "function"
  ) {
    try {
      const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
      if (existsSync(rootEnv)) {
        process.loadEnvFile(rootEnv);
      }
    } catch {
      // Ignore if cannot read file
    }
  }
}

/**
 * Resolves the PostgreSQL connection string for runtime queries.
 * - Auto-loads repo root `.env` if environment variables are not yet present in process.env.
 * - Uses DATABASE_URL when set (e.g. hosted providers that hand out a full URL).
 * - Falls back to Vercel/Supabase integration URLs (e.g. OPOS_POSTGRES_PRISMA_URL, OPOS_POSTGRES_URL).
 * - Otherwise composes it from POSTGRES_* / OPOS_POSTGRES_* variables, URL-encoding credentials.
 * - In test environments without a DB configured, returns a fallback connection string.
 */
export function resolveDatabaseUrl(env: Env = process.env): string {
  maybeLoadRootEnv(env);

  const activeEnv: Env = env;
  const explicit = firstValidUrl(activeEnv, ["DATABASE_URL", ...POOLED_URL_KEYS]);
  if (explicit) return explicit;

  const user = activeEnv.POSTGRES_USER || activeEnv.OPOS_POSTGRES_USER;
  const password = activeEnv.POSTGRES_PASSWORD ?? activeEnv.OPOS_POSTGRES_PASSWORD ?? "";
  const db =
    activeEnv.POSTGRES_DB || activeEnv.POSTGRES_DATABASE || activeEnv.OPOS_POSTGRES_DATABASE;

  if (!user || !db) {
    if (activeEnv.NODE_ENV === "test" || activeEnv.VITEST) {
      return "postgresql://admin:password@localhost:5432/open_prompt_os?schema=public";
    }
    throw new Error(
      "Database not configured: set DATABASE_URL or POSTGRES_USER and POSTGRES_DB in .env",
    );
  }

  const host = activeEnv.POSTGRES_HOST ?? activeEnv.OPOS_POSTGRES_HOST ?? "localhost";
  const port = activeEnv.POSTGRES_PORT ?? activeEnv.OPOS_POSTGRES_PORT ?? "5432";
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  return `postgresql://${auth}@${host}:${port}/${encodeURIComponent(db)}?schema=public`;
}

/**
 * Resolves a direct (non-pooling) PostgreSQL connection string for Prisma migrations and DDL/RLS.
 * Prefers DIRECT_URL / OPOS_POSTGRES_URL_NON_POOLING / POSTGRES_URL_NON_POOLING before falling
 * back to `resolveDatabaseUrl(env)`.
 */
export function resolveDirectDatabaseUrl(env: Env = process.env): string {
  maybeLoadRootEnv(env);
  const direct = firstValidUrl(env, DIRECT_URL_KEYS);
  if (direct) return direct;
  return resolveDatabaseUrl(env);
}

/**
 * Builds a `pg.PoolConfig`-compatible object from a PostgreSQL connection string.
 * For hosted TLS endpoints (e.g. Supabase pooler with `sslmode=require`), configures
 * `ssl: { rejectUnauthorized: false }` and strips `sslmode` so `pg-connection-string`
 * does not enforce `verify-full` against intermediate certs.
 */
export function buildPgPoolConfig(connectionString: string): {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
} {
  try {
    const parsed = new URL(connectionString);
    const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";
    const needsRelaxedSsl =
      !isLocalhost &&
      (sslmode === "require" ||
        sslmode === "prefer" ||
        sslmode === "verify-ca" ||
        parsed.hostname.endsWith(".supabase.com"));

    if (needsRelaxedSsl) {
      parsed.searchParams.delete("sslmode");
      return {
        connectionString: parsed.toString(),
        ssl: { rejectUnauthorized: false },
      };
    }
  } catch {
    // Fall back to raw connection string when URL parsing fails
  }
  return { connectionString };
}
