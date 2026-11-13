import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import { createAuth, createCaptureMailer, loadAuthBoot } from "@open-prompt-os/auth";
import { prisma, resolveDatabaseUrl, runAsSystem, runAsTenant } from "@open-prompt-os/db";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createRateLimiter } from "./rate-limit.js";

const orchestrator: PromptOrchestrator = {
  async compose(input) {
    return {
      interactionId: input.interactionId,
      compiledPrompt: "compiled",
      detectedVariables: [],
      followUpQuestions: [],
      providerId: "rule-synthesizer",
      modelId: "rule",
      latencyMs: 1,
      healedFromFailure: false,
      remainingDailyPrompts: null,
      requestId: "req",
    };
  },
  composeStream() {
    throw new Error("unused");
  },
  async refine() {
    throw new Error("unused");
  },
  healthSnapshot: () => [],
};

describe("Better Auth integration", () => {
  const mailer = createCaptureMailer();
  const testEmail = `ada_${Date.now()}@example.com`;
  let createdUserId: string | undefined;
  let createdSpaceId: string | undefined;

  const boot = loadAuthBoot({
    NODE_ENV: "test",
    DATABASE_URL: resolveDatabaseUrl(),
    BETTER_AUTH_SECRET: "c".repeat(40),
    BETTER_AUTH_URL: "http://localhost:3001",
    WEB_ORIGINS: "http://localhost:5173",
    PASSKEY_RP_ID: "localhost",
    PASSKEY_ORIGIN: "http://localhost:5173",
  });
  if (!boot) throw new Error("Expected a test auth configuration.");

  const auth = createAuth({ db: prisma, boot, mailer, otpMax: 20 });
  const app = createApp({
    orchestrator,
    webOrigins: ["http://localhost:5173"],
    trustProxy: false,
    allowRequest: createRateLimiter(100, 60_000),
    auth,
    oauthProviders: { google: false, github: false },
    log: () => {},
  });

  afterAll(async () => {
    try {
      if (createdSpaceId) {
        await runAsSystem(async (tx) => {
          await tx.savedPrompt.deleteMany({ where: { spaceId: createdSpaceId } });
          await tx.promptGeneration.deleteMany({ where: { spaceId: createdSpaceId } });
          await tx.usageCounter.deleteMany({ where: { spaceId: createdSpaceId } });
          await tx.spaceMember.deleteMany({ where: { spaceId: createdSpaceId } });
        });
        await prisma.space.deleteMany({ where: { id: createdSpaceId } });
      }
      if (createdUserId) {
        await prisma.session.deleteMany({ where: { userId: createdUserId } });
        await prisma.account.deleteMany({ where: { userId: createdUserId } });
        await prisma.passkey.deleteMany({ where: { userId: createdUserId } });
        await prisma.user.deleteMany({ where: { id: createdUserId } });
      }
      await prisma.verification.deleteMany({ where: { identifier: { contains: testEmail } } });
    } catch {
      // ignore cleanup errors
    }
  });

  it("reports configured OAuth providers", async () => {
    const res = await app.request("http://localhost/api/auth/providers");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ google: false, github: false });
  });

  it("creates a workspace from a captured OTP code, rejects replay, and authenticates oRPC", async () => {
    const sent = await app.request("http://localhost/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email: testEmail, type: "sign-in" }),
    });
    expect(sent.status).toBe(200);
    const otp = mailer.take(testEmail);
    expect(otp).toMatch(/^\d{6}$/);
    expect(await sent.text()).not.toContain(otp);

    const verified = await app.request("http://localhost/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email: testEmail, otp, name: "Ada" }),
    });
    expect(verified.status).toBe(200);

    const rawCookies = verified.headers.getSetCookie?.() ?? [
      verified.headers.get("set-cookie") ?? "",
    ];
    const joinedSetCookie = rawCookies.join("; ");
    expect(joinedSetCookie.toLowerCase()).toContain("httponly");
    expect(joinedSetCookie).not.toContain(otp ?? "");
    const cookie = rawCookies
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
    expect(cookie).toContain("better-auth.session_token=");

    const sessionRes = await app.request("http://localhost/api/auth/get-session", {
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(sessionRes.status).toBe(200);
    const body = (await sessionRes.json()) as {
      user?: { id?: string; spaceId?: string; plan?: string; hasPasskey?: boolean; email?: string };
    } | null;
    expect(body?.user?.email).toBe(testEmail);
    expect(body?.user?.plan).toBe("free");
    expect(body?.user?.hasPasskey).toBe(false);
    expect(body?.user?.spaceId).toBeTruthy();

    createdUserId = body?.user?.id;
    createdSpaceId = body?.user?.spaceId;

    const space = await prisma.space.findUnique({ where: { id: createdSpaceId } });
    expect(space?.plan).toBe("free");

    // OTP cannot be replayed
    const replay = await app.request("http://localhost/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email: testEmail, otp, name: "Ada" }),
    });
    expect(replay.status).toBeGreaterThanOrEqual(400);

    // Unauthenticated save fails with UNAUTHORIZED / 401
    const signedOut = await app.request("http://localhost/rpc/prompts/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        json: {
          title: "Hidden",
          rawInput: "raw",
          compiledPrompt: "compiled",
          mode: "text",
          framework: "costar",
          modelId: "rule",
          category: "General",
          tags: [],
        },
      }),
    });
    expect(signedOut.status).toBeGreaterThanOrEqual(400);

    // Authenticated save via Better Auth session cookie succeeds and respects RLS
    const saved = await app.request("http://localhost/rpc/prompts/save", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        json: {
          title: "Saved via Better Auth",
          rawInput: "raw prompt",
          compiledPrompt: "compiled prompt",
          mode: "text",
          framework: "costar",
          modelId: "rule",
          category: "General",
          tags: ["auth"],
        },
      }),
    });
    expect(saved.status).toBe(200);

    const visible = await runAsTenant({ spaceId: createdSpaceId }, (tx) =>
      tx.savedPrompt.findMany({ where: { spaceId: createdSpaceId } }),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]?.title).toBe("Saved via Better Auth");
  });

  it("ignores spoofed x-user-id and x-space-id headers when NODE_ENV is production", async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const spoofed = await app.request("http://localhost/rpc/prompts/save", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "usr_spoofed",
          "x-space-id": "spc_spoofed",
        },
        body: JSON.stringify({
          json: {
            title: "Spoofed",
            rawInput: "raw",
            compiledPrompt: "compiled",
            mode: "text",
            framework: "costar",
            modelId: "rule",
            category: "General",
            tags: [],
          },
        }),
      });
      expect(spoofed.status).toBe(401);
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });
});
