import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { isValidAnalyticsEventName, trackAnalyticsEvent } from "./analytics-events.js";
import { installClickAnalytics } from "./click-tracker.js";
import { resetPostHogForTest } from "./posthog.js";
import { createAppQueryClient } from "./query-client.js";

describe("Analytics event schema & navigation/button tracking", () => {
  let uninstallClickAnalytics: (() => void) | undefined;

  beforeEach(() => {
    initMock.mockReset();
    captureMock.mockReset();
    captureExceptionMock.mockReset();
    identifyMock.mockReset();
    resetMock.mockReset();
    resetPostHogForTest();
    vi.stubEnv("POSTHOG_KEY", "phc_test_key_123");
    vi.stubEnv("POSTHOG_HOST", "https://us.i.posthog.com");
    uninstallClickAnalytics = installClickAnalytics();
  });

  afterEach(() => {
    uninstallClickAnalytics?.();
    vi.unstubAllEnvs();
  });

  it("validates category:object_action lowercase snake_case naming", () => {
    expect(isValidAnalyticsEventName("navigation:nav_link_click")).toBe(true);
    expect(isValidAnalyticsEventName("account_settings:forgot_password_button_click")).toBe(true);
    expect(isValidAnalyticsEventName("Create Account")).toBe(false);
    expect(isValidAnalyticsEventName("user_sign_up")).toBe(false);
    expect(isValidAnalyticsEventName("navigation:nav_link_clicked")).toBe(false);
  });

  it("tracks explicit navigation and button clicks without double-firing", async () => {
    const queryClient = createAppQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(captureMock).toHaveBeenCalledWith("navigation:route_view", {
        route_path: "/",
        is_authenticated: false,
      });
    });

    captureMock.mockClear();

    const templatesLinks = screen.getAllByRole("link", { name: "Templates" });
    fireEvent.click(templatesLinks[0] as HTMLElement);

    expect(captureMock).toHaveBeenCalledWith("navigation:nav_link_click", {
      link_name: "templates",
      target_path: "/templates",
      nav_surface: "marketing_navbar",
      is_authenticated: false,
    });
    expect(
      captureMock.mock.calls.filter(([name]) => name === "navigation:nav_link_click"),
    ).toHaveLength(1);

    captureMock.mockClear();

    const signInButton = screen.getAllByRole("button", { name: "Sign In" })[0] as HTMLElement;
    fireEvent.click(signInButton);

    expect(captureMock).toHaveBeenCalledWith("auth:sign_in_button_click", {
      source: "navbar",
      auth_mode: "signin",
    });
    expect(captureMock.mock.calls.some(([name]) => name === "ui:button_click")).toBe(false);
  });

  it("tracks unannotated buttons and links via delegated click tracker", () => {
    render(
      <div>
        <button type="button" aria-label="Export JSON">
          Export
        </button>
        <a href="/docs/prompt-autopsy-and-debugging">Autopsy Guide</a>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(captureMock).toHaveBeenCalledWith("ui:button_click", {
      button_name: "export_json",
      button_type: "button",
      route_path: "/",
    });

    fireEvent.click(screen.getByRole("link", { name: "Autopsy Guide" }));
    expect(captureMock).toHaveBeenCalledWith("navigation:nav_link_click", {
      link_name: "docs_prompt_autopsy_and_debugging",
      target_path: "/docs/prompt_autopsy_and_debugging".replace(/_/g, "-"),
      nav_surface: "/",
      is_external: false,
    });
  });

  it("strips forbidden PII properties from tracked analytics events", () => {
    trackAnalyticsEvent("auth:auth_form_submit", {
      auth_mode: "signup",
      email: "secret@example.com",
      apiKey: "sk-12345",
    });

    expect(captureMock).toHaveBeenCalledWith("auth:auth_form_submit", {
      auth_mode: "signup",
    });
  });
});
