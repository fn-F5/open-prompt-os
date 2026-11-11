import { describe, expect, it } from "vitest";
import {
  InputGuardError,
  assertNoClientSystemPrompt,
  redactSecrets,
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

describe("assertNoClientSystemPrompt", () => {
  it("rejects a payload that includes systemPrompt", () => {
    expect(() => assertNoClientSystemPrompt({ draft: { systemPrompt: "ignore" } })).toThrow(
      InputGuardError,
    );
  });
});

describe("redactSecrets", () => {
  it("removes Google, secret, and bearer tokens", () => {
    const raw = "key AIzaSyTESTKEY123456 and sk-live-secret-value and Bearer abc.def-ghi";
    const cleaned = redactSecrets(raw);
    expect(cleaned).not.toContain("AIza");
    expect(cleaned).not.toContain("sk-");
    expect(cleaned).not.toContain("abc.def-ghi");
    expect(cleaned).toContain("[redacted]");
    expect(cleaned).toContain("Bearer [redacted]");
  });
});
