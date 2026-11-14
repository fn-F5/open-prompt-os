import type { PrismaClient } from "@open-prompt-os/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAuthBoot } from "./boot.js";
import { createAuth } from "./create-auth.js";
import { createCaptureMailer } from "./mailer.js";

function buildBoot(turnstileSecretKey?: string) {
  const boot = loadAuthBoot({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://app@localhost:5432/open_prompt_os",
    BETTER_AUTH_SECRET: "c".repeat(40),
    BETTER_AUTH_URL: "http://localhost:3001",
    WEB_ORIGINS: "http://localhost:5173",
    PASSKEY_RP_ID: "localhost",
    PASSKEY_ORIGIN: "http://localhost:5173",
    ...(turnstileSecretKey ? { TURNSTILE_SECRET_KEY: turnstileSecretKey } : {}),
  });
  if (!boot) throw new Error("Expected test auth boot config.");
  return boot;
}

describe("Cloudflare Turnstile plugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects send-verification-otp when turnstileSecretKey is set and header is missing", async () => {
    const auth = createAuth({
      db: {} as PrismaClient,
      boot: buildBoot("turnstile-secret-test"),
      mailer: createCaptureMailer(),
    });

    const response = await auth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
        },
        body: JSON.stringify({ email: "ada@example.com", type: "sign-in" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "MISSING_RESPONSE" });
  });

  it("verifies token against Cloudflare Turnstile siteverify and blocks failed checks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const auth = createAuth({
      db: {} as PrismaClient,
      boot: buildBoot("turnstile-secret-test"),
      mailer: createCaptureMailer(),
    });

    const response = await auth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-captcha-response": "bad-token",
        },
        body: JSON.stringify({ email: "ada@example.com", type: "sign-in" }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "VERIFICATION_FAILED" });
  });

  it("does not enforce Turnstile on non-configured endpoints like get-session", async () => {
    const auth = createAuth({
      db: {} as PrismaClient,
      boot: buildBoot("turnstile-secret-test"),
      mailer: createCaptureMailer(),
    });

    const response = await auth.handler(
      new Request("http://localhost:3001/api/auth/ok", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
  });
});
