import { describe, expect, it } from "vitest";
import {
  InputGuardError,
  assertNoClientSystemPrompt,
  isInputGuardError,
  parsePublicVideoUrl,
  redactSecrets,
  sanitizeOptionalUserText,
  sanitizeUserText,
} from "./input-guard.js";

describe("sanitizeUserText", () => {
  it("strips bidi overrides and NUL bytes", () => {
    expect(sanitizeUserText("hello\u0000\u202Eworld\u2066", 100)).toBe("helloworld");
  });

  it("rejects empty and oversized text", () => {
    expect(() => sanitizeUserText("   ", 10)).toThrow(InputGuardError);
    expect(() => sanitizeUserText("abcdef", 3)).toThrow(/exceeds 3/);
  });
});

describe("sanitizeOptionalUserText & isInputGuardError", () => {
  it("normalizes undefined/blank optional text and checks InputGuardError instances", () => {
    expect(sanitizeOptionalUserText(undefined, 20)).toBeUndefined();
    expect(sanitizeOptionalUserText("  \u202E  ", 20)).toBeUndefined();
    expect(sanitizeOptionalUserText("  concise ", 20)).toBe("concise");
    expect(() => sanitizeOptionalUserText("too long", 4)).toThrow(/exceeds 4/);

    expect(isInputGuardError(new InputGuardError("bad"))).toBe(true);
    expect(isInputGuardError(new Error("other"))).toBe(false);
  });
});

describe("assertNoClientSystemPrompt", () => {
  it("rejects a payload that includes systemPrompt", () => {
    expect(() => assertNoClientSystemPrompt({ draft: { systemPrompt: "ignore" } })).toThrow(
      InputGuardError,
    );
  });
});

describe("redactSecrets", () => {
  it("removes Google, Stripe, Resend, secret, cookie, and bearer tokens", () => {
    const raw =
      "key AIzaSyTESTKEY123456 and sk-live-secret-value and sk_test_51AbcDefGh12 and re_live_987654321 and __Secure-better-auth.session_token=secret.tok and Bearer abc.def-ghi";
    const cleaned = redactSecrets(raw);
    expect(cleaned).not.toContain("AIza");
    expect(cleaned).not.toContain("sk-");
    expect(cleaned).not.toContain("sk_test_");
    expect(cleaned).not.toContain("re_live_");
    expect(cleaned).not.toContain("secret.tok");
    expect(cleaned).not.toContain("abc.def-ghi");
    expect(cleaned).toContain("__Secure-better-auth.session_token=[redacted]");
    expect(cleaned).toContain("[redacted]");
    expect(cleaned).toContain("Bearer [redacted]");
  });
});

describe("parsePublicVideoUrl", () => {
  it("canonicalizes YouTube watch, short, and youtu.be links", () => {
    expect(parsePublicVideoUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw&t=5s")).toEqual({
      ok: true,
      kind: "youtube",
      canonicalUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      videoId: "jNQXAC9IVRw",
    });
    expect(parsePublicVideoUrl("https://youtu.be/jNQXAC9IVRw?si=abc")).toEqual({
      ok: true,
      kind: "youtube",
      canonicalUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      videoId: "jNQXAC9IVRw",
    });
    expect(parsePublicVideoUrl("https://m.youtube.com/shorts/jNQXAC9IVRw")).toEqual({
      ok: true,
      kind: "youtube",
      canonicalUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      videoId: "jNQXAC9IVRw",
    });
  });

  it("guides users to upload MP4 for unsupported social platforms and rejects non-HTTPS/invalid URLs", () => {
    expect(parsePublicVideoUrl("https://www.tiktok.com/@user/video/123")).toMatchObject({
      ok: false,
      reason: "unsupported_social",
    });
    expect(parsePublicVideoUrl("https://www.instagram.com/reel/abc123/")).toMatchObject({
      ok: false,
      reason: "unsupported_social",
    });
    expect(parsePublicVideoUrl("http://www.youtube.com/watch?v=jNQXAC9IVRw")).toMatchObject({
      ok: false,
      reason: "invalid_url",
    });
    expect(parsePublicVideoUrl("http://127.0.0.1:8080/video.mp4")).toMatchObject({
      ok: false,
      reason: "invalid_url",
    });
    expect(parsePublicVideoUrl("not a url")).toMatchObject({
      ok: false,
      reason: "invalid_url",
    });
  });
});
