import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  console.log(`[vercel-build] Running: ${cmd}`);
  execSync(cmd, { cwd: rootDir, stdio: "inherit" });
}

function resolveEsbuildBin() {
  const candidates = [
    path.join(rootDir, "node_modules/.bin/esbuild"),
    path.join(rootDir, "node_modules/.pnpm/node_modules/.bin/esbuild"),
    path.join(rootDir, "apps/api/node_modules/.bin/esbuild"),
    path.join(rootDir, "apps/web/node_modules/.bin/esbuild"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Unable to locate esbuild binary in node_modules.");
}

run("pnpm --filter @open-prompt-os/db db:generate");

const hasDb = Boolean(
  process.env.OPOS_POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL ||
    process.env.OPOS_POSTGRES_URL ||
    process.env.POSTGRES_URL,
);

if (process.env.VERCEL_ENV === "production" && hasDb) {
  run("pnpm db:migrate:deploy");
  run("pnpm db:seed");
} else {
  console.log(
    `[vercel-build] Skipping DB migrate/seed (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}, hasDb=${hasDb}).`,
  );
}

run("pnpm --filter @open-prompt-os/web build");

mkdirSync(path.join(rootDir, "api"), { recursive: true });
const entryFile = path.join(rootDir, "apps/api/src/vercel.ts");
const outFile = path.join(rootDir, "api/_bundle.mjs");
console.log("[vercel-build] Bundling API serverless function -> api/_bundle.mjs");
execFileSync(
  resolveEsbuildBin(),
  [
    entryFile,
    "--bundle",
    "--platform=node",
    "--target=node22",
    "--format=esm",
    `--outfile=${outFile}`,
    "--external:pg-native",
    "--banner:js=import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  ],
  { cwd: rootDir, stdio: "inherit" },
);
