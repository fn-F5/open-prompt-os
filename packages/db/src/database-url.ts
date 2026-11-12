import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Env = Record<string, string | undefined>;

/**
 * Resolves the PostgreSQL connection string.
 * - Auto-loads repo root `.env` if environment variables are not yet present in process.env.
 * - Uses DATABASE_URL when set (e.g. hosted providers that hand out a full URL).
 * - Otherwise composes it from POSTGRES_* variables, URL-encoding credentials.
 * - In test environments without a DB configured, returns a fallback connection string.
 */
export function resolveDatabaseUrl(env: Env = process.env): string {
  // If not configured in process.env, try loading repo-root .env once
  if (
    !env.DATABASE_URL &&
    !env.POSTGRES_USER &&
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

  const activeEnv: Env = process.env ?? env;
  const explicit = activeEnv.DATABASE_URL?.trim();
  if (explicit && !explicit.includes("${")) return explicit;

  const user = activeEnv.POSTGRES_USER;
  const password = activeEnv.POSTGRES_PASSWORD ?? "";
  const db = activeEnv.POSTGRES_DB;

  if (!user || !db) {
    if (activeEnv.NODE_ENV === "test" || activeEnv.VITEST) {
      return "postgresql://admin:password@localhost:5432/open_prompt_os?schema=public";
    }
    throw new Error(
      "Database not configured: set DATABASE_URL or POSTGRES_USER and POSTGRES_DB in .env",
    );
  }

  const host = activeEnv.POSTGRES_HOST ?? "localhost";
  const port = activeEnv.POSTGRES_PORT ?? "5432";
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  return `postgresql://${auth}@${host}:${port}/${encodeURIComponent(db)}?schema=public`;
}
