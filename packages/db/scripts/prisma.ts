/**
 * Runs the Prisma CLI with the repo-root .env loaded and DATABASE_URL composed
 * from POSTGRES_* values, so there is a single env file for the whole monorepo.
 * Usage: tsx scripts/prisma.ts <prisma args…>
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveDatabaseUrl } from "../src/database-url.js";

const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

process.env.DATABASE_URL = resolveDatabaseUrl();

const result = spawnSync("prisma", process.argv.slice(2), { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
