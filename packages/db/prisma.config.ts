/**
 * Prisma CLI configuration.
 *
 * With a config file present, Prisma no longer auto-loads `.env`. That's fine here:
 * `resolveDatabaseUrl()` loads the repo-root `.env` and composes DATABASE_URL from
 * POSTGRES_* values when needed, so CLI and runtime resolve the same URL.
 */
import { defineConfig } from "prisma/config";
import { resolveDirectDatabaseUrl } from "./src/database-url.js";

function resolveDatasourceUrl(): string {
  try {
    return resolveDirectDatabaseUrl();
  } catch (err) {
    // `prisma generate` does not connect to a database; allow Preview/CI builds without DB credentials.
    if (process.argv.includes("generate")) {
      return "postgresql://placeholder:placeholder@localhost:5432/placeholder";
    }
    throw err;
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatasourceUrl(),
  },
});
