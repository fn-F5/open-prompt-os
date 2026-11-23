import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@open-prompt-os/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@open-prompt-os/db")>();
  const dbDown = () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:5433"));
  return {
    ...actual,
    runAsTenant: vi.fn(dbDown),
    runAsSystem: vi.fn(dbDown),
    prisma: {
      ...actual.prisma,
      space: {
        ...actual.prisma.space,
        findUnique: vi.fn(dbDown),
      },
      planLimit: {
        ...actual.prisma.planLimit,
        findUnique: vi.fn(dbDown),
      },
    },
  };
});

import { checkQuota, reserveQuota } from "./services/usage-quota.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("usage-quota fail-closed behavior", () => {
  const guestActor = {
    clientKey: "198.51.100.99",
    hashedClientKey: "hashed_quota_fail_closed_test",
  };

  it("fails closed in production when the quota database cannot be reached", async () => {
    process.env.NODE_ENV = "production";

    await expect(checkQuota(guestActor, "compose")).rejects.toThrow(
      /Quota storage is temporarily unavailable/i,
    );
    await expect(reserveQuota(guestActor, "compose")).rejects.toThrow(
      /Quota storage is temporarily unavailable/i,
    );
  });

  it("keeps graceful offline fallback in test environment when DB is unreachable", async () => {
    process.env.NODE_ENV = "test";

    const check = await checkQuota(guestActor, "compose");
    expect(check.allowed).toBe(true);

    const reserved = await reserveQuota(guestActor, "compose");
    expect(reserved.allowed).toBe(true);
    expect(reserved.reserved).toBe(false);
  });
});
