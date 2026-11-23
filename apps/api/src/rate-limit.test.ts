import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.js";

describe("createRateLimiter", () => {
  it("allows up to limit requests per window and blocks limit + 1", () => {
    const now = 1_000;
    const allow = createRateLimiter(3, 60_000, () => now);

    expect(allow("ip:1")).toBe(true);
    expect(allow("ip:1")).toBe(true);
    expect(allow("ip:1")).toBe(true);
    expect(allow("ip:1")).toBe(false);
    expect(allow("ip:1")).toBe(false);
  });

  it("resets the window at the exact resetAt boundary (time === resetAt) and not 1ms before", () => {
    let now = 10_000;
    const allow = createRateLimiter(1, 5_000, () => now);

    expect(allow("k")).toBe(true);
    now = 14_999;
    expect(allow("k")).toBe(false);

    // Exact boundary: resetAt === 15_000 <= 15_000 -> window resets
    now = 15_000;
    expect(allow("k")).toBe(true);
    expect(allow("k")).toBe(false);
  });

  it("isolates counters independently per client key", () => {
    const allow = createRateLimiter(1, 60_000, () => 0);
    expect(allow("user-a")).toBe(true);
    expect(allow("user-a")).toBe(false);
    expect(allow("user-b")).toBe(true);
    expect(allow("user-b")).toBe(false);
  });

  it("denies all requests when limit <= 0", () => {
    const allowZero = createRateLimiter(0, 60_000, () => 0);
    const allowNeg = createRateLimiter(-5, 60_000, () => 0);

    expect(allowZero("any")).toBe(false);
    expect(allowNeg("any")).toBe(false);
  });

  it("evicts expired keys once cardinality exceeds 10,000 while keeping active keys enforced", () => {
    let now = 0;
    const allow = createRateLimiter(1, 1_000, () => now);

    // Populate 10,001 keys that will expire at t = 1_000
    for (let i = 0; i <= 10_000; i += 1) {
      expect(allow(`stale-${i}`)).toBe(true);
    }

    // Add one active key at t = 900 (expires at 1_900)
    now = 900;
    expect(allow("active-key")).toBe(true);
    expect(allow("active-key")).toBe(false);

    // Advance to t = 1_500: triggers eviction sweep for expired stale-* keys
    now = 1_500;
    expect(allow("new-key")).toBe(true);

    // active-key must STILL be rate-limited (not evicted before 1_900)
    expect(allow("active-key")).toBe(false);

    // stale-0 was expired and can now make a fresh request
    expect(allow("stale-0")).toBe(true);
  });
});
