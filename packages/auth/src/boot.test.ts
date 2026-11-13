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
  });

  it("does not select a database when local development has none", () => {
    expect(
      loadAuthBoot({
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "b".repeat(32),
      }),
    ).toBeNull();
  });
});
