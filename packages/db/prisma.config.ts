/**
 * Prisma CLI configuration.
 *
 * With a config file present, Prisma no longer auto-loads `.env`. That's fine here:
 * `resolveDatabaseUrl()` loads the repo-root `.env` and composes DATABASE_URL from
 * POSTGRES_* values when needed, so CLI and runtime resolve the same URL.
 */
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/database-url.js";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
