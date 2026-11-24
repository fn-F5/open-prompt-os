import type {
  BillingProvider,
  ComposeStreamEvent,
  PromptOrchestrator,
} from "@open-prompt-os/adapter-kit";
import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "./app-env.js";
import { registerComposeStream } from "./routes/compose-stream.js";
import { registerVideoReverseEngineerStream } from "./routes/reverse-engineer-video-stream.js";
import { registerStripeWebhook } from "./routes/stripe-webhook.js";

const mockReserveQuota = vi.fn();
const mockReleaseQuota = vi.fn();
const mockRecordPromptGeneration = vi.fn();
const mockReconcileCustomerSubscription = vi.fn();

vi.mock("./services/usage-quota.js", () => ({
  reserveQuota: (...args: unknown[]) => mockReserveQuota(...args),
  releaseQuota: (...args: unknown[]) => mockReleaseQuota(...args),
  recordPromptGeneration: (...args: unknown[]) => mockRecordPromptGeneration(...args),
}));

vi.mock("./services/billing-service.js", () => ({
  reconcileCustomerSubscription: (...args: unknown[]) => mockReconcileCustomerSubscription(...args),
}));

const authHeaders = {
  "x-user-id": "usr_stream_test",
  "x-space-id": "spc_stream_test",
};

function createBaseApp(): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req_test_123");
    await next();
  });
  return app;
}

function createStubOrchestrator(overrides: Partial<PromptOrchestrator> = {}): PromptOrchestrator {
  return {
    compose: vi.fn(),
    composeStream: vi.fn(),
    refine: vi.fn(),
    reverseEngineer: vi.fn(),
    reverseEngineerVideo: vi.fn(),
    healthSnapshot: () => [],
    ...overrides,
  };
}

describe("Compose SSE Stream invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReserveQuota.mockResolvedValue({ allowed: true, reserved: true, remainingDaily: 9 });
    mockReleaseQuota.mockResolvedValue(undefined);
    mockRecordPromptGeneration.mockResolvedValue(undefined);
  });

  const validPayload = {
    interactionId: "int_sse_1",
    draft: {
      rawInput: "Write a detailed incident postmortem template for a payment outage",
      mode: "text",
      modelId: "gpt-4.1",
      constraints: [],
      guardrails: [],
      advanced: {},
    },
  };

  it("returns 401 UNAUTHORIZED when unauthenticated before reserving quota", async () => {
    const composeStream = vi.fn();
    const app = createBaseApp();
    registerComposeStream(app, {
      orchestrator: createStubOrchestrator({ composeStream }),
      allowRequest: () => true,
      trustProxy: false,
    });

    const res = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(mockReserveQuota).not.toHaveBeenCalled();
    expect(composeStream).not.toHaveBeenCalled();
  });

  it("never closes silently with HTTP 200: emits event: error and releases quota when stream ends without done", async () => {
    const orchestrator = createStubOrchestrator({
      async *composeStream(): AsyncIterable<ComposeStreamEvent> {
        yield { type: "text-delta", text: "partial output..." };
        // Buggy upstream terminates without yielding { type: "done", ... }
      },
    });

    const app = createBaseApp();
    registerComposeStream(app, {
      orchestrator,
      allowRequest: () => true,
      trustProxy: false,
    });

    const res = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: text-delta");
    expect(body).toContain("event: error");
    expect(body).not.toContain("event: done");
    expect(mockReleaseQuota).toHaveBeenCalledTimes(1);
    expect(mockRecordPromptGeneration).not.toHaveBeenCalled();
  });

  it("sanitizes raw upstream 429 provider JSON and releases reserved quota on error", async () => {
    const rawProviderLeak =
      '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","apiKey":"AIzaSySecret12345"}}';
    const orchestrator = createStubOrchestrator({
      composeStream(): AsyncIterable<ComposeStreamEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                return Promise.reject(new LlmProviderError("provider_error", rawProviderLeak));
              },
            };
          },
        };
      },
    });

    const app = createBaseApp();
    registerComposeStream(app, {
      orchestrator,
      allowRequest: () => true,
      trustProxy: false,
    });

    const res = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify(validPayload),
    });

    const body = await res.text();
    expect(body).toContain("event: error");
    expect(body).not.toContain("RESOURCE_EXHAUSTED");
    expect(body).not.toContain("AIzaSySecret12345");
    expect(mockReleaseQuota).toHaveBeenCalledTimes(1);
  });

  it("returns 429 RATE_LIMITED and skips quota/orchestrator when rate limiter denies request", async () => {
    const composeStream = vi.fn();
    const app = createBaseApp();
    registerComposeStream(app, {
      orchestrator: createStubOrchestrator({ composeStream }),
      allowRequest: () => false,
      trustProxy: false,
    });

    const res = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(429);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("RATE_LIMITED");
    expect(mockReserveQuota).not.toHaveBeenCalled();
    expect(composeStream).not.toHaveBeenCalled();
  });

  it("returns 403 QUOTA_EXCEEDED without invoking orchestrator when daily quota is exhausted", async () => {
    mockReserveQuota.mockResolvedValue({ allowed: false, reserved: false, remainingDaily: 0 });
    const composeStream = vi.fn();
    const app = createBaseApp();
    registerComposeStream(app, {
      orchestrator: createStubOrchestrator({ composeStream }),
      allowRequest: () => true,
      trustProxy: false,
    });

    const res = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("QUOTA_EXCEEDED");
    expect(composeStream).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR for low-signal gibberish before reserving quota", async () => {
    const app = createBaseApp();
    registerComposeStream(app, {
      orchestrator: createStubOrchestrator(),
      allowRequest: () => true,
      trustProxy: false,
    });

    const res = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({
        interactionId: "int_bad_1",
        draft: { ...validPayload.draft, rawInput: "asdf" },
      }),
    });

    expect(res.status).toBe(400);
    expect(mockReserveQuota).not.toHaveBeenCalled();
  });
});

describe("Video Reverse Engineer SSE Stream invariants (30s cap & validation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReserveQuota.mockResolvedValue({ allowed: true, reserved: true, remainingDaily: 9 });
    mockReleaseQuota.mockResolvedValue(undefined);
    mockRecordPromptGeneration.mockResolvedValue(undefined);
  });

  it("returns 401 UNAUTHORIZED when unauthenticated before reserving quota", async () => {
    const reverseEngineerVideo = vi.fn();
    const app = createBaseApp();
    registerVideoReverseEngineerStream(app, {
      orchestrator: createStubOrchestrator({ reverseEngineerVideo }),
      trustProxy: false,
    });

    const res = await app.request("http://localhost/api/prompts/reverse-engineer-video/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceType: "youtube",
        youtubeUrl: "https://youtu.be/jNQXAC9IVRw",
        startOffsetSec: 0,
        endOffsetSec: 10,
      }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(mockReserveQuota).not.toHaveBeenCalled();
    expect(reverseEngineerVideo).not.toHaveBeenCalled();
  });

  it("rejects inverted trim windows on multipart upload (startOffsetSec >= durationSeconds)", async () => {
    const reverseEngineerVideo = vi.fn();
    const app = createBaseApp();
    registerVideoReverseEngineerStream(app, {
      orchestrator: createStubOrchestrator({ reverseEngineerVideo }),
      trustProxy: false,
    });

    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([0, 1, 2, 3])], "clip.mp4", { type: "video/mp4" }),
    );
    form.append("startOffsetSec", "10");
    form.append("durationSeconds", "5");

    const res = await app.request("http://localhost/api/prompts/reverse-engineer-video/stream", {
      method: "POST",
      headers: authHeaders,
      body: form,
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; message: string };
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.message).toMatch(/Start time must be less than video duration/i);
    expect(reverseEngineerVideo).not.toHaveBeenCalled();
    expect(mockReserveQuota).not.toHaveBeenCalled();
  });

  it("rejects multipart uploads with duration > 30s when endOffsetSec is not trimmed", async () => {
    const app = createBaseApp();
    registerVideoReverseEngineerStream(app, {
      orchestrator: createStubOrchestrator(),
      trustProxy: false,
    });

    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "long.mp4", { type: "video/mp4" }));
    form.append("startOffsetSec", "0");
    form.append("durationSeconds", "45");

    const res = await app.request("http://localhost/api/prompts/reverse-engineer-video/stream", {
      method: "POST",
      headers: authHeaders,
      body: form,
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/30s limit/i);
  });

  it("rejects empty files and unsupported MIME types on multipart upload", async () => {
    const app = createBaseApp();
    registerVideoReverseEngineerStream(app, {
      orchestrator: createStubOrchestrator(),
      trustProxy: false,
    });

    const emptyForm = new FormData();
    emptyForm.append("file", new File([], "empty.mp4", { type: "video/mp4" }));
    const emptyRes = await app.request(
      "http://localhost/api/prompts/reverse-engineer-video/stream",
      { method: "POST", headers: authHeaders, body: emptyForm },
    );
    expect(emptyRes.status).toBe(400);

    const badMimeForm = new FormData();
    badMimeForm.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "clip.avi", { type: "video/x-msvideo" }),
    );
    const badMimeRes = await app.request(
      "http://localhost/api/prompts/reverse-engineer-video/stream",
      { method: "POST", headers: authHeaders, body: badMimeForm },
    );
    expect(badMimeRes.status).toBe(400);
  });

  it("canonicalizes YouTube Shorts URLs, defaults endOffsetSec to a 30s sliding window, and releases quota on upstream error", async () => {
    const reverseEngineerVideo = vi
      .fn()
      .mockRejectedValue(new LlmProviderError("provider_error", "raw internal stack trace 503"));
    const app = createBaseApp();
    registerVideoReverseEngineerStream(app, {
      orchestrator: createStubOrchestrator({ reverseEngineerVideo }),
      trustProxy: false,
    });

    const res = await app.request("http://localhost/api/prompts/reverse-engineer-video/stream", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({
        sourceType: "youtube",
        youtubeUrl: "https://youtube.com/shorts/jNQXAC9IVRw?feature=share",
        startOffsetSec: 5,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: error");
    expect(body).not.toContain("raw internal stack trace");
    expect(reverseEngineerVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        startOffsetSec: 5,
        endOffsetSec: 35,
      }),
      expect.anything(),
    );
    expect(mockReleaseQuota).toHaveBeenCalledTimes(1);
  });
});

describe("Stripe Webhook route invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReconcileCustomerSubscription.mockResolvedValue({ spaceId: "spc_1", plan: "pro" });
  });

  function makeProvider(overrides: Partial<BillingProvider>): BillingProvider {
    return {
      kind: "stripe",
      listPlans: vi.fn(),
      createCustomer: vi.fn(),
      createCheckout: vi.fn(),
      createPortal: vi.fn(),
      getCustomerSubscription: vi.fn(),
      parseWebhook: vi.fn(),
      ...overrides,
    };
  }

  it("returns 503 BILLING_DISABLED when paid billing is disabled", async () => {
    const app = createBaseApp();
    registerStripeWebhook(app, makeProvider({ kind: "disabled" }));

    const res = await app.request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });

    expect(res.status).toBe(503);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("BILLING_DISABLED");
    expect(mockReconcileCustomerSubscription).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_SIGNATURE when signature verification fails", async () => {
    const app = createBaseApp();
    registerStripeWebhook(
      app,
      makeProvider({
        parseWebhook: () => ({ kind: "invalid" }),
      }),
    );

    const res = await app.request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=0,v1=forged" },
      body: '{"id":"evt_1"}',
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("INVALID_SIGNATURE");
    expect(mockReconcileCustomerSubscription).not.toHaveBeenCalled();
  });

  it("returns 200 without reconciling on ignored webhook events", async () => {
    const app = createBaseApp();
    registerStripeWebhook(
      app,
      makeProvider({
        parseWebhook: () => ({ kind: "ignored" }),
      }),
    );

    const res = await app.request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: '{"type":"charge.succeeded"}',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mockReconcileCustomerSubscription).not.toHaveBeenCalled();
  });

  it("reconciles customer subscription with eventId on valid reconcile events", async () => {
    const provider = makeProvider({
      parseWebhook: () => ({
        kind: "reconcile",
        customerId: "cus_live_123",
        eventId: "evt_live_456",
      }),
    });
    const app = createBaseApp();
    registerStripeWebhook(app, provider);

    const res = await app.request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=valid" },
      body: '{"id":"evt_live_456"}',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mockReconcileCustomerSubscription).toHaveBeenCalledWith(
      "cus_live_123",
      provider,
      "evt_live_456",
    );
  });
});
