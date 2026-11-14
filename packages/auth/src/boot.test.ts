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

describe("production boot", () => {
  it("accepts a complete production environment", () => {
    const boot = loadAuthBoot(production);
    expect(boot?.baseURL).toBe("https://openpromptos.com");
    expect(boot?.secureCookies).toBe(true);
    expect(boot?.rpID).toBe("openpromptos.com");
  });

  it("refuses to start when NODE_ENV is unset", () => {
    expect(() => loadAuthBoot({})).toThrow(/NODE_ENV/);
  });

  it("refuses production without the mail key", () => {
    expect(() => loadAuthBoot({ ...production, RESEND_API_KEY: "" })).toThrow(/RESEND_API_KEY/);
  });

  it("refuses a short secret and a non-production URL", () => {
    expect(() => loadAuthBoot({ ...production, BETTER_AUTH_SECRET: "short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() => loadAuthBoot({ ...production, BETTER_AUTH_URL: "http://localhost:3001" })).toThrow(
      /BETTER_AUTH_URL/,
    );
    expect(() => loadAuthBoot({ ...production, WEB_ORIGINS: "http://localhost:5173" })).toThrow(
      /WEB_ORIGINS/,
    );
    expect(() => loadAuthBoot({ ...production, DATABASE_URL: "mysql://db" })).toThrow(
      /DATABASE_URL must be PostgreSQL/,
    );
    expect(() => loadAuthBoot({ ...production, PASSKEY_RP_ID: "localhost" })).toThrow(
      /PASSKEY_RP_ID/,
    );
  });

  it("does not select a database when local development has none", () => {
    expect(
      loadAuthBoot({
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "b".repeat(32),
      }),
    ).toBeNull();
  });

  it("parses development boot with OAuth credentials, multiple origins, and trailing slash normalization", () => {
    const boot = loadAuthBoot({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://app@localhost:5433/open_prompt_os",
      BETTER_AUTH_SECRET: "b".repeat(32),
      BETTER_AUTH_URL: "http://localhost:5173/",
      WEB_ORIGINS: "http://localhost:5173, http://localhost:5174",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
    });

    expect(boot).not.toBeNull();
    expect(boot?.baseURL).toBe("http://localhost:5173");
    expect(boot?.secureCookies).toBe(false);
    expect(boot?.trustedOrigins).toEqual(["http://localhost:5173", "http://localhost:5174"]);
    expect(boot?.rpID).toBe("localhost");
    expect(boot?.passkeyOrigin).toBe("http://localhost:5173");
    expect(boot?.googleClientId).toBe("google-id");
    expect(boot?.githubClientId).toBe("github-id");
  });

  it("refuses development boot when DATABASE_URL is set but secret is too short", () => {
    expect(() =>
      loadAuthBoot({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://app@localhost:5433/open_prompt_os",
        BETTER_AUTH_SECRET: "too-short",
      }),
    ).toThrow(/BETTER_AUTH_SECRET must be at least 32 characters/);
  });
});
