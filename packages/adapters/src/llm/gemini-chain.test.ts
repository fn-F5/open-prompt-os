import { describe, expect, it } from "vitest";
import {
  geminiModelChain,
  isDailyQuotaExhaustionError,
  isRecoverableModelError,
  resetGeminiFallbackState,
} from "./gemini-chain.js";

describe("gemini model fallback", () => {
  it("puts a requested tier first and then the rest of the chain", () => {
    expect(geminiModelChain("gemini-3.8-flash")[0]).toBe("gemini-3.8-flash");
    expect(geminiModelChain("gemini-3.8-flash")).toContain("gemini-3.6-flash");
    expect(geminiModelChain("claude-3-7-sonnet")[0]).toBe("gemini-3.6-flash");
  });

  it("treats a daily quota error as recoverable and a short retry as rate limit only", () => {
    resetGeminiFallbackState();
    const daily = new Error(
      '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}',
    );
    expect(isDailyQuotaExhaustionError(daily)).toBe(true);
    expect(isRecoverableModelError(daily)).toBe(true);
    const perMinute = Object.assign(new Error("Quota exceeded, retry in 12s"), { status: 429 });
    expect(isDailyQuotaExhaustionError(perMinute)).toBe(false);
    expect(isRecoverableModelError(perMinute)).toBe(true);
    expect(isRecoverableModelError(new Error("invalid argument"))).toBe(false);
  });
});
