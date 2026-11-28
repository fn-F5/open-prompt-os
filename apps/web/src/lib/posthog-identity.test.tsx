import type { AuthenticatedUser } from "@open-prompt-os/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { initMock, captureMock, captureExceptionMock, identifyMock, resetMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  captureMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  identifyMock: vi.fn(),
  resetMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    init: initMock,
    capture: captureMock,
    captureException: captureExceptionMock,
    identify: identifyMock,
    reset: resetMock,
  },
}));

import { AppRoutes } from "../app-routes.js";
import { authClient, setAuthSessionForTest } from "./auth-client.js";
import { identifyPostHogUser, resetPostHogForTest, syncPostHogIdentity } from "./posthog.js";
import { createAppQueryClient } from "./query-client.js";

const SAMPLE_USER: AuthenticatedUser = {
  id: "usr_db_123",
  email: "pii@example.com",
  name: "Jane Doe",
  spaceId: "sp_1",
  spaceName: "Personal Space",
  plan: "pro",
  hasPasskey: true,
};

describe("PostHog DB user ID identity mapping", () => {
  beforeEach(() => {
    initMock.mockReset();
    captureMock.mockReset();
    captureExceptionMock.mockReset();
    identifyMock.mockReset();
    resetMock.mockReset();
    setAuthSessionForTest(null);
    resetPostHogForTest();
    vi.stubEnv("POSTHOG_KEY", "phc_test_key_123");
    vi.stubEnv("POSTHOG_HOST", "https://us.i.posthog.com");
  });

  afterEach(() => {
    setAuthSessionForTest(null);
    resetPostHogForTest();
    vi.unstubAllEnvs();
  });

  it("maps distinctId to db_user_id and strips forbidden PII keys", () => {
    expect(
      identifyPostHogUser("usr_db_123", {
        space_id: "sp_1",
        plan: "pro",
        email: "pii@example.com",
        apiKey: "sk-123",
      }),
    ).toBe(true);

    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).toHaveBeenCalledWith("usr_db_123", {
      db_user_id: "usr_db_123",
      space_id: "sp_1",
      plan: "pro",
    });
  });

  it("deduplicates identical identity calls and re-identifies when person properties change", () => {
    expect(
      identifyPostHogUser("usr_db_123", {
        space_id: "sp_1",
        plan: "free",
      }),
    ).toBe(true);
    expect(
      identifyPostHogUser("usr_db_123", {
        plan: "free",
        space_id: "sp_1",
      }),
    ).toBe(true);
    expect(
      syncPostHogIdentity({
        id: "usr_db_123",
        spaceId: "sp_1",
        plan: "free",
      }),
    ).toBe(true);

    expect(identifyMock).toHaveBeenCalledTimes(1);

    expect(
      syncPostHogIdentity({
        id: "usr_db_123",
        spaceId: "sp_1",
        plan: "pro",
      }),
    ).toBe(true);

    expect(identifyMock).toHaveBeenCalledTimes(2);
    expect(identifyMock).toHaveBeenLastCalledWith("usr_db_123", {
      db_user_id: "usr_db_123",
      space_id: "sp_1",
      plan: "pro",
    });
  });

  it("identifies immediately on setAuthSessionForTest without PII and resets on signOut", async () => {
    setAuthSessionForTest(SAMPLE_USER);

    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).toHaveBeenCalledWith("usr_db_123", {
      db_user_id: "usr_db_123",
      space_id: "sp_1",
      plan: "pro",
      has_passkey: true,
    });
    const [, identifiedProps] = identifyMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(identifiedProps).not.toHaveProperty("email");
    expect(identifiedProps).not.toHaveProperty("name");

    await authClient.signOut();
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("identifies authenticated session on AppRoutes render and resets when signed out", async () => {
    setAuthSessionForTest(SAMPLE_USER);
    identifyMock.mockClear();
    resetMock.mockClear();
    // Simulate a fresh mount where PostHog hasn't identified yet in this lifecycle
    resetPostHogForTest();

    const queryClient = createAppQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(identifyMock).toHaveBeenCalledWith("usr_db_123", {
        db_user_id: "usr_db_123",
        space_id: "sp_1",
        plan: "pro",
        has_passkey: true,
      });
    });

    await act(async () => {
      await authClient.signOut();
    });

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledTimes(1);
    });
  });
});
