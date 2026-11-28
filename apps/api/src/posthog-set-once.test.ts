import { beforeEach, describe, expect, it, vi } from "vitest";

const { ctorMock, captureMock, identifyMock, captureExceptionMock, shutdownMock } = vi.hoisted(
  () => ({
    ctorMock: vi.fn(),
    captureMock: vi.fn(),
    identifyMock: vi.fn(),
    captureExceptionMock: vi.fn(),
    shutdownMock: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("posthog-node", () => ({
  PostHog: class MockPostHog {
    constructor(apiKey: string, options: Record<string, unknown>) {
      ctorMock(apiKey, options);
    }

    capture(payload: Record<string, unknown>) {
      captureMock(payload);
    }

    identify(payload: Record<string, unknown>) {
      identifyMock(payload);
    }

    captureException(error: unknown, options?: Record<string, unknown>) {
      captureExceptionMock(error, options);
    }

    shutdown() {
      return shutdownMock();
    }
  },
}));

import { createPostHogErrorTracker } from "./posthog.js";

describe("API PostHog identifyUser $set_once support", () => {
  beforeEach(() => {
    ctorMock.mockReset();
    captureMock.mockReset();
    identifyMock.mockReset();
    captureExceptionMock.mockReset();
    shutdownMock.mockClear();
  });

  it("sends sanitized $set_once alongside $set, strips forbidden PII/prompt keys, and redacts secrets", () => {
    const tracker = createPostHogErrorTracker({ apiKey: "phc_test_key" });

    tracker.identifyUser?.({
      distinctId: "  usr_db_123  ",
      spaceId: "  spc_db_456  ",
      plan: "pro",
      setOnce: {
        self_reported_referral_source: "github_or_open_source",
        first_utm_source: "producthunt",
        email: "user@example.com",
        rawInput: "secret prompt",
        apiKey: "sk-1234567890abcdefghijklmnop",
        referralDetail: "Private detail",
        note: "Contains sk-1234567890abcdefghijklmnop token",
        ignoredUndefined: undefined,
      },
    });

    expect(identifyMock).toHaveBeenCalledTimes(1);
    const [payload] = identifyMock.mock.calls[0] as [
      {
        distinctId: string;
        properties: {
          $set: Record<string, unknown>;
          $set_once?: Record<string, unknown>;
        };
      },
    ];

    expect(payload.distinctId).toBe("usr_db_123");
    expect(payload.properties.$set).toEqual({
      db_user_id: "usr_db_123",
      space_id: "spc_db_456",
      plan: "pro",
    });
    expect(payload.properties.$set_once).toBeDefined();
    expect(payload.properties.$set_once?.self_reported_referral_source).toBe(
      "github_or_open_source",
    );
    expect(payload.properties.$set_once?.first_utm_source).toBe("producthunt");
    expect(payload.properties.$set_once?.note).not.toContain("sk-1234567890abcdefghijklmnop");

    for (const forbiddenKey of [
      "email",
      "rawInput",
      "apiKey",
      "referralDetail",
      "ignoredUndefined",
    ]) {
      expect(payload.properties.$set_once).not.toHaveProperty(forbiddenKey);
    }
  });

  it("omits $set_once when setOnce is omitted or contains only forbidden/undefined keys", () => {
    const tracker = createPostHogErrorTracker({ apiKey: "phc_test_key" });

    tracker.identifyUser?.({
      distinctId: "usr_db_123",
      spaceId: "spc_db_456",
      plan: "free",
    });

    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).toHaveBeenLastCalledWith({
      distinctId: "usr_db_123",
      properties: {
        $set: {
          db_user_id: "usr_db_123",
          space_id: "spc_db_456",
          plan: "free",
        },
      },
    });

    tracker.identifyUser?.({
      distinctId: "usr_db_123",
      spaceId: "spc_db_456",
      plan: "free",
      setOnce: {
        email: "user@example.com",
        ignoredUndefined: undefined,
      },
    });

    expect(identifyMock).toHaveBeenCalledTimes(2);
    expect(identifyMock).toHaveBeenLastCalledWith({
      distinctId: "usr_db_123",
      properties: {
        $set: {
          db_user_id: "usr_db_123",
          space_id: "spc_db_456",
          plan: "free",
        },
      },
    });
  });
});
