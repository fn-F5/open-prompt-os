import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import { describe, expect, it } from "vitest";
import { toUserFacingServerError } from "./errors.js";

describe("toUserFacingServerError", () => {
  it("maps raw Gemini 429 RESOURCE_EXHAUSTED JSON to a friendly high-traffic message", () => {
    const rawGeminiError = new Error(
      '{"error":{"message":"{\\n \\"error\\": {\\n \\"code\\": 429, \\"status\\": \\"RESOURCE_EXHAUSTED\\" }}"}}',
    );
    const result = toUserFacingServerError(rawGeminiError);
    expect(result.code).toBe("PROVIDER_UNAVAILABLE");
    expect(result.message).toMatch(/high traffic/i);
    expect(result.message).not.toContain("RESOURCE_EXHAUSTED");
    expect(result.message).not.toContain("429");
  });

  it("maps LlmProviderError provider 429 and timeout to high-traffic message", () => {
    expect(toUserFacingServerError(new LlmProviderError("provider_error", "429 quota"))).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      message: "We're experiencing high traffic right now. Please try again in a moment.",
    });
    expect(toUserFacingServerError(new LlmProviderError("timeout", "aborted"))).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      message: "We're experiencing high traffic right now. Please try again in a moment.",
    });
  });

  it("hides internal DB/network errors behind a friendly temporary issue message", () => {
    const dbError = new Error("connect EPERM 127.0.0.1:5433");
    const result = toUserFacingServerError(dbError);
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).toMatch(/temporary issue/i);
    expect(result.message).not.toContain("127.0.0.1");
    expect(result.message).not.toContain("EPERM");
  });
});
