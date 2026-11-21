import { describe, expect, it } from "vitest";
import {
  geminiModelChain,
  isDailyQuotaExhaustionError,
  isRecoverableModelError,
  resetGeminiFallbackState,
} from "./gemini-chain.js";

describe("gemini model fallback", () => {
  it("returns only a single model without fallbacks", () => {
    expect(geminiModelChain("gemini-4-hydrogen")).toEqual(["gemini-4-hydrogen"]);
    expect(geminiModelChain("gemini-4-custom")).toEqual(["gemini-4-custom"]);
    expect(geminiModelChain("claude-3-7-sonnet")).toEqual(["gemini-4-hydrogen"]);
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
