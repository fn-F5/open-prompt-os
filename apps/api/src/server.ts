import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuth, createCaptureMailer, loadAuthBoot } from "@open-prompt-os/auth";
import { prisma, resolveDatabaseUrl } from "@open-prompt-os/db";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createE2eOrchestrator } from "./e2e-harness.js";
import { createPostHogErrorTracker } from "./posthog.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRuntime } from "./runtime.js";

export interface CreateServerAppOptions {
  readonly loadDotEnv?: boolean;
}

/** Boots configuration, Better Auth, LLM orchestrator, and the Hono app instance. */
export function createServerApp(options: CreateServerAppOptions = {}) {
  const envFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
  if (options.loadDotEnv !== false && process.env.VERCEL !== "1" && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const isE2eMode = process.env.E2E_TEST_MODE === "1";
  if (isE2eMode && process.env.NODE_ENV !== "test") {
    throw new Error("Refusing to boot E2E test harness outside NODE_ENV=test.");
  }

  const config = loadConfig(process.env);
  const e2eMailer = isE2eMode ? createCaptureMailer() : undefined;
  const authBoot = loadAuthBoot({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL?.trim() || resolveDatabaseUrl(),
    ...(isE2eMode
      ? {
          NODE_ENV: "test",
          TURNSTILE_SECRET_KEY: "",
          BETTER_AUTH_SECRET:
            process.env.BETTER_AUTH_SECRET?.trim() || "e2e-test-secret-".padEnd(40, "0"),
          BETTER_AUTH_URL: process.env.BETTER_AUTH_URL?.trim() || `http://localhost:${config.port}`,
          WEB_ORIGINS:
            process.env.WEB_ORIGINS?.trim() || "http://localhost:5173,http://127.0.0.1:5173",
          PASSKEY_RP_ID: process.env.PASSKEY_RP_ID?.trim() || "localhost",
          PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN?.trim() || "http://localhost:5173",
        }
      : {}),
  });
  const auth = authBoot
    ? createAuth({
        db: prisma,
        boot: authBoot,
        ...(e2eMailer ? { mailer: e2eMailer, otpMax: 100 } : {}),
      })
    : undefined;
  const { orchestrator: runtimeOrchestrator, billingProvider } = createRuntime(config);
  const orchestrator = isE2eMode ? createE2eOrchestrator() : runtimeOrchestrator;
  const webOrigins = isE2eMode
    ? [...new Set([...config.webOrigins, "http://127.0.0.1:5173", "http://localhost:5173"])]
    : config.webOrigins;

  const errorTracker = createPostHogErrorTracker({
    apiKey: isE2eMode ? undefined : config.posthogKey,
    host: config.posthogHost,
  });

  const app = createApp({
    orchestrator,
    billingProvider,
    webOrigins,
    trustProxy: config.trustProxy,
    allowRequest: createRateLimiter(isE2eMode ? 500 : config.rateLimitPerMinute, 60_000),
    auth,
    oauthProviders: authBoot
      ? {
          google: Boolean(authBoot.googleClientId && authBoot.googleClientSecret),
          github: Boolean(authBoot.githubClientId && authBoot.githubClientSecret),
        }
      : undefined,
    errorTracker,
    ...(e2eMailer ? { e2eHarness: { mailer: e2eMailer } } : {}),
  });

  return { app, config, errorTracker, isE2eMode };
}
