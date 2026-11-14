import { prisma, runAsSystem } from "@open-prompt-os/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRuntime } from "./runtime.js";

function buildTestApp() {
  const config = loadConfig({});
  const { orchestrator } = createRuntime(config);
  return createApp({
    orchestrator,
    webOrigins: ["http://localhost:5173"],
    trustProxy: false,
    allowRequest: createRateLimiter(500, 60_000),
    log: () => {},
  });
}

describe("API Routes & Database Integration", () => {
  const app = buildTestApp();
  const testUserId = `usr_test_${Date.now()}`;
  const testSpaceId = `spc_test_${Date.now()}`;
  const testShareId = `shr_test_${Date.now()}`;

  beforeAll(async () => {
    // Seed test user and space for tenancy tests
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@example.com`,
        name: "Test User",
        preferences: {
          dismissedHotspots: { "spot-initial": "2026-11-12T10:00:00Z" },
          completedTours: { "tour-composer": "2026-11-12T10:05:00Z" },
        },
      },
    });

    await prisma.space.create({
      data: {
        id: testSpaceId,
        name: "Test Integration Space",
        plan: "free",
      },
    });

    await runAsSystem(async (tx) => {
      await tx.spaceMember.create({
        data: {
          spaceId: testSpaceId,
          userId: testUserId,
          role: "owner",
        },
      });

      // Seed a saved prompt (shared)
      await tx.savedPrompt.create({
        data: {
          id: `prm_shared_${Date.now()}`,
          spaceId: testSpaceId,
          authorId: testUserId,
          title: "Test Shared Architecture Prompt",
          rawInput: "Review architecture for distributed scale.",
          compiledPrompt: "ROLE: Architect\nEvaluate system.",
          mode: "text",
          framework: "costar",
          modelId: "gpt-4.1",
          category: "Engineering",
          tags: ["scale", "rfc"],
          detectedVariables: ["Scale_Target"],
          isShared: true,
          shareId: testShareId,
        },
      });
    });
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await runAsSystem(async (tx) => {
        await tx.billingAuditEvent.deleteMany({ where: { spaceId: testSpaceId } });
        await tx.subscription.deleteMany({ where: { spaceId: testSpaceId } });
        await tx.savedPrompt.deleteMany({ where: { spaceId: testSpaceId } });
        await tx.promptGeneration.deleteMany({ where: { spaceId: testSpaceId } });
        await tx.usageCounter.deleteMany({ where: { spaceId: testSpaceId } });
        await tx.spaceMember.deleteMany({ where: { spaceId: testSpaceId } });
      });
      await prisma.space.delete({ where: { id: testSpaceId } });
      await prisma.user.delete({ where: { id: testUserId } });
    } catch {
      // Ignore teardown errors
    }
  });

  describe("System & Health", () => {
    it("GET /healthz returns ok", async () => {
      const res = await app.request("http://localhost/healthz");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true });
    });

    it("POST /rpc/health returns system status and active provider", async () => {
      const res = await app.request("http://localhost/rpc/health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const { json } = (await res.json()) as { json: { status: string; activeProvider: string } };
      expect(json.status).toBe("ok");
      expect(json.activeProvider).toBeDefined();
    });
  });

  describe("Templates (prompt_templates table)", () => {
    it("POST /rpc/templates/list retrieves curated templates from database", async () => {
      const res = await app.request("http://localhost/rpc/templates/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      });
      expect(res.status).toBe(200);
      const { json: templates } = (await res.json()) as {
        json: Array<{ slug: string; title: string }>;
      };
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThanOrEqual(4);

      const rfc = templates.find((t) => t.slug === "staff-architecture-rfc-review");
      expect(rfc).toBeDefined();
      expect(rfc?.title).toContain("Staff Architecture RFC");
    });

    it("POST /rpc/templates/list filters by mode", async () => {
      const res = await app.request("http://localhost/rpc/templates/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { mode: "image" } }),
      });
      expect(res.status).toBe(200);
      const { json: templates } = (await res.json()) as { json: Array<{ mode: string }> };
      expect(templates.length).toBeGreaterThan(0);
      for (const t of templates) {
        expect(t.mode).toBe("image");
      }
    });

    it("POST /rpc/templates/getBySlug returns the matching template or null", async () => {
      const hit = await app.request("http://localhost/rpc/templates/getBySlug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { slug: "staff-architecture-rfc-review" } }),
      });
      expect(hit.status).toBe(200);
      const { json: template } = (await hit.json()) as { json: { slug: string; category: string } };
      expect(template.slug).toBe("staff-architecture-rfc-review");
      expect(template.category).toBe("Engineering");

      const miss = await app.request("http://localhost/rpc/templates/getBySlug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { slug: "non-existent-slug-12345" } }),
      });
      expect(miss.status).toBe(200);
      const { json: nullTemplate } = (await miss.json()) as { json: unknown };
      expect(nullTemplate).toBeNull();
    });
  });

  describe("User Preferences (users.preferences JSON column)", () => {
    it("returns empty preferences for an unauthenticated guest", async () => {
      const res = await app.request("http://localhost/rpc/userPreferences/get", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: { dismissedHotspots: object; completedTours: object };
      };
      expect(json.dismissedHotspots).toEqual({});
      expect(json.completedTours).toEqual({});
    });

    it("retrieves preferences for an authenticated user", async () => {
      const res = await app.request("http://localhost/rpc/userPreferences/get", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": testUserId,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: { dismissedHotspots: Record<string, string> };
      };
      expect(json.dismissedHotspots["spot-initial"]).toBe("2026-11-12T10:00:00Z");
    });

    it("updates and persists preferences in the database", async () => {
      const res = await app.request("http://localhost/rpc/userPreferences/updateOnboarding", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": testUserId,
        },
        body: JSON.stringify({
          json: {
            hotspotId: "spot-model-picker",
            timestamp: "2026-11-12T12:00:00Z",
          },
        }),
      });
      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: { dismissedHotspots: Record<string, string> };
      };
      expect(json.dismissedHotspots["spot-model-picker"]).toBe("2026-11-12T12:00:00Z");
      expect(json.dismissedHotspots["spot-initial"]).toBe("2026-11-12T10:00:00Z");

      // Verify in DB directly
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
        select: { preferences: true },
      });
      const prefs = user?.preferences as { dismissedHotspots: Record<string, string> };
      expect(prefs.dismissedHotspots["spot-model-picker"]).toBe("2026-11-12T12:00:00Z");
    });
  });

  describe("Billing Status (spaces, subscriptions, usage_counters, plan_limits)", () => {
    it("returns accurate remaining daily prompts and daily limit for guest", async () => {
      const res = await app.request("http://localhost/rpc/billing/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: {
          plan: string;
          status: string;
          remainingDailyPrompts: number;
          dailyLimit: number;
          resetAt: string;
        };
      };
      expect(json.plan).toBe("free");
      expect(json.status).toBe("active");
      expect(json.dailyLimit).toBe(5);
      expect(json.remainingDailyPrompts).toBeLessThanOrEqual(5);
      expect(new Date(json.resetAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("returns workspace entitlements for an authenticated space", async () => {
      const res = await app.request("http://localhost/rpc/billing/status", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: {
          plan: string;
          dailyLimit: number;
          remainingDailyPrompts: number;
        };
      };
      expect(json.plan).toBe("free");
      expect(json.dailyLimit).toBe(20);
      expect(json.remainingDailyPrompts).toBe(20);
    });
  });

  describe("Prompt History & Public Shared Prompts", () => {
    it("POST /rpc/prompts/getShared retrieves a publicly shared prompt", async () => {
      const res = await app.request("http://localhost/rpc/prompts/getShared", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { shareId: testShareId } }),
      });
      expect(res.status).toBe(200);
      const { json: prompt } = (await res.json()) as {
        json: {
          title: string;
          isShared: boolean;
          shareId: string;
          category: string;
        };
      };
      expect(prompt.title).toBe("Test Shared Architecture Prompt");
      expect(prompt.isShared).toBe(true);
      expect(prompt.shareId).toBe(testShareId);
      expect(prompt.category).toBe("Engineering");
    });

    it("POST /rpc/prompts/history lists tenant history within space", async () => {
      const res = await app.request("http://localhost/rpc/prompts/history", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({ json: { limit: 10 } }),
      });
      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: { items: Array<{ id: string; title: string }> };
      };
      expect(json.items.length).toBeGreaterThanOrEqual(1);
      expect(json.items[0]?.title).toBe("Test Shared Architecture Prompt");
    });
  });

  describe("Prompt Generation & Usage Recording", () => {
    it("composes prompt, increments usage counter, and records in prompt_generations", async () => {
      const draftInput = {
        interactionId: `int_${Date.now()}`,
        draft: {
          rawInput: "Design a fault-tolerant message queue for [Throughput_Target]",
          mode: "text" as const,
          modelId: "gpt-4.1",
          constraints: ["Zero message loss"],
          guardrails: [],
          advanced: {},
        },
      };

      const res = await app.request("http://localhost/rpc/prompts/compose", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({ json: draftInput }),
      });

      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: {
          compiledPrompt: string;
          remainingDailyPrompts: number;
        };
      };
      expect(json.compiledPrompt).toBeDefined();
      expect(json.remainingDailyPrompts).toBe(19); // 20 - 1

      // Verify record exists in prompt_generations for this space
      const generations = await runAsSystem(async (tx) =>
        tx.promptGeneration.findMany({
          where: { spaceId: testSpaceId },
        }),
      );
      expect(generations.length).toBeGreaterThanOrEqual(1);
      const saved = generations.find((g) => g.rawInput.includes("fault-tolerant message queue"));
      expect(saved).toBeDefined();
      expect(saved?.mode).toBe("text");

      // Verify billing status reflects the decrement
      const statusRes = await app.request("http://localhost/rpc/billing/status", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
        },
        body: JSON.stringify({}),
      });
      const { json: statusJson } = (await statusRes.json()) as {
        json: { remainingDailyPrompts: number };
      };
      expect(statusJson.remainingDailyPrompts).toBe(19);
    });

    it("executes refine and persists to prompt_generations", async () => {
      const res = await app.request("http://localhost/rpc/prompts/refine", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({
          json: {
            originalPrompt: "Draft an incident review memo for [Service_Down]",
            mode: "improve",
            targetTone: "concise and executive ready",
          },
        }),
      });

      expect(res.status).toBe(200);
      const { json } = (await res.json()) as { json: { optimizedPrompt: string } };
      expect(json.optimizedPrompt).toBeDefined();

      const gens = await runAsSystem((tx) =>
        tx.promptGeneration.findMany({
          where: { spaceId: testSpaceId, kind: "refine" },
        }),
      );
      expect(gens.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects execution when quota is exhausted with QUOTA_EXCEEDED (403)", async () => {
      const quotaKey = `exhausted_guest_${Date.now()}`;
      // Pre-seed 5 calls in DB for this guest key (guest dailyLimit is 5)
      const today = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
      );
      const { hashClientKey } = await import("./auth/session-resolver.js");

      await runAsSystem((tx) =>
        tx.usageCounter.create({
          data: {
            clientKey: hashClientKey(quotaKey),
            usageDate: today,
            action: "compose",
            count: 5,
          },
        }),
      );

      const res = await app.request("http://localhost/rpc/prompts/compose", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-client-key": quotaKey,
        },
        body: JSON.stringify({
          json: {
            interactionId: "int_quota_test",
            draft: {
              rawInput: "Test prompt exceeding quota",
              mode: "text",
              modelId: "gpt-4.1",
              constraints: [],
              guardrails: [],
              advanced: {},
            },
          },
        }),
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("QUOTA_EXCEEDED");
    });
  });

  describe("Session Authentication (sessions table)", () => {
    const sessionToken = `tok_integration_${Date.now()}`;

    beforeAll(async () => {
      await prisma.session.create({
        data: {
          id: `sess_${Date.now()}`,
          userId: testUserId,
          token: sessionToken,
          expiresAt: new Date(Date.now() + 86400_000), // 24h
          activeSpaceId: testSpaceId,
        },
      });
    });

    afterAll(async () => {
      try {
        await prisma.session.deleteMany({ where: { token: sessionToken } });
      } catch {
        // ignore
      }
    });

    it("resolves user and space from Authorization: Bearer <token>", async () => {
      const res = await app.request("http://localhost/rpc/billing/status", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const { json } = (await res.json()) as { json: { dailyLimit: number } };
      // Authenticated space limit (20), not guest limit (5)
      expect(json.dailyLimit).toBe(20);
    });
  });

  describe("Prompt CRUD, Sharing & Guest Migration", () => {
    let savedPromptId = "";
    let sharedId = "";

    it("prompts.save rejects unauthenticated guest", async () => {
      const res = await app.request("http://localhost/rpc/prompts/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            title: "Guest Attempt",
            rawInput: "Test input",
            compiledPrompt: "Test compiled",
            mode: "text",
          },
        }),
      });

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("UNAUTHENTICATED");
    });

    it("prompts.save persists prompt with variables to tenant library", async () => {
      const res = await app.request("http://localhost/rpc/prompts/save", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({
          json: {
            title: "Kubernetes Cluster Autoscaling Policy",
            rawInput: "Autoscale nodes based on [Metric_Name] under [Cost_Ceiling].",
            compiledPrompt: "SPEC: Scale cluster using [Metric_Name] within budget [Cost_Ceiling].",
            mode: "text",
            framework: "costar",
            modelId: "gpt-4.1",
            category: "DevOps",
            tags: ["k8s", "autoscaling"],
          },
        }),
      });

      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: {
          id: string;
          title: string;
          detectedVariables: string[];
          isShared: boolean;
        };
      };

      expect(json.id).toBeDefined();
      expect(json.title).toBe("Kubernetes Cluster Autoscaling Policy");
      expect(json.detectedVariables).toContain("Metric_Name");
      expect(json.detectedVariables).toContain("Cost_Ceiling");
      expect(json.isShared).toBe(false);

      savedPromptId = json.id;

      // Verify in DB directly
      const inDb = await runAsSystem((tx) =>
        tx.savedPrompt.findUnique({
          where: { id: savedPromptId },
        }),
      );
      expect(inDb).toBeDefined();
      expect(inDb?.spaceId).toBe(testSpaceId);
    });

    it("prompts.share creates a public link and enables public retrieval", async () => {
      const res = await app.request("http://localhost/rpc/prompts/share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({
          json: { id: savedPromptId },
        }),
      });

      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: { shareId: string; shareUrl: string };
      };
      expect(json.shareId).toBeDefined();
      expect(json.shareUrl).toContain(json.shareId);
      sharedId = json.shareId;

      // Retrieve via public getShared without any auth headers
      const publicRes = await app.request("http://localhost/rpc/prompts/getShared", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { shareId: sharedId } }),
      });

      expect(publicRes.status).toBe(200);
      const { json: sharedPrompt } = (await publicRes.json()) as {
        json: { title: string; isShared: boolean };
      };
      expect(sharedPrompt.title).toBe("Kubernetes Cluster Autoscaling Policy");
      expect(sharedPrompt.isShared).toBe(true);
    });

    it("prompts.delete removes prompt from library and makes it non-retrievable", async () => {
      const res = await app.request("http://localhost/rpc/prompts/delete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({
          json: { id: savedPromptId },
        }),
      });

      expect(res.status).toBe(200);
      const { json } = (await res.json()) as { json: { deleted: boolean } };
      expect(json.deleted).toBe(true);

      // Verify prompt is gone from DB
      const inDb = await runAsSystem((tx) =>
        tx.savedPrompt.findUnique({
          where: { id: savedPromptId },
        }),
      );
      expect(inDb).toBeNull();
    });

    it("prompts.importGuestInteraction imports guest prompt and is idempotent", async () => {
      const interactionId = `int_guest_${Date.now()}`;
      const payload = {
        interactionId,
        createdAt: "2026-11-12T10:00:00Z",
        updatedAt: "2026-11-12T10:05:00Z",
        prompt: {
          rawInput: "Draft a system architecture proposal for [Workload_Name]",
          mode: "text" as const,
          modelId: "gpt-4.1",
          constraints: [],
          guardrails: [],
          advanced: {},
        },
        response: {
          compiledPrompt: "SPEC: Distributed system for [Workload_Name]",
          detectedVariables: ["Workload_Name"],
          providerId: "openai",
          modelId: "gpt-4.1",
        },
      };

      // 1. Initial import
      const firstRes = await app.request("http://localhost/rpc/prompts/importGuestInteraction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({ json: payload }),
      });

      expect(firstRes.status).toBe(200);
      const { json: firstJson } = (await firstRes.json()) as {
        json: { imported: boolean; promptGenerationId: string };
      };
      expect(firstJson.imported).toBe(true);
      expect(firstJson.promptGenerationId).toBeDefined();

      // Verify in DB prompt_generations & saved_prompts
      const gen = await runAsSystem((tx) =>
        tx.promptGeneration.findUnique({
          where: { id: firstJson.promptGenerationId },
        }),
      );
      expect(gen).toBeDefined();
      expect(gen?.kind).toBe("guest_import");
      expect(gen?.guestInteractionId).toBe(interactionId);

      // 2. Second import (idempotency check)
      const secondRes = await app.request("http://localhost/rpc/prompts/importGuestInteraction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({ json: payload }),
      });

      expect(secondRes.status).toBe(200);
      const { json: secondJson } = (await secondRes.json()) as {
        json: { imported: boolean; promptGenerationId: string };
      };
      expect(secondJson.imported).toBe(false);
      expect(secondJson.promptGenerationId).toBe(firstJson.promptGenerationId);
    });
  });

  describe("Reverse Engineer (Image-to-Prompt) & Billing Checkout/Portal", () => {
    it("executes reverseEngineer with a >32KB image payload and persists to prompt_generations", async () => {
      const largeBase64 = "A".repeat(48_000);
      const res = await app.request("http://localhost/rpc/prompts/reverseEngineer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({
          json: {
            imageBase64: largeBase64,
            mimeType: "image/png",
            targetMode: "image",
            focusNotes: "Warm golden hour rim lighting",
          },
        }),
      });

      expect(res.status).toBe(200);
      const { json } = (await res.json()) as {
        json: {
          reconstructedPrompt: string;
          remainingDailyRuns: number;
          breakdown: { subject: string; negativePrompt: string };
        };
      };
      expect(json.reconstructedPrompt).toContain("RECONSTRUCTED VISUAL PROMPT");
      expect(json.remainingDailyRuns).toBe(2); // free tier reverse_engineer limit is 3
      expect(json.breakdown.subject.length).toBeGreaterThan(0);

      const gens = await runAsSystem((tx) =>
        tx.promptGeneration.findMany({
          where: { spaceId: testSpaceId, kind: "reverse_engineer" },
        }),
      );
      expect(gens.length).toBeGreaterThanOrEqual(1);

      const historyRes = await app.request("http://localhost/rpc/prompts/generations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({ json: { kind: "reverse_engineer", limit: 10 } }),
      });
      expect(historyRes.status).toBe(200);
      const { json: historyJson } = (await historyRes.json()) as {
        json: {
          items: Array<{
            id: string;
            kind: string;
            rawInput: string;
            compiledPrompt: string;
            inputImageUrl: string | null;
          }>;
          nextCursor: string | null;
        };
      };
      expect(historyJson.items.length).toBeGreaterThanOrEqual(1);
      expect(historyJson.items[0]?.kind).toBe("reverse_engineer");
      expect(historyJson.items[0]?.compiledPrompt).toContain("RECONSTRUCTED VISUAL PROMPT");
      expect(historyJson.items[0]?.inputImageUrl).toMatch(/^data:image\/png;base64,/);
    });

    it("rejects unauthenticated billing.checkout with 401", async () => {
      const res = await app.request("http://localhost/rpc/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            plan: "pro",
            interval: "monthly",
            seats: 1,
          },
        }),
      });
      expect(res.status).toBe(401);
    });

    it("completes emulated checkout, opens portal, and handles webhooks idempotently", async () => {
      const checkoutRes = await app.request("http://localhost/rpc/billing/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({
          json: {
            plan: "pro",
            interval: "yearly",
            seats: 1,
          },
        }),
      });
      expect(checkoutRes.status).toBe(200);
      const { json: checkoutJson } = (await checkoutRes.json()) as { json: { url: string } };
      expect(checkoutJson.url).toBe("/billing/return?plan=pro&emulated=1");

      const spaceAfter = await prisma.space.findUnique({ where: { id: testSpaceId } });
      expect(spaceAfter?.plan).toBe("pro");
      expect(spaceAfter?.stripeCustomerId).toBe(`cus_local_${testSpaceId}`);

      const portalRes = await app.request("http://localhost/rpc/billing/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({}),
      });
      expect(portalRes.status).toBe(200);
      const { json: portalJson } = (await portalRes.json()) as { json: { url: string } };
      expect(portalJson.url).toBe("/settings/profile?portal=emulated");

      const badWebhook = await app.request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "invalid",
        },
        body: JSON.stringify({ customerId: `cus_local_${testSpaceId}`, eventId: "evt_bad" }),
      });
      expect(badWebhook.status).toBe(400);

      const eventId = `evt_wh_${Date.now()}`;
      const goodWebhook1 = await app.request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "emulator-signature",
        },
        body: JSON.stringify({ customerId: `cus_local_${testSpaceId}`, eventId }),
      });
      expect(goodWebhook1.status).toBe(200);

      // Replaying the same webhook eventId is idempotent and does not duplicate audit rows
      const goodWebhook2 = await app.request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "emulator-signature",
        },
        body: JSON.stringify({ customerId: `cus_local_${testSpaceId}`, eventId }),
      });
      expect(goodWebhook2.status).toBe(200);

      const auditRows = await runAsSystem((tx) =>
        tx.billingAuditEvent.findMany({
          where: { spaceId: testSpaceId, externalId: eventId },
        }),
      );
      expect(auditRows).toHaveLength(1);

      const switchToTeamRes = await app.request("http://localhost/rpc/billing/emulatePlan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({ json: { plan: "team", interval: "monthly" } }),
      });
      expect(switchToTeamRes.status).toBe(200);
      const { json: teamJson } = (await switchToTeamRes.json()) as {
        json: { plan: string; dailyLimit: number };
      };
      expect(teamJson.plan).toBe("team");
      expect(teamJson.dailyLimit).toBe(2000);

      const downgradeRes = await app.request("http://localhost/rpc/billing/emulatePlan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-space-id": testSpaceId,
          "x-user-id": testUserId,
        },
        body: JSON.stringify({ json: { plan: "free", interval: "monthly" } }),
      });
      expect(downgradeRes.status).toBe(200);
      const { json: freeJson } = (await downgradeRes.json()) as {
        json: { plan: string; dailyLimit: number };
      };
      expect(freeJson.plan).toBe("free");
      expect(freeJson.dailyLimit).toBe(20);

      const spaceDowngraded = await prisma.space.findUnique({ where: { id: testSpaceId } });
      expect(spaceDowngraded?.plan).toBe("free");
    });
  });
});
