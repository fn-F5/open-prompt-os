import { describe, expect, it } from "vitest";
import {
  CheckoutInputSchema,
  ComposePromptInputSchema,
  DEFAULT_CURATED_TEMPLATES,
  DEFAULT_PRICING_PLANS,
  PricingPlanItemSchema,
  PromptTemplateSchema,
  RefinePromptInputSchema,
  ReverseEngineerInputSchema,
  SafeImageDataUrlSchema,
  VIDEO_REVERSE_ENGINEER_LIMITS,
  VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC,
  VideoReverseEngineerInputSchema,
} from "./index.js";

describe("Video Reverse Engineer 30-second hard cap invariants", () => {
  it("locks VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC to 30 across every tier", () => {
    expect(VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC).toBe(30);
    for (const tier of ["guest", "free", "pro", "team"] as const) {
      expect(VIDEO_REVERSE_ENGINEER_LIMITS[tier].maxDurationSec).toBe(30);
      expect(VIDEO_REVERSE_ENGINEER_LIMITS[tier].maxBytes).toBeGreaterThan(0);
    }
    expect(VIDEO_REVERSE_ENGINEER_LIMITS.guest.maxBytes).toBeLessThanOrEqual(
      VIDEO_REVERSE_ENGINEER_LIMITS.free.maxBytes,
    );
    expect(VIDEO_REVERSE_ENGINEER_LIMITS.free.maxBytes).toBeLessThanOrEqual(
      VIDEO_REVERSE_ENGINEER_LIMITS.pro.maxBytes,
    );
  });

  it("accepts exact trim boundaries (0..29s start, 1..30s end)", () => {
    expect(
      VideoReverseEngineerInputSchema.safeParse({
        sourceType: "youtube",
        youtubeUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        startOffsetSec: 0,
        endOffsetSec: 30,
      }).success,
    ).toBe(true);

    expect(
      VideoReverseEngineerInputSchema.safeParse({
        sourceType: "upload",
        mimeType: "video/mp4",
        startOffsetSec: 29,
        endOffsetSec: 30,
      }).success,
    ).toBe(true);
  });

  it("accepts sliding 30s windows and rejects windows > 30s, end <= start, negative offsets, and non-finite values", () => {
    expect(
      VideoReverseEngineerInputSchema.safeParse({
        sourceType: "upload",
        startOffsetSec: 5,
        endOffsetSec: 35,
      }).success,
    ).toBe(true);

    expect(
      VideoReverseEngineerInputSchema.safeParse({
        sourceType: "youtube",
        youtubeUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        startOffsetSec: 40,
        endOffsetSec: 46,
      }).success,
    ).toBe(true);

    const overWindow = VideoReverseEngineerInputSchema.safeParse({
      sourceType: "upload",
      startOffsetSec: 5,
      endOffsetSec: 36,
    });
    expect(overWindow.success).toBe(false);
    if (!overWindow.success) {
      expect(overWindow.error.issues[0]?.message).toContain("30s limit");
    }

    const inverted = VideoReverseEngineerInputSchema.safeParse({
      sourceType: "upload",
      startOffsetSec: 12,
      endOffsetSec: 5,
    });
    expect(inverted.success).toBe(false);
    if (!inverted.success) {
      expect(inverted.error.issues[0]?.path).toEqual(["endOffsetSec"]);
      expect(inverted.error.issues[0]?.message).toContain(
        "End time must be greater than start time",
      );
    }

    const invalidCases = [
      { sourceType: "upload", startOffsetSec: 30, endOffsetSec: 30 },
      { sourceType: "upload", startOffsetSec: 0, endOffsetSec: 30.1 },
      { sourceType: "upload", startOffsetSec: 0, endOffsetSec: 31 },
      { sourceType: "upload", startOffsetSec: 5, endOffsetSec: 36 },
      { sourceType: "upload", startOffsetSec: 10, endOffsetSec: 10 },
      { sourceType: "upload", startOffsetSec: -1, endOffsetSec: 10 },
      { sourceType: "upload", startOffsetSec: 0, endOffsetSec: 0 },
      { sourceType: "upload", startOffsetSec: Number.NaN, endOffsetSec: 10 },
      { sourceType: "upload", startOffsetSec: 0, endOffsetSec: Number.POSITIVE_INFINITY },
      { sourceType: "upload", durationSeconds: 3601 },
      { sourceType: "upload", focusNotes: "x".repeat(501) },
    ];

    for (const payload of invalidCases) {
      expect(VideoReverseEngineerInputSchema.safeParse(payload).success).toBe(false);
    }
  });
});

describe("Image & Thumbnail security boundaries", () => {
  it("allows valid PNG, JPEG, and WebP base64 data URLs", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp"]) {
      const res = SafeImageDataUrlSchema.safeParse(`data:${mime};base64,QUJDREVGR0hJSktMTU5PUA==`);
      expect(res.success).toBe(true);
    }
  });

  it("blocks SVG XSS, javascript URLs, non-base64 payloads, and oversized thumbnails", () => {
    const malicious = [
      "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "javascript:alert(1)",
      "https://evil.example/tracker.png",
      "data:image/png;base64,not valid base64!@#",
      `data:image/png;base64,${"A".repeat(150_000)}`,
    ];
    for (const url of malicious) {
      expect(SafeImageDataUrlSchema.safeParse(url).success).toBe(false);
    }
  });

  it("rejects ReverseEngineerInput with data: prefix, too-short payload, or unsupported MIME", () => {
    const validBase64 = "A".repeat(64);
    expect(
      ReverseEngineerInputSchema.safeParse({
        imageBase64: validBase64,
        mimeType: "image/png",
      }).success,
    ).toBe(true);

    expect(
      ReverseEngineerInputSchema.safeParse({
        imageBase64: `data:image/png;base64,${validBase64}`,
        mimeType: "image/png",
      }).success,
    ).toBe(false);

    expect(
      ReverseEngineerInputSchema.safeParse({
        imageBase64: "short",
        mimeType: "image/png",
      }).success,
    ).toBe(false);

    expect(
      ReverseEngineerInputSchema.safeParse({
        imageBase64: validBase64,
        mimeType: "image/svg+xml",
      }).success,
    ).toBe(false);
  });
});

describe("Compose & Refine prompt input guards", () => {
  it("rejects whitespace-only rawInput including tabs, newlines, and non-breaking spaces", () => {
    for (const rawInput of ["", "   ", "\n\t\r", "\u00A0\u2003"]) {
      const result = ComposePromptInputSchema.safeParse({
        interactionId: "int_1",
        draft: { rawInput, mode: "text", modelId: null },
      });
      expect(result.success).toBe(false);
    }
  });

  it("enforces creativity [0, 1] and constraint/guardrail array length caps", () => {
    expect(
      ComposePromptInputSchema.safeParse({
        interactionId: "int_1",
        draft: {
          rawInput: "Write a technical RFC",
          mode: "text",
          modelId: null,
          advanced: { creativity: 1.01 },
        },
      }).success,
    ).toBe(false);

    expect(
      ComposePromptInputSchema.safeParse({
        interactionId: "int_1",
        draft: {
          rawInput: "Write a technical RFC",
          mode: "text",
          modelId: null,
          constraints: Array.from({ length: 16 }, (_, i) => `c${i}`),
        },
      }).success,
    ).toBe(false);

    expect(
      RefinePromptInputSchema.safeParse({
        originalPrompt: "   ",
      }).success,
    ).toBe(false);
  });

  it("enforces checkout seat bounds and rejects free/byok plans from paid checkout", () => {
    expect(
      CheckoutInputSchema.safeParse({ plan: "pro", interval: "monthly", seats: 1 }).success,
    ).toBe(true);
    expect(
      CheckoutInputSchema.safeParse({ plan: "free", interval: "monthly", seats: 1 }).success,
    ).toBe(false);
    expect(
      CheckoutInputSchema.safeParse({ plan: "team", interval: "yearly", seats: 0 }).success,
    ).toBe(false);
    expect(
      CheckoutInputSchema.safeParse({ plan: "team", interval: "yearly", seats: 101 }).success,
    ).toBe(false);
    expect(
      CheckoutInputSchema.safeParse({ plan: "team", interval: "yearly", seats: 2.5 }).success,
    ).toBe(false);
  });
});

describe("Curated catalogs integrity", () => {
  it("validates every template in DEFAULT_CURATED_TEMPLATES with unique URL-safe slugs", () => {
    expect(DEFAULT_CURATED_TEMPLATES.length).toBeGreaterThan(0);
    const slugs = new Set<string>();
    for (const template of DEFAULT_CURATED_TEMPLATES) {
      const parsed = PromptTemplateSchema.safeParse(template);
      expect(parsed.success).toBe(true);
      expect(template.slug).toMatch(/^[a-z0-9-]+$/);
      expect(slugs.has(template.slug)).toBe(false);
      slugs.add(template.slug);
      expect(template.defaultDraft.rawInput.trim().length).toBeGreaterThan(0);
      expect(template.popularityScore).toBeGreaterThan(0);
    }
  });

  it("validates every pricing plan with unique IDs and non-negative yearly <= monthly pricing", () => {
    const ids = new Set<string>();
    for (const plan of DEFAULT_PRICING_PLANS) {
      expect(PricingPlanItemSchema.safeParse(plan).success).toBe(true);
      expect(ids.has(plan.id)).toBe(false);
      ids.add(plan.id);
      expect(plan.yearlyPriceUsd).toBeGreaterThanOrEqual(0);
      expect(plan.yearlyPriceUsd).toBeLessThanOrEqual(plan.monthlyPriceUsd);
      expect(plan.dailyPromptLimit).toBeGreaterThan(0);
    }
  });
});
