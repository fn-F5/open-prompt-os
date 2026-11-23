import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRuntime } from "./runtime.js";
import {
  createDefaultFeedbackMailer,
  createResendFeedbackMailer,
} from "./services/feedback-mailer.js";
import { submitFeedback } from "./services/feedback-service.js";

const mockTx = {
  userFeedback: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  space: {
    upsert: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
  },
  spaceMember: {
    upsert: vi.fn(),
  },
};

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock("@open-prompt-os/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@open-prompt-os/db")>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      user: {
        ...actual.prisma.user,
        findUnique: (...args: unknown[]) => mockPrisma.user.findUnique(...args),
        updateMany: (...args: unknown[]) => mockPrisma.user.updateMany(...args),
      },
    },
    runAsTenant: vi.fn(async (_ctx: unknown, fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
    ),
    runAsSystem: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  };
});

import { createApp } from "./app.js";

function buildTestApp() {
  const config = loadConfig({});
  const orchestrator: PromptOrchestrator = createRuntime(config).orchestrator;
  return createApp({
    orchestrator,
    webOrigins: ["http://localhost:5173"],
    trustProxy: false,
    allowRequest: createRateLimiter(500, 60_000),
    log: () => {},
  });
}

describe("Feedback & Signup Attribution API (unit + HTTP contract)", () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("POST /rpc/feedback/submit & /rpc/feedback/listMine", () => {
    it("allows anonymous guests to submit feature requests anytime", async () => {
      const now = new Date("2026-11-17T10:00:00.000Z");
      mockTx.userFeedback.create.mockResolvedValueOnce({
        id: "fbk_guest_1",
        kind: "feature_request",
        title: "Add keyboard shortcuts",
        message: "Please add Cmd+K quick switch for templates.",
        status: "open",
        pagePath: "/templates",
        createdAt: now,
      });

      const res = await app.request("http://localhost/rpc/feedback/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-client-key": "guest_feedback_client",
        },
        body: JSON.stringify({
          json: {
            kind: "feature_request",
            title: "  Add keyboard shortcuts  ",
            message: "  Please add Cmd+K quick switch for templates.  ",
            contactEmail: "guest@example.com",
            pagePath: "/templates",
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        json: { id: string; kind: string; title: string; message: string; status: string };
      };
      expect(body.json).toMatchObject({
        id: "fbk_guest_1",
        kind: "feature_request",
        title: "Add keyboard shortcuts",
        message: "Please add Cmd+K quick switch for templates.",
        status: "open",
      });

      expect(mockTx.userFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          spaceId: null,
          userId: null,
          clientKey: expect.any(String),
          kind: "feature_request",
          title: "Add keyboard shortcuts",
          message: "Please add Cmd+K quick switch for templates.",
          contactEmail: "guest@example.com",
          pagePath: "/templates",
          status: "open",
        }),
      });
    });

    it("associates authenticated feedback with userId and spaceId and omits clientKey", async () => {
      const now = new Date("2026-11-17T10:05:00.000Z");
      mockTx.userFeedback.create.mockResolvedValueOnce({
        id: "fbk_auth_1",
        kind: "general_feedback",
        title: null,
        message: "Really enjoying the CO-STAR compiler!",
        status: "open",
        pagePath: "/",
        createdAt: now,
      });

      const res = await app.request("http://localhost/rpc/feedback/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "usr_123",
          "x-space-id": "spc_123",
        },
        body: JSON.stringify({
          json: {
            kind: "general_feedback",
            title: "   ",
            message: "Really enjoying the CO-STAR compiler!",
            contactEmail: "",
            pagePath: "/",
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockTx.userFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          spaceId: "spc_123",
          userId: "usr_123",
          clientKey: null,
          kind: "general_feedback",
          title: null,
          contactEmail: null,
          pagePath: "/",
        }),
      });
    });

    it("rejects too-short feedback message and invalid contactEmail with 400 VALIDATION_ERROR", async () => {
      const shortRes = await app.request("http://localhost/rpc/feedback/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            kind: "bug_report",
            message: "hi",
          },
        }),
      });
      expect(shortRes.status).toBe(400);
      expect(await shortRes.text()).toContain("VALIDATION_ERROR");

      const badEmailRes = await app.request("http://localhost/rpc/feedback/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            kind: "feature_request",
            message: "Valid message with enough length.",
            contactEmail: "not-an-email",
          },
        }),
      });
      expect(badEmailRes.status).toBe(400);
      expect(await badEmailRes.text()).toContain("VALIDATION_ERROR");
      expect(mockTx.userFeedback.create).not.toHaveBeenCalled();
    });

    it("lists only authenticated user feedback and returns [] for anonymous guests", async () => {
      const guestRes = await app.request("http://localhost/rpc/feedback/listMine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      });
      expect(guestRes.status).toBe(200);
      expect(await guestRes.json()).toEqual({ json: [] });
      expect(mockTx.userFeedback.findMany).not.toHaveBeenCalled();

      mockTx.userFeedback.findMany.mockResolvedValueOnce([
        {
          id: "fbk_1",
          kind: "feature_request",
          title: "Dark mode contrast",
          message: "Increase contrast on secondary labels.",
          status: "planned",
          pagePath: "/library",
          createdAt: new Date("2026-11-17T09:00:00.000Z"),
        },
      ]);

      const authRes = await app.request("http://localhost/rpc/feedback/listMine", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "usr_123",
          "x-space-id": "spc_123",
        },
        body: JSON.stringify({ json: { limit: 10 } }),
      });

      expect(authRes.status).toBe(200);
      const body = (await authRes.json()) as { json: Array<{ id: string; status: string }> };
      expect(body.json).toHaveLength(1);
      expect(body.json[0]).toMatchObject({ id: "fbk_1", status: "planned" });
      expect(mockTx.userFeedback.findMany).toHaveBeenCalledWith({
        where: { spaceId: "spc_123", userId: "usr_123" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    });
  });

  describe("POST /rpc/userPreferences/recordSignupAttribution", () => {
    it("returns recorded:false for unauthenticated guests", async () => {
      const res = await app.request(
        "http://localhost/rpc/userPreferences/recordSignupAttribution",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            json: { referralSource: "search_engine" },
          }),
        },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        json: { recorded: false, referralSource: null },
      });
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("records signup attribution atomically when referralSource is null, and enforces write-once", async () => {
      // First signup attribution succeeds
      mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
      const firstRes = await app.request(
        "http://localhost/rpc/userPreferences/recordSignupAttribution",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "usr_new",
            "x-space-id": "spc_new",
          },
          body: JSON.stringify({
            json: {
              referralSource: "other",
              referralDetail: "  Podcast interview  ",
            },
          }),
        },
      );
      expect(firstRes.status).toBe(200);
      expect(await firstRes.json()).toEqual({
        json: { recorded: true, referralSource: "other" },
      });
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: "usr_new", referralSource: null },
        data: {
          referralSource: "other",
          referralDetail: "Podcast interview",
          referredAt: expect.any(Date),
        },
      });

      // Second attempt does not overwrite
      mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.user.findUnique.mockResolvedValueOnce({ referralSource: "other" });
      const secondRes = await app.request(
        "http://localhost/rpc/userPreferences/recordSignupAttribution",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "usr_new",
            "x-space-id": "spc_new",
          },
          body: JSON.stringify({
            json: { referralSource: "social_media" },
          }),
        },
      );
      expect(secondRes.status).toBe(200);
      expect(await secondRes.json()).toEqual({
        json: { recorded: false, referralSource: "other" },
      });
    });

    it("rejects invalid referralSource enum values with 400 VALIDATION_ERROR", async () => {
      const res = await app.request(
        "http://localhost/rpc/userPreferences/recordSignupAttribution",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "usr_new",
            "x-space-id": "spc_new",
          },
          body: JSON.stringify({
            json: { referralSource: "invalid_channel" },
          }),
        },
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("VALIDATION_ERROR");
    });
  });

  describe("POST /api/auth/signup-status", () => {
    it("returns a constant response without querying users and validates email input", async () => {
      const newRes = await app.request("http://localhost/api/auth/signup-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "  NewUser@Example.COM " }),
      });
      expect(newRes.status).toBe(200);
      expect(await newRes.json()).toEqual({ isNewUser: null });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();

      const existingRes = await app.request("http://localhost/api/auth/signup-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "existing@example.com" }),
      });
      expect(existingRes.status).toBe(200);
      expect(await existingRes.json()).toEqual({ isNewUser: null });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();

      const invalidEmailRes = await app.request("http://localhost/api/auth/signup-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });
      expect(invalidEmailRes.status).toBe(400);

      const invalidJsonRes = await app.request("http://localhost/api/auth/signup-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad-json",
      });
      expect(invalidJsonRes.status).toBe(400);
    });
  });

  describe("Feedback Email Notifications (Resend & submitFeedback)", () => {
    it("sends HTML-escaped feedback email via Resend with reply_to", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }))
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      const mailer = createResendFeedbackMailer({
        apiKey: "re_test_key",
        from: "OpenPrompt OS <login@mail.openpromptos.com>",
        to: "hello@openpromptos.com",
      });

      await mailer.send({
        id: "fbk_1",
        kind: "feature_request",
        title: "Support <script> tags safely",
        message: "Allow exporting <b>prompts</b>",
        contactEmail: "requester@example.com",
        pagePath: "/library",
        createdAt: "2026-11-17T12:00:00.000Z",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(init.headers).toMatchObject({ authorization: "Bearer re_test_key" });
      const payload = JSON.parse(String(init.body)) as {
        from: string;
        to: string[];
        reply_to: string;
        subject: string;
        html: string;
      };
      expect(payload.from).toBe("OpenPrompt OS <login@mail.openpromptos.com>");
      expect(payload.to).toEqual(["hello@openpromptos.com"]);
      expect(payload.reply_to).toBe("requester@example.com");
      expect(payload.subject).toBe(
        "[OpenPrompt OS · Feature Request] Support <script> tags safely",
      );
      expect(payload.html).toContain("&lt;script&gt;");
      expect(payload.html).not.toContain("<script>");

      await expect(
        mailer.send({
          id: "fbk_2",
          kind: "bug_report",
          title: null,
          message: "Fail test",
          contactEmail: null,
          pagePath: null,
          createdAt: "2026-11-17T12:00:00.000Z",
        }),
      ).rejects.toThrow("Resend feedback email failed (401)");
    });

    it("selects Resend when MAIL_PROVIDER=RESEND (case-insensitive) and notifies on submitFeedback", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "em_2" }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const envMailer = createDefaultFeedbackMailer({
        NODE_ENV: "development",
        MAIL_PROVIDER: "RESEND",
        RESEND_API_KEY: "re_dev_key",
        MAIL_FROM: "OpenPrompt OS <login@mail.openpromptos.com>",
        MAIL_REPLY_TO: "hello@openpromptos.com",
      });

      mockTx.userFeedback.create.mockResolvedValueOnce({
        id: "fbk_mail_1",
        kind: "feature_request",
        title: "Roadmap idea",
        message: "Please add prompt diff view.",
        status: "open",
        pagePath: "/",
        createdAt: new Date("2026-11-17T12:00:00.000Z"),
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        email: "ada@example.com",
        name: "Ada",
      });

      const item = await submitFeedback(
        {
          clientKey: "127.0.0.1",
          hashedClientKey: "hash_1",
          userId: "usr_ada",
          spaceId: "spc_ada",
        },
        {
          kind: "feature_request",
          title: "Roadmap idea",
          message: "Please add prompt diff view.",
          pagePath: "/",
        },
        { mailer: envMailer },
      );

      expect(item.id).toBe("fbk_mail_1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const sentBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
        reply_to: string;
        text: string;
      };
      expect(sentBody.reply_to).toBe("ada@example.com");
      expect(sentBody.text).toContain("Ada <ada@example.com>");
    });
  });
});
