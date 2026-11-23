import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import * as React from "react";
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
import {
  capturePostHogEvent,
  capturePostHogException,
  initPostHog,
  resetPostHogForTest,
  resolvePostHogConfig,
} from "./posthog.js";
import { createAppQueryClient } from "./query-client.js";

describe("PostHog client integration", () => {
  beforeEach(() => {
    initMock.mockReset();
    captureMock.mockReset();
    captureExceptionMock.mockReset();
    resetPostHogForTest();
    vi.stubEnv("POSTHOG_KEY", "");
    vi.stubEnv("POSTHOG_HOST", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays disabled when POSTHOG_KEY is unset or blank", () => {
    vi.stubEnv("POSTHOG_KEY", "   ");

    expect(resolvePostHogConfig()).toBeNull();
    expect(initPostHog()).toBe(false);
    expect(capturePostHogEvent("landing_page_loaded")).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("initializes once with configured key and default ingestion host", () => {
    vi.stubEnv("POSTHOG_KEY", "  phc_test_key_123  ");

    expect(resolvePostHogConfig()).toEqual({
      apiKey: "phc_test_key_123",
      apiHost: "https://us.i.posthog.com",
    });

    expect(initPostHog()).toBe(true);
    expect(initPostHog()).toBe(true);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith("phc_test_key_123", {
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
      autocapture: false,
      capture_exceptions: true,
    });
  });

  it("uses trimmed POSTHOG_HOST and strips trailing slashes", () => {
    vi.stubEnv("POSTHOG_KEY", "phc_test_key_123");
    vi.stubEnv("POSTHOG_HOST", "  https://us.i.posthog.com/  ");

    expect(resolvePostHogConfig()).toEqual({
      apiKey: "phc_test_key_123",
      apiHost: "https://us.i.posthog.com",
    });
  });

  it("captures sanitized events and strips forbidden telemetry keys", () => {
    vi.stubEnv("POSTHOG_KEY", "phc_test_key_123");

    expect(
      capturePostHogEvent("landing_page_loaded", {
        source: "web",
        email: "user@example.com",
        apiKey: "secret",
      }),
    ).toBe(true);

    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith("landing_page_loaded", {
      source: "web",
    });
  });

  it("captures sanitized exceptions when PostHog is enabled and no-ops when disabled", () => {
    const err = new Error("Boom");
    expect(capturePostHogException(err, { source: "route_error_boundary" })).toBe(false);
    expect(captureExceptionMock).not.toHaveBeenCalled();

    vi.stubEnv("POSTHOG_KEY", "phc_test_key_123");
    expect(
      capturePostHogException(err, {
        source: "route_error_boundary",
        apiKey: "secret",
        email: "user@example.com",
      }),
    ).toBe(true);

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(err, {
      source: "route_error_boundary",
    });
  });

  it("captures landing_page_loaded once when the landing page mounts", async () => {
    vi.stubEnv("POSTHOG_KEY", "phc_test_key_123");
    vi.stubEnv("POSTHOG_HOST", "https://us.i.posthog.com");

    const queryClient = createAppQueryClient();
    render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/"]}>
            <AppRoutes />
          </MemoryRouter>
        </QueryClientProvider>
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(captureMock).toHaveBeenCalledWith("landing_page_loaded", {});
    });
    expect(captureMock.mock.calls.filter(([name]) => name === "landing_page_loaded")).toHaveLength(
      1,
    );
  });
});
