import { beforeEach, describe, expect, it, vi } from "vitest";

const { ctorMock, captureExceptionMock, shutdownMock } = vi.hoisted(() => ({
  ctorMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  shutdownMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("posthog-node", () => ({
  PostHog: class MockPostHog {
    constructor(apiKey: string, options: Record<string, unknown>) {
      ctorMock(apiKey, options);
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

describe("API PostHog error tracker", () => {
  beforeEach(() => {
    ctorMock.mockReset();
    captureExceptionMock.mockReset();
    shutdownMock.mockClear();
  });

  it("returns a no-op tracker when apiKey is missing or blank", async () => {
    const tracker = createPostHogErrorTracker({ apiKey: "   " });
    tracker.captureException(new Error("boom"), { requestId: "req_1" });
    await tracker.shutdown();

    expect(ctorMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(shutdownMock).not.toHaveBeenCalled();
  });

  it("initializes PostHog with enableExceptionAutocapture and captures redacted errors", async () => {
    const tracker = createPostHogErrorTracker({
      apiKey: "  phc_api_key  ",
      host: "  https://us.i.posthog.com/  ",
    });

    expect(ctorMock).toHaveBeenCalledWith("phc_api_key", {
      host: "https://us.i.posthog.com",
      enableExceptionAutocapture: true,
    });

    tracker.captureException(new Error("Failed with sk-1234567890abcdefghijklmnop"), {
      requestId: "req_123",
      path: "/rpc/compose",
      method: "POST",
      status: 500,
      source: "rpc.error",
    });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [capturedErr, captureOptions] = captureExceptionMock.mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(capturedErr).toBeInstanceOf(Error);
    expect(capturedErr.message).not.toContain("sk-1234567890abcdefghijklmnop");
    expect(captureOptions).toEqual({
      properties: {
        requestId: "req_123",
        path: "/rpc/compose",
        method: "POST",
        status: 500,
        source: "rpc.error",
      },
    });

    await tracker.shutdown();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });
});
