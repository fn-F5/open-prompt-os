import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import type {
  ComposePromptOutput,
  ReverseEngineerOutput,
  VideoReverseEngineerOutput,
} from "@open-prompt-os/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ctorMock, captureMock, identifyMock, captureExceptionMock, shutdownMock } = vi.hoisted(
  () => ({
    ctorMock: vi.fn(),
    captureMock: vi.fn(),
    identifyMock: vi.fn(),
    captureExceptionMock: vi.fn(),
    shutdownMock: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("posthog-node", () => ({
  PostHog: class MockPostHog {
    constructor(apiKey: string, options: Record<string, unknown>) {
      ctorMock(apiKey, options);
    }

    capture(payload: Record<string, unknown>) {
      captureMock(payload);
    }

    identify(payload: Record<string, unknown>) {
      identifyMock(payload);
    }

    captureException(error: unknown, options?: Record<string, unknown>) {
      captureExceptionMock(error, options);
    }

    shutdown() {
      return shutdownMock();
    }
  },
}));

vi.mock("@open-prompt-os/db", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    space: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
  runAsSystem: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      space: { upsert: vi.fn().mockResolvedValue({}) },
      user: { upsert: vi.fn().mockResolvedValue({}) },
      spaceMember: { upsert: vi.fn().mockResolvedValue({}) },
    }),
  ),
  runAsTenant: vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
}));

vi.mock("./services/usage-quota.js", () => ({
  reserveQuota: vi.fn().mockResolvedValue({
    allowed: true,
    remainingDaily: 9,
    dailyLimit: 10,
    currentUsage: 1,
    reserved: true,
  }),
  releaseQuota: vi.fn().mockResolvedValue(undefined),
  recordPromptGeneration: vi.fn().mockResolvedValue(undefined),
  getBillingStatus: vi.fn().mockResolvedValue({
    plan: "free",
    status: "active",
    dailyLimit: 10,
    usedToday: 1,
    remainingToday: 9,
    resetAt: new Date().toISOString(),
  }),
}));

vi.mock("./services/prompt-library-service.js", () => ({
  savePrompt: vi.fn().mockResolvedValue({
    id: "prm_test_1",
    title: "Private Title",
    rawInput: "Private Raw Input",
    compiledPrompt: "Private Compiled Prompt",
    mode: "text",
    framework: "costar",
    modelId: "gemini-2.5-pro",
    category: "general",
    tags: [],
    detectedVariables: [],
    isShared: false,
    shareId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  deletePrompt: vi.fn().mockResolvedValue({ deleted: true }),
  sharePrompt: vi.fn().mockResolvedValue({
    shareId: "shr_test_1",
    shareUrl: "http://localhost:5173/s/shr_test_1",
  }),
  getSharedPrompt: vi.fn().mockResolvedValue(null),
  listPromptHistory: vi.fn().mockResolvedValue([]),
  listPromptGenerations: vi.fn().mockResolvedValue([]),
  importGuestInteraction: vi.fn().mockResolvedValue({ imported: false }),
}));

vi.mock("./services/feedback-service.js", () => ({
  submitFeedback: vi.fn().mockResolvedValue({
    id: "fbk_test_1",
    kind: "bug_report",
    title: "Secret Title",
    message: "Secret feedback message",
    status: "open",
    pagePath: "/compose",
    createdAt: new Date().toISOString(),
  }),
  listMyFeedback: vi.fn().mockResolvedValue([]),
}));

vi.mock("./services/user-preferences-service.js", () => ({
  getUserPreferences: vi.fn().mockResolvedValue({ dismissedHotspots: {}, completedTours: {} }),
  updateUserPreferences: vi.fn().mockResolvedValue({ dismissedHotspots: {}, completedTours: {} }),
  recordSignupAttribution: vi.fn().mockResolvedValue({
    recorded: true,
    referralSource: "github_or_open_source",
  }),
}));

vi.mock("./services/billing-service.js", () => ({
  startCheckoutSession: vi.fn().mockResolvedValue({ url: "https://checkout.local/session" }),
  createCustomerPortalSession: vi.fn().mockResolvedValue({ url: "https://portal.local" }),
  refreshBillingStatus: vi.fn().mockResolvedValue({}),
  switchEmulatedPlan: vi.fn().mockResolvedValue({}),
}));

import { createApp } from "./app.js";
import { createPostHogErrorTracker } from "./posthog.js";
import { createRateLimiter } from "./rate-limit.js";

function createMockOrchestrator(overrides?: Partial<PromptOrchestrator>): PromptOrchestrator {
  const composeOutput: ComposePromptOutput = {
    interactionId: "int_1",
    compiledPrompt: "Sensitive compiled prompt output",
    detectedVariables: [],
    followUpQuestions: [],
    providerId: "gemini",
    modelId: "gemini-2.5-pro",
    latencyMs: 42,
    healedFromFailure: false,
    remainingDailyPrompts: 9,
    requestId: "req_1",
  };
  const reverseImageOutput: ReverseEngineerOutput = {
    reconstructedPrompt: "Sensitive reconstructed image prompt",
    detectedVariables: [],
    breakdown: {
      subject: "Subject",
      styleAndMedium: "Photography",
      lightingAndColor: "Soft light",
      cameraAndComposition: "Centered",
      moodAndAtmosphere: "Calm",
      negativePrompt: "blur",
    },
    suggestedDraft: {
      rawInput: "Sensitive raw input",
      mode: "image",
      modelId: "imagen-4",
      constraints: [],
      guardrails: [],
      advanced: {},
    },
    providerId: "gemini",
    modelId: "gemini-2.5-flash",
    latencyMs: 55,
    remainingDailyRuns: 9,
    requestId: "req_img",
  };
  const reverseVideoOutput: VideoReverseEngineerOutput = {
    overview: {
      durationSeconds: 10,
      aspectRatio: "16:9",
      pacingStyle: "steady",
      isSingleTake: true,
      timestampsAreEstimated: true,
    },
    continuityBible: {
      subjectAndWardrobe: "Studio host",
      environmentAndSet: "Studio",
      lightingAndColorGrade: "Warm",
      lensAndOpticalDna: "35mm",
      audioAndMusicDna: "Ambient",
      negativeGuardrails: "No text",
    },
    shots: [
      {
        shotNumber: 1,
        startTime: "00:00",
        endTime: "00:10",
        transitionIn: "cut",
        firstFramePrompt: "Studio shot",
        motionAndCamera: "Slow push",
        audioCue: "Ambient",
        shotPrompt: "Studio shot with slow push",
      },
    ],
    targetGenerator: "veo",
    masterPrompt: "Sensitive master video prompt",
    detectedVariables: [],
    suggestedDraft: {
      rawInput: "Sensitive video draft",
      mode: "video",
      modelId: "veo-3",
      constraints: [],
      guardrails: [],
      advanced: {},
    },
    providerId: "gemini",
    modelId: "gemini-2.5-pro",
    latencyMs: 88,
    remainingDailyRuns: 9,
    requestId: "req_vid",
  };

  return {
    compose: async () => composeOutput,
    async *composeStream() {
      yield { type: "text-delta", text: "Hello" };
      yield { type: "done", output: composeOutput };
    },
    refine: async () => ({
      optimizedPrompt: "Sensitive optimized prompt",
      detectedVariables: [],
      unresolvedVariables: [],
      duplicateVariables: [],
      findings: [],
      summary: "Summary",
      providerId: "gemini",
      modelId: "gemini-2.5-pro",
      latencyMs: 31,
      requestId: "req_ref",
    }),
    reverseEngineer: async () => reverseImageOutput,
    reverseEngineerVideo: async () => reverseVideoOutput,
    healthSnapshot: () => [],
    ...overrides,
  };
}

describe("API PostHog user tracking", () => {
  beforeEach(() => {
    ctorMock.mockReset();
    captureMock.mockReset();
    identifyMock.mockReset();
    captureExceptionMock.mockReset();
    shutdownMock.mockClear();
  });

  it("ignores all calls when apiKey is blank", async () => {
    const tracker = createPostHogErrorTracker({ apiKey: "   " });
    tracker.captureException(new Error("boom"), { distinctId: "usr_1", spaceId: "spc_1" });
    tracker.identifyUser?.({ distinctId: "usr_1", spaceId: "spc_1", plan: "pro" });
    tracker.captureEvent?.({
      distinctId: "usr_1",
      event: "api:prompt_compose",
      properties: { mode: "text" },
    });
    await tracker.shutdown();

    expect(ctorMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(identifyMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("attaches trimmed distinctId, db_user_id, and spaceId in captureException", () => {
    const tracker = createPostHogErrorTracker({ apiKey: "phc_test_key" });

    tracker.captureException(new Error("Failed with sk-1234567890abcdefghijklmnop"), {
      distinctId: "  usr_db_123  ",
      spaceId: "  spc_db_456  ",
      requestId: "req_abc",
      path: "/rpc/prompts/compose",
      method: "POST",
      status: 500,
      source: "rpc.error",
    });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [err, options] = captureExceptionMock.mock.calls[0] as [Error, Record<string, unknown>];
    expect(err.message).not.toContain("sk-1234567890abcdefghijklmnop");
    expect(options).toEqual({
      distinctId: "usr_db_123",
      properties: {
        db_user_id: "usr_db_123",
        spaceId: "spc_db_456",
        requestId: "req_abc",
        path: "/rpc/prompts/compose",
        method: "POST",
        status: 500,
        source: "rpc.error",
      },
    });
  });

  it("identifies users with db_user_id, space_id, and plan and skips blank distinctId", () => {
    const tracker = createPostHogErrorTracker({ apiKey: "phc_test_key" });

    tracker.identifyUser?.({ distinctId: "   ", spaceId: "spc_1", plan: "pro" });
    expect(identifyMock).not.toHaveBeenCalled();

    tracker.identifyUser?.({ distinctId: "  usr_db_123  ", spaceId: "spc_db_456", plan: "pro" });
    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).toHaveBeenCalledWith({
      distinctId: "usr_db_123",
      properties: {
        $set: {
          db_user_id: "usr_db_123",
          space_id: "spc_db_456",
          plan: "pro",
        },
      },
    });
  });

  it("captures sanitized events, strips forbidden PII/prompt keys, and redacts secrets", () => {
    const tracker = createPostHogErrorTracker({ apiKey: "phc_test_key" });

    tracker.captureEvent?.({
      distinctId: "   ",
      event: "api:prompt_compose",
    });
    tracker.captureEvent?.({
      distinctId: "usr_db_123",
      event: "   ",
    });
    expect(captureMock).not.toHaveBeenCalled();

    tracker.captureEvent?.({
      distinctId: "  usr_db_123  ",
      event: "  api:prompt_compose  ",
      properties: {
        space_id: "spc_db_456",
        mode: "text",
        latency_ms: 42,
        streaming: false,
        nullable: null,
        ignoredUndefined: undefined,
        email: "user@example.com",
        rawInput: "My confidential raw prompt",
        compiledPrompt: "My confidential compiled prompt",
        apiKey: "sk-1234567890abcdefghijklmnop",
        message: "Private user message",
        note: "Contains secret sk-1234567890abcdefghijklmnop",
      },
    });

    expect(captureMock).toHaveBeenCalledTimes(1);
    const [payload] = captureMock.mock.calls[0] as [
      { distinctId: string; event: string; properties: Record<string, unknown> },
    ];
    expect(payload.distinctId).toBe("usr_db_123");
    expect(payload.event).toBe("api:prompt_compose");
    expect(payload.properties.db_user_id).toBe("usr_db_123");
    expect(payload.properties.space_id).toBe("spc_db_456");
    expect(payload.properties.mode).toBe("text");
    expect(payload.properties.latency_ms).toBe(42);
    expect(payload.properties.streaming).toBe(false);
    expect(payload.properties.nullable).toBeNull();
    expect(payload.properties.note).not.toContain("sk-1234567890abcdefghijklmnop");

    for (const forbiddenKey of [
      "email",
      "rawInput",
      "compiledPrompt",
      "apiKey",
      "message",
      "ignoredUndefined",
    ]) {
      expect(payload.properties).not.toHaveProperty(forbiddenKey);
    }
  });

  it("maps DB userId and spaceId across oRPC procedures, SSE streams, and 5xx errors without PII", async () => {
    const tracker = createPostHogErrorTracker({ apiKey: "phc_test_key" });
    const app = createApp({
      orchestrator: createMockOrchestrator(),
      webOrigins: ["http://localhost:5173"],
      trustProxy: false,
      allowRequest: createRateLimiter(100, 60_000),
      errorTracker: tracker,
      log: () => {},
    });

    const headers = {
      "content-type": "application/json",
      "x-user-id": "usr_db_999",
      "x-space-id": "spc_db_999",
    };

    const composeRes = await app.request("http://localhost/rpc/prompts/compose", {
      method: "POST",
      headers,
      body: JSON.stringify({
        json: {
          interactionId: "int_1",
          draft: {
            rawInput: "Write a deployment runbook for our payment service",
            mode: "text",
            modelId: "gemini-2.5-pro",
            constraints: [],
            guardrails: [],
            advanced: {},
          },
        },
      }),
    });
    expect(composeRes.status).toBe(200);

    const refineRes = await app.request("http://localhost/rpc/prompts/refine", {
      method: "POST",
      headers,
      body: JSON.stringify({
        json: {
          originalPrompt: "Write a clear incident response checklist for engineers",
          mode: "improve",
          targetLength: "balanced",
        },
      }),
    });
    expect(refineRes.status).toBe(200);

    const autopsyRes = await app.request("http://localhost/rpc/prompts/autopsy", {
      method: "POST",
      headers,
      body: JSON.stringify({
        json: {
          originalPrompt: "Write a clear incident response checklist for engineers",
          failedOutput: "Something broken",
          targetLength: "balanced",
        },
      }),
    });
    expect(autopsyRes.status).toBe(200);

    const reverseImageRes = await app.request("http://localhost/rpc/prompts/reverseEngineer", {
      method: "POST",
      headers,
      body: JSON.stringify({
        json: {
          imageBase64: "AQID".repeat(10),
          mimeType: "image/png",
          targetMode: "image",
        },
      }),
    });
    expect(reverseImageRes.status).toBe(200);

    const saveRes = await app.request("http://localhost/rpc/prompts/save", {
      method: "POST",
      headers,
      body: JSON.stringify({
        json: {
          title: "Confidential Prompt Title",
          rawInput: "Confidential raw input",
          compiledPrompt: "Confidential compiled prompt",
          mode: "text",
          framework: "costar",
          modelId: "gemini-2.5-pro",
          category: "general",
          tags: [],
        },
      }),
    });
    expect(saveRes.status).toBe(200);

    const deleteRes = await app.request("http://localhost/rpc/prompts/delete", {
      method: "POST",
      headers,
      body: JSON.stringify({ json: { id: "prm_test_1" } }),
    });
    expect(deleteRes.status).toBe(200);

    const shareRes = await app.request("http://localhost/rpc/prompts/share", {
      method: "POST",
      headers,
      body: JSON.stringify({ json: { id: "prm_test_1" } }),
    });
    expect(shareRes.status).toBe(200);

    const checkoutRes = await app.request("http://localhost/rpc/billing/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({ json: { plan: "pro", interval: "monthly", seats: 1 } }),
    });
    expect(checkoutRes.status).toBe(200);

    const feedbackRes = await app.request("http://localhost/rpc/feedback/submit", {
      method: "POST",
      headers,
      body: JSON.stringify({
        json: {
          kind: "bug_report",
          title: "Sensitive bug title",
          message: "Sensitive bug description",
          contactEmail: "pii@example.com",
        },
      }),
    });
    expect(feedbackRes.status).toBe(200);

    const attributionRes = await app.request(
      "http://localhost/rpc/userPreferences/recordSignupAttribution",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          json: {
            referralSource: "github_or_open_source",
            referralDetail: "Private referral detail",
          },
        }),
      },
    );
    expect(attributionRes.status).toBe(200);

    const streamRes = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers,
      body: JSON.stringify({
        interactionId: "int_2",
        draft: {
          rawInput: "Write a streaming prompt for observability",
          mode: "text",
          modelId: "gemini-2.5-pro",
          constraints: [],
          guardrails: [],
          advanced: {},
        },
      }),
    });
    expect(streamRes.status).toBe(200);
    await streamRes.text();

    const videoStreamRes = await app.request(
      "http://localhost/api/prompts/reverse-engineer-video/stream",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          sourceType: "youtube",
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          startOffsetSec: 0,
          endOffsetSec: 10,
          targetGenerator: "veo",
        }),
      },
    );
    expect(videoStreamRes.status).toBe(200);
    await videoStreamRes.text();

    expect(identifyMock).toHaveBeenCalledWith({
      distinctId: "usr_db_999",
      properties: {
        $set: {
          db_user_id: "usr_db_999",
          space_id: "spc_db_999",
        },
      },
    });

    const capturedEvents = captureMock.mock.calls.map(
      (call) =>
        call[0] as { distinctId: string; event: string; properties: Record<string, unknown> },
    );
    expect(capturedEvents.map((e) => e.event)).toEqual([
      "api:prompt_compose",
      "api:prompt_refine",
      "api:prompt_autopsy",
      "api:reverse_engineer_image",
      "api:prompt_save",
      "api:prompt_delete",
      "api:prompt_share",
      "api:billing_checkout",
      "api:feedback_submit",
      "api:signup_attribution_record",
      "api:prompt_compose",
      "api:reverse_engineer_video",
    ]);

    const serializedEvents = JSON.stringify(capturedEvents);
    expect(serializedEvents).not.toContain("pii@example.com");
    expect(serializedEvents).not.toContain("Confidential");
    expect(serializedEvents).not.toContain("Sensitive");
    expect(serializedEvents).not.toContain("Private referral detail");
    expect(serializedEvents).not.toContain("youtube.com");

    for (const evt of capturedEvents) {
      expect(evt.distinctId).toBe("usr_db_999");
      expect(evt.properties.db_user_id).toBe("usr_db_999");
      expect(evt.properties.space_id).toBe("spc_db_999");
    }

    // Verify 5xx error captures include distinctId and spaceId across stream and RPC errors
    const failingApp = createApp({
      orchestrator: createMockOrchestrator({
        composeStream: () => ({
          [Symbol.asyncIterator]: () => ({
            async next() {
              throw new Error("stream boom");
            },
          }),
        }),
        reverseEngineerVideo: async () => {
          throw new Error("video boom");
        },
      }),
      webOrigins: ["http://localhost:5173"],
      trustProxy: false,
      allowRequest: createRateLimiter(100, 60_000),
      errorTracker: tracker,
      log: () => {},
    });

    const failedStreamRes = await failingApp.request(
      "http://localhost/api/prompts/compose/stream",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          interactionId: "int_fail",
          draft: {
            rawInput: "Write a streaming prompt that fails mid-stream",
            mode: "text",
            modelId: "gemini-2.5-pro",
            constraints: [],
            guardrails: [],
            advanced: {},
          },
        }),
      },
    );
    expect(failedStreamRes.status).toBe(200);
    await failedStreamRes.text();

    const failedVideoRes = await failingApp.request(
      "http://localhost/api/prompts/reverse-engineer-video/stream",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          sourceType: "youtube",
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          startOffsetSec: 0,
          endOffsetSec: 10,
          targetGenerator: "veo",
        }),
      },
    );
    expect(failedVideoRes.status).toBe(200);
    await failedVideoRes.text();

    const billingService = await import("./services/billing-service.js");
    vi.mocked(billingService.startCheckoutSession).mockRejectedValueOnce(
      new Error("unexpected billing crash"),
    );
    const failedRpcRes = await failingApp.request("http://localhost/rpc/billing/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({ json: { plan: "pro", interval: "monthly", seats: 1 } }),
    });
    expect(failedRpcRes.status).toBe(500);

    expect(captureExceptionMock).toHaveBeenCalledTimes(3);
    const errorPayloads = captureExceptionMock.mock.calls.map(
      (call) => call[1] as { distinctId?: string; properties: Record<string, unknown> },
    );
    expect(errorPayloads[0]).toMatchObject({
      distinctId: "usr_db_999",
      properties: {
        db_user_id: "usr_db_999",
        spaceId: "spc_db_999",
        source: "prompt.stream_failed",
      },
    });
    expect(errorPayloads[1]).toMatchObject({
      distinctId: "usr_db_999",
      properties: {
        db_user_id: "usr_db_999",
        spaceId: "spc_db_999",
        source: "prompt.video_reverse_engineer_failed",
      },
    });
    expect(errorPayloads[2]).toMatchObject({
      distinctId: "usr_db_999",
      properties: {
        db_user_id: "usr_db_999",
        spaceId: "spc_db_999",
        source: "rpc.error",
      },
    });
  });
});
