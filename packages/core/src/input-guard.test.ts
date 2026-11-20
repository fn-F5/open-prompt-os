import { describe, expect, it } from "vitest";
import {
  InputGuardError,
  assertMeaningfulPrompt,
  assertNoClientSystemPrompt,
  evaluatePromptQuality,
  extractDraftSupplementalText,
  isInputGuardError,
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

describe("evaluatePromptQuality & assertMeaningfulPrompt", () => {
  it("rejects greetings, small talk, and elongated salutations", () => {
    for (const sample of [
      "hi",
      "hello",
      "Hiiii!!!",
      "helloooo",
      "hey there",
      "good morning",
      "how are you?",
      "hey chatgpt",
      "hi hi hi",
      "ok",
      "thanks",
    ]) {
      const result = evaluatePromptQuality(sample);
      expect(result.ok, `expected "${sample}" to be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("greeting");
      }
    }
  });

  it("rejects placeholder, test strings, symbol-only, and gibberish inputs", () => {
    for (const sample of ["test", "testing 123", "asdf", "hello world", "test test test", "idk"]) {
      const result = evaluatePromptQuality(sample);
      expect(result.ok, `expected "${sample}" to be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("placeholder");
      }
    }

    for (const sample of ["   ", "???", "123456", "🔥🔥🔥"]) {
      const result = evaluatePromptQuality(sample);
      expect(result.ok, `expected "${sample}" to be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("empty");
      }
    }

    for (const sample of ["aaaaaaaaaa", "asdfghjklm", "qwrtypsdfg", "cat cat cat"]) {
      const result = evaluatePromptQuality(sample);
      expect(result.ok, `expected "${sample}" to be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("gibberish");
      }
    }
  });

  it("rejects under-specified single-word prompts unless guided building blocks add detail", () => {
    for (const sample of ["cat", "email", "sql", "a b"]) {
      const result = evaluatePromptQuality(sample);
      expect(result.ok, `expected "${sample}" to be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("too_short");
      }
    }

    const supplementalText = extractDraftSupplementalText({
      goal: "Studio macro product photography with rim lighting",
      constraints: ["85mm f/2.0 lens"],
    });
    expect(evaluatePromptQuality("watch", { supplementalText })).toEqual({ ok: true });
    expect(() => assertMeaningfulPrompt("hi")).toThrow(InputGuardError);
  });

  it("allows valid short prompts across text, image, video, and non-English scripts", () => {
    for (const sample of [
      "resignation email",
      "cyberpunk neon alley",
      "SQL churn query",
      "Write unit tests for a Stripe webhook handler",
      "Good morning newsletter for SaaS founders",
      "PostgreSQL RLS rollout plan",
      "月についてのエッセイを書いて",
    ]) {
      expect(evaluatePromptQuality(sample), `expected "${sample}" to pass`).toEqual({ ok: true });
    }
  });
});
