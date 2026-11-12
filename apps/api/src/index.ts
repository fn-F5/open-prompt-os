import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createAuth, loadAuthBoot } from "@open-prompt-os/auth";
import { prisma, resolveDatabaseUrl } from "@open-prompt-os/db";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRuntime } from "./runtime.js";

const envFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig(process.env);
const authBoot = loadAuthBoot({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL?.trim() || resolveDatabaseUrl(),
});
const auth = authBoot ? createAuth({ db: prisma, boot: authBoot }) : undefined;
const { orchestrator } = createRuntime(config);
const app = createApp({
  orchestrator,
  webOrigins: config.webOrigins,
  trustProxy: config.trustProxy,
  allowRequest: createRateLimiter(config.rateLimitPerMinute, 60_000),
  auth,
  oauthProviders: authBoot
    ? {
        google: Boolean(authBoot.googleClientId && authBoot.googleClientSecret),
        github: Boolean(authBoot.githubClientId && authBoot.githubClientSecret),
      }
    : undefined,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`api listening on ${info.port}`);
});
