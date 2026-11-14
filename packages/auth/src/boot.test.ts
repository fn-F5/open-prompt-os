import { describe, expect, it } from "vitest";
import { loadAuthBoot } from "./boot.js";

const production = {
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "a".repeat(40),
  BETTER_AUTH_URL: "https://openpromptos.com",
  WEB_ORIGINS: "https://openpromptos.com",
  DATABASE_URL: "postgresql://app@db.internal:5432/open_prompt_os",
  RESEND_API_KEY: "re_test",
  PASSKEY_RP_ID: "openpromptos.com",
};

const baseTestEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://app@localhost:5432/open_prompt_os",
  BETTER_AUTH_SECRET: "b".repeat(32),
};

describe("production boot", () => {
  it("accepts a complete production environment and applies defaults", () => {
    const boot = loadAuthBoot(production);
    expect(boot).toEqual({
      nodeEnv: "production",
      databaseUrl: "postgresql://app@db.internal:5432/open_prompt_os",
      secret: "a".repeat(40),
      baseURL: "https://openpromptos.com",
      trustedOrigins: ["https://openpromptos.com"],
      rpID: "openpromptos.com",
      passkeyOrigin: "https://openpromptos.com",
      resendApiKey: "re_test",
      mailProvider: undefined,
      mailFrom: "OpenPrompt OS <login@mail.openpromptos.com>",
      mailReplyTo: "hello@openpromptos.com",
      googleClientId: undefined,
      googleClientSecret: undefined,
      githubClientId: undefined,
      githubClientSecret: undefined,
      turnstileSecretKey: undefined,
      trustProxy: false,
      secureCookies: true,
    });
  });

  it("refuses to start when NODE_ENV is unset or invalid", () => {
    expect(() => loadAuthBoot({})).toThrow(/Set NODE_ENV to development, test, or production/);
    expect(() => loadAuthBoot({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("refuses production without required keys or with whitespace-only keys", () => {
    expect(() => loadAuthBoot({ ...production, BETTER_AUTH_SECRET: undefined })).toThrow(
      "Refusing to start. BETTER_AUTH_SECRET is required.",
    );
    expect(() => loadAuthBoot({ ...production, BETTER_AUTH_SECRET: "   " })).toThrow(
      "Refusing to start. BETTER_AUTH_SECRET is required.",
    );
    expect(() => loadAuthBoot({ ...production, RESEND_API_KEY: "" })).toThrow(
      "Refusing to start. RESEND_API_KEY is required.",
    );
    expect(() => loadAuthBoot({ ...production, DATABASE_URL: "   " })).toThrow(
      "Refusing to start. DATABASE_URL is required.",
    );
  });

  it("validates production secret length, development keyword, origins, DB protocol, and RP ID", () => {
    expect(() => loadAuthBoot({ ...production, BETTER_AUTH_SECRET: "a".repeat(31) })).toThrow(
      "Refusing to start. BETTER_AUTH_SECRET is not a production secret.",
    );
    expect(loadAuthBoot({ ...production, BETTER_AUTH_SECRET: "a".repeat(32) })?.secret.length).toBe(
      32,
    );
    expect(() =>
      loadAuthBoot({ ...production, BETTER_AUTH_SECRET: `DEVELOPMENT_${"x".repeat(25)}` }),
    ).toThrow("Refusing to start. BETTER_AUTH_SECRET is not a production secret.");
    expect(() => loadAuthBoot({ ...production, BETTER_AUTH_URL: "http://localhost:3001" })).toThrow(
      "Refusing to start. BETTER_AUTH_URL must be https://openpromptos.com.",
    );
    expect(() => loadAuthBoot({ ...production, WEB_ORIGINS: "http://localhost:5173" })).toThrow(
      "Refusing to start. WEB_ORIGINS must be https://openpromptos.com.",
    );
    expect(() => loadAuthBoot({ ...production, DATABASE_URL: "mysql://user@host/db" })).toThrow(
      "Refusing to start. DATABASE_URL must be PostgreSQL.",
    );
    expect(() => loadAuthBoot({ ...production, PASSKEY_RP_ID: "localhost" })).toThrow(
      "Refusing to start. PASSKEY_RP_ID must be openpromptos.com.",
    );
  });

  it("does not select a database when local development has none or whitespace", () => {
    expect(
      loadAuthBoot({
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "b".repeat(32),
      }),
    ).toBeNull();
    expect(
      loadAuthBoot({
        NODE_ENV: "development",
        DATABASE_URL: "   ",
        BETTER_AUTH_SECRET: "b".repeat(32),
      }),
    ).toBeNull();
  });

  it("enforces secret length >= 32 in non-production", () => {
    expect(() => loadAuthBoot({ ...baseTestEnv, BETTER_AUTH_SECRET: undefined })).toThrow(
      "Refusing to start. BETTER_AUTH_SECRET must be at least 32 characters.",
    );
    expect(() =>
      loadAuthBoot({ ...baseTestEnv, BETTER_AUTH_SECRET: `  ${"b".repeat(31)}  ` }),
    ).toThrow("Refusing to start. BETTER_AUTH_SECRET must be at least 32 characters.");
    expect(loadAuthBoot(baseTestEnv)?.secret).toBe("b".repeat(32));
  });

  it("parses defaults, trims values, splits origins, and computes cookie/proxy flags", () => {
    const defaulted = loadAuthBoot(baseTestEnv);
    expect(defaulted).toMatchObject({
      nodeEnv: "test",
      baseURL: "http://localhost:3001",
      trustedOrigins: ["http://localhost:5173"],
      rpID: "localhost",
      passkeyOrigin: "http://localhost:5173",
      trustProxy: false,
      secureCookies: false,
    });

    const customized = loadAuthBoot({
      NODE_ENV: "development",
      DATABASE_URL: "  postgresql://app@localhost:5432/db  ",
      BETTER_AUTH_SECRET: `  ${"c".repeat(32)}  `,
      BETTER_AUTH_URL: "https://auth.example.com/",
      WEB_ORIGINS: " https://one.example.com , , https://two.example.com ",
      PASSKEY_RP_ID: "  auth.example.com  ",
      PASSKEY_ORIGIN: "  https://passkey.example.com  ",
      RESEND_API_KEY: "  re_dev_123  ",
      MAIL_PROVIDER: "  ReSeNd  ",
      MAIL_FROM: "  Sender <noreply@example.com>  ",
      MAIL_REPLY_TO: "  support@example.com  ",
      GOOGLE_CLIENT_ID: "  g-id  ",
      GOOGLE_CLIENT_SECRET: "  g-sec  ",
      GITHUB_CLIENT_ID: "  gh-id  ",
      GITHUB_CLIENT_SECRET: "  gh-sec  ",
      TURNSTILE_SECRET_KEY: " 1x0000000000000000000000000000000AA ",
      TRUST_PROXY: "true",
    });

    expect(customized).toEqual({
      nodeEnv: "development",
      databaseUrl: "postgresql://app@localhost:5432/db",
      secret: "c".repeat(32),
      baseURL: "https://auth.example.com",
      trustedOrigins: ["https://one.example.com", "https://two.example.com"],
      rpID: "auth.example.com",
      passkeyOrigin: "https://passkey.example.com",
      resendApiKey: "re_dev_123",
      mailProvider: "resend",
      mailFrom: "Sender <noreply@example.com>",
      mailReplyTo: "support@example.com",
      googleClientId: "g-id",
      googleClientSecret: "g-sec",
      githubClientId: "gh-id",
      githubClientSecret: "gh-sec",
      turnstileSecretKey: "1x0000000000000000000000000000000AA",
      trustProxy: true,
      secureCookies: true,
    });
  });

  it("falls back passkeyOrigin to baseURL when WEB_ORIGINS is empty and ignores whitespace optionals", () => {
    const boot = loadAuthBoot({
      ...baseTestEnv,
      BETTER_AUTH_URL: "https://fallback.example.com/",
      WEB_ORIGINS: " , ",
      PASSKEY_RP_ID: "   ",
      PASSKEY_ORIGIN: "   ",
      RESEND_API_KEY: "   ",
      MAIL_PROVIDER: "   ",
      MAIL_FROM: "   ",
      MAIL_REPLY_TO: "   ",
      GOOGLE_CLIENT_ID: "   ",
      GOOGLE_CLIENT_SECRET: "   ",
      GITHUB_CLIENT_ID: "   ",
      GITHUB_CLIENT_SECRET: "   ",
      TURNSTILE_SECRET_KEY: "   ",
      TRUST_PROXY: "false",
    });

    expect(boot).toMatchObject({
      baseURL: "https://fallback.example.com",
      trustedOrigins: [],
      rpID: "localhost",
      passkeyOrigin: "https://fallback.example.com",
      resendApiKey: undefined,
      mailProvider: undefined,
      mailFrom: "OpenPrompt OS <login@mail.openpromptos.com>",
      mailReplyTo: "hello@openpromptos.com",
      googleClientId: undefined,
      googleClientSecret: undefined,
      githubClientId: undefined,
      githubClientSecret: undefined,
      turnstileSecretKey: undefined,
      trustProxy: false,
      secureCookies: true,
    });
  });
});
