/**
 * Runs the Prisma CLI with the repo-root .env loaded and DATABASE_URL composed
 * from POSTGRES_* values, so there is a single env file for the whole monorepo.
 * Usage: tsx scripts/prisma.ts <prisma args…>
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveDirectDatabaseUrl } from "../src/database-url.js";

const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
const hasExplicitOrHostedDb = Boolean(
  process.env.VERCEL ||
    process.env.DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.OPOS_POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.OPOS_POSTGRES_PRISMA_URL ||
    process.env.OPOS_POSTGRES_URL,
);
if (!hasExplicitOrHostedDb && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

try {
  process.env.DATABASE_URL = resolveDirectDatabaseUrl();
} catch (err) {
  if (process.argv[2] === "generate") {
    process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
  } else {
    throw err;
  }
}

const result = spawnSync("prisma", process.argv.slice(2), { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
