import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { loadAuthBoot } from "./boot.js";
import { createAuth } from "./create-auth.js";
import { createCaptureMailer } from "./mailer.js";

const prodBoot = loadAuthBoot({
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "a".repeat(40),
  BETTER_AUTH_URL: "https://openpromptos.com",
  WEB_ORIGINS: "https://openpromptos.com",
  DATABASE_URL: "postgresql://app@db.internal:5432/open_prompt_os",
  RESEND_API_KEY: "re_test_key",
  PASSKEY_RP_ID: "openpromptos.com",
});

const devBoot = loadAuthBoot({
  NODE_ENV: "development",
  BETTER_AUTH_SECRET: "b".repeat(40),
  DATABASE_URL: "postgresql://app@localhost:5433/open_prompt_os",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-id",
  GITHUB_CLIENT_SECRET: "github-secret",
  TRUST_PROXY: "true",
});

describe("createAuth", () => {
  it("refuses production initialization without a Resend API key", () => {
    if (!prodBoot) throw new Error("Expected prodBoot to be defined");
    expect(() =>
      createAuth({
        db: {} as PrismaClient,
        boot: { ...prodBoot, resendApiKey: undefined },
      }),
    ).toThrow(/RESEND_API_KEY is required in production/);
  });

  it("initializes with capture mailer and social providers without sending real mail", () => {
    if (!devBoot) throw new Error("Expected devBoot to be defined");
    const capture = createCaptureMailer();
    const auth = createAuth({
      db: {} as PrismaClient,
      boot: devBoot,
      mailer: capture,
      otpMax: 7,
    });
    expect(typeof auth.handler).toBe("function");
    expect(typeof auth.api.getSession).toBe("function");
    expect(capture.take("nobody@example.com")).toBeUndefined();
  });

  it("initializes with default local/resend mail selection based on boot config", () => {
    if (!devBoot || !prodBoot) throw new Error("Expected boot configs to be defined");
    const localAuth = createAuth({
      db: {} as PrismaClient,
      boot: { ...devBoot, googleClientId: undefined, githubClientId: undefined },
    });
    const prodAuth = createAuth({
      db: {} as PrismaClient,
      boot: prodBoot,
    });
    expect(typeof localAuth.handler).toBe("function");
    expect(typeof prodAuth.handler).toBe("function");
  });
});
