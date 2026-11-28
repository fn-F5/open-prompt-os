import type { AuthenticatedUser } from "@open-prompt-os/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
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
  FIRST_TOUCH_ATTRIBUTION_STORAGE_KEY,
  captureFirstTouchAttribution,
  classifyAcquisitionChannel,
  clearFirstTouchAttributionForTest,
  getFirstTouchAttribution,
  parseExternalReferrer,
  sanitizeAcquisitionValue,
  toFirstTouchEventProperties,
  toPostHogSetOnceProperties,
} from "./acquisition.js";
import { setAuthSessionForTest } from "./auth-client.js";
import { orpcClient, resetOrpcTestState } from "./orpc.js";
import { identifyPostHogUser, resetPostHogForTest, syncPostHogIdentity } from "./posthog.js";
import { createAppQueryClient } from "./query-client.js";
import { recordSignupReferral } from "./signup-referral.js";
import { clearStorageForTest, safeSetItem } from "./storage.js";

const SAMPLE_USER: AuthenticatedUser = {
  id: "usr_acq_123",
  email: "founder@example.com",
  name: "Founder",
  spaceId: "spc_acq_123",
  spaceName: "Founder Space",
  plan: "free",
  hasPasskey: false,
};

describe("First-touch acquisition capture & PostHog $set_once", () => {
  beforeEach(() => {
    initMock.mockReset();
    captureMock.mockReset();
    captureExceptionMock.mockReset();
    identifyMock.mockReset();
    resetMock.mockReset();
    clearStorageForTest();
    clearFirstTouchAttributionForTest();
    resetOrpcTestState();
    setAuthSessionForTest(null);
    resetPostHogForTest();
    vi.stubEnv("POSTHOG_KEY", "phc_test_key_123");
    vi.stubEnv("POSTHOG_HOST", "https://us.i.posthog.com");
  });

  afterEach(() => {
    clearFirstTouchAttributionForTest();
    clearStorageForTest();
    setAuthSessionForTest(null);
    resetPostHogForTest();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("captures UTMs, ?ref=, landing_path without query/hash, and strips query/hash from external referrer", () => {
    const captured = captureFirstTouchAttribution({
      url: "https://openpromptos.com/templates/code-review?utm_source=producthunt&utm_medium=referral&utm_campaign=launch_2026&utm_term=prompt_os&utm_content=hero_cta&ref=ph_badge&token=secret_query#section",
      referrer: "https://www.ProductHunt.com/posts/open-prompt-os?ref=top&secret=123#comments",
      now: new Date("2026-11-28T08:00:00.000Z"),
    });

    expect(captured).toEqual({
      utm_source: "producthunt",
      utm_medium: "referral",
      utm_campaign: "launch_2026",
      utm_term: "prompt_os",
      utm_content: "hero_cta",
      ref: "ph_badge",
      referrer: "https://www.producthunt.com/posts/open-prompt-os",
      referring_domain: "producthunt.com",
      landing_path: "/templates/code-review",
      channel: "referral",
      captured_at: "2026-11-28T08:00:00.000Z",
    });
    expect(getFirstTouchAttribution()).toEqual(captured);
  });

  it("enforces strict first-touch immutability and ignores malformed stored JSON", () => {
    safeSetItem(FIRST_TOUCH_ATTRIBUTION_STORAGE_KEY, "{not-valid-json");
    expect(getFirstTouchAttribution()).toBeNull();

    const first = captureFirstTouchAttribution({
      url: "https://openpromptos.com/?utm_source=newsletter&utm_medium=email",
      referrer: "",
      now: new Date("2026-11-28T08:00:00.000Z"),
    });
    const second = captureFirstTouchAttribution({
      url: "https://openpromptos.com/pricing?utm_source=google&utm_medium=cpc",
      referrer: "https://google.com/search?q=prompt",
      now: new Date("2026-11-28T09:00:00.000Z"),
    });

    expect(second).toEqual(first);
    expect(getFirstTouchAttribution()).toEqual(first);
  });

  it("ignores self-referrals, www variants, non-http protocols, and OAuth redirect hosts", () => {
    expect(
      parseExternalReferrer(
        "https://openpromptos.com/pricing?plan=pro",
        "https://openpromptos.com/",
      ),
    ).toEqual({ referrer: "$direct", referring_domain: "$direct" });

    expect(
      parseExternalReferrer("https://www.openpromptos.com/templates", "https://openpromptos.com/"),
    ).toEqual({ referrer: "$direct", referring_domain: "$direct" });

    for (const oauthHost of [
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=123",
      "https://appleid.apple.com/auth/authorize?state=abc",
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    ]) {
      expect(parseExternalReferrer(oauthHost, "https://openpromptos.com/")).toEqual({
        referrer: "$direct",
        referring_domain: "$direct",
      });
    }

    expect(parseExternalReferrer("javascript:alert(1)", "https://openpromptos.com/")).toEqual({
      referrer: "$direct",
      referring_domain: "$direct",
    });
  });

  it("sanitizes values, caps length at 120 chars, and drops emails and API secrets", () => {
    expect(sanitizeAcquisitionValue("  hello\n\tworld\u0007  ")).toBe("hello world");
    expect(sanitizeAcquisitionValue("   \n\t  ")).toBeUndefined();
    expect(sanitizeAcquisitionValue("alice@example.com")).toBeUndefined();
    expect(sanitizeAcquisitionValue("sk-1234567890abcdef")).toBeUndefined();
    expect(sanitizeAcquisitionValue("pk_live_12345")).toBeUndefined();
    expect(sanitizeAcquisitionValue("phc_project_key")).toBeUndefined();
    expect(sanitizeAcquisitionValue("ghp_secret_token")).toBeUndefined();
    expect(sanitizeAcquisitionValue("gho_oauth_token")).toBeUndefined();
    expect(sanitizeAcquisitionValue("AIzaSyDummyKey123")).toBeUndefined();
    expect(sanitizeAcquisitionValue("whsec_signing_secret")).toBeUndefined();
    expect(sanitizeAcquisitionValue("re_resend_secret")).toBeUndefined();
    expect(sanitizeAcquisitionValue("Bearer super-secret-jwt")).toBeUndefined();

    const longVal = "a".repeat(160);
    expect(sanitizeAcquisitionValue(longVal)).toHaveLength(120);

    const captured = captureFirstTouchAttribution({
      url: "https://openpromptos.com/?utm_source=user@example.com&utm_campaign=sk-secret123&utm_content=Bearer%20tok&ref=clean_ref",
      referrer: "",
    });
    expect(captured?.utm_source).toBeUndefined();
    expect(captured?.utm_campaign).toBeUndefined();
    expect(captured?.utm_content).toBeUndefined();
    expect(captured?.ref).toBe("clean_ref");
  });

  it("classifies all acquisition channels accurately", () => {
    expect(classifyAcquisitionChannel({ utm_medium: "cpc" })).toBe("paid");
    expect(classifyAcquisitionChannel({ utm_medium: "paid_social" })).toBe("paid");
    expect(classifyAcquisitionChannel({ utm_medium: "email" })).toBe("email");
    expect(classifyAcquisitionChannel({ utm_source: "newsletter" })).toBe("email");
    expect(classifyAcquisitionChannel({ utm_medium: "organic_social" })).toBe("organic_social");
    expect(classifyAcquisitionChannel({ utm_medium: "referral" })).toBe("referral");
    expect(classifyAcquisitionChannel({ utm_campaign: "spring_drop" })).toBe("campaign");

    for (const aiHost of [
      "chatgpt.com",
      "chat.openai.com",
      "claude.ai",
      "perplexity.ai",
      "gemini.google.com",
      "copilot.microsoft.com",
    ]) {
      expect(classifyAcquisitionChannel({ referring_domain: aiHost })).toBe("ai_search");
    }

    for (const searchHost of [
      "google.com",
      "google.co.uk",
      "bing.com",
      "duckduckgo.com",
      "search.yahoo.com",
      "baidu.com",
      "yandex.ru",
      "ecosia.org",
      "kagi.com",
      "search.brave.com",
    ]) {
      expect(classifyAcquisitionChannel({ referring_domain: searchHost })).toBe("organic_search");
    }

    for (const socialHost of [
      "t.co",
      "x.com",
      "twitter.com",
      "linkedin.com",
      "reddit.com",
      "news.ycombinator.com",
      "youtube.com",
      "facebook.com",
      "instagram.com",
      "threads.net",
      "bsky.app",
      "producthunt.com",
    ]) {
      expect(classifyAcquisitionChannel({ referring_domain: socialHost })).toBe("organic_social");
    }

    expect(classifyAcquisitionChannel({ referring_domain: "partner-blog.dev" })).toBe("referral");
    expect(classifyAcquisitionChannel({ ref: "friend_invite", referring_domain: "$direct" })).toBe(
      "referral",
    );
    expect(classifyAcquisitionChannel({ referring_domain: "$direct" })).toBe("direct");
  });

  it("passes 3rd-arg $set_once to posthog.identify, keeps 2 args when empty, deduplicates, and re-identifies on new $set_once", () => {
    expect(identifyPostHogUser("usr_no_ft", { plan: "free" })).toBe(true);
    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).toHaveBeenLastCalledWith("usr_no_ft", {
      db_user_id: "usr_no_ft",
      plan: "free",
    });

    resetPostHogForTest();
    identifyMock.mockClear();

    const ft = captureFirstTouchAttribution({
      url: "https://openpromptos.com/compile?utm_source=x&utm_medium=social&utm_campaign=launch&utm_term=ai&utm_content=post1&ref=maker",
      referrer: "https://t.co/abc123?s=20",
      now: new Date("2026-11-28T08:30:00.000Z"),
    });
    expect(ft).not.toBeNull();
    if (!ft) return;

    const expectedSetOnce = toPostHogSetOnceProperties(ft);
    expect(expectedSetOnce).toEqual({
      first_referrer: "https://t.co/abc123",
      first_referring_domain: "t.co",
      first_landing_path: "/compile",
      first_acquisition_channel: "organic_social",
      first_seen_at: "2026-11-28T08:30:00.000Z",
      $initial_referrer: "https://t.co/abc123",
      $initial_referring_domain: "t.co",
      first_utm_source: "x",
      $initial_utm_source: "x",
      first_utm_medium: "social",
      $initial_utm_medium: "social",
      first_utm_campaign: "launch",
      $initial_utm_campaign: "launch",
      first_utm_term: "ai",
      $initial_utm_term: "ai",
      first_utm_content: "post1",
      $initial_utm_content: "post1",
      first_ref: "maker",
    });

    expect(syncPostHogIdentity(SAMPLE_USER)).toBe(true);
    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).toHaveBeenLastCalledWith(
      "usr_acq_123",
      {
        db_user_id: "usr_acq_123",
        space_id: "spc_acq_123",
        plan: "free",
        has_passkey: false,
      },
      expectedSetOnce,
    );

    // Identical call deduplicates
    expect(syncPostHogIdentity(SAMPLE_USER)).toBe(true);
    expect(identifyMock).toHaveBeenCalledTimes(1);

    // New $set_once property re-identifies and strips forbidden keys
    expect(
      syncPostHogIdentity(SAMPLE_USER, {
        self_reported_referral_source: "ai_assistant",
        email: "leak@example.com",
        apiKey: "sk-leak",
      }),
    ).toBe(true);
    expect(identifyMock).toHaveBeenCalledTimes(2);
    expect(identifyMock).toHaveBeenLastCalledWith(
      "usr_acq_123",
      {
        db_user_id: "usr_acq_123",
        space_id: "spc_acq_123",
        plan: "free",
        has_passkey: false,
      },
      {
        ...expectedSetOnce,
        self_reported_referral_source: "ai_assistant",
      },
    );
  });

  it("updates PostHog person $set_once via syncPostHogIdentity when recordSignupReferral records attribution", async () => {
    captureFirstTouchAttribution({
      url: "https://openpromptos.com/?utm_source=perplexity&ref=ai_answer",
      referrer: "https://www.perplexity.ai/search/123?q=prompts",
      now: new Date("2026-11-28T08:45:00.000Z"),
    });
    setAuthSessionForTest(SAMPLE_USER);
    identifyMock.mockClear();

    vi.spyOn(orpcClient.userPreferences, "recordSignupAttribution").mockResolvedValueOnce({
      recorded: true,
      referralSource: "ai_assistant",
    });

    await recordSignupReferral({ referralSource: "ai_assistant" });

    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).toHaveBeenCalledWith(
      "usr_acq_123",
      {
        db_user_id: "usr_acq_123",
        space_id: "spc_acq_123",
        plan: "free",
        has_passkey: false,
      },
      expect.objectContaining({
        first_referring_domain: "perplexity.ai",
        first_utm_source: "perplexity",
        first_ref: "ai_answer",
        self_reported_referral_source: "ai_assistant",
      }),
    );
  });

  it("enriches landing_page_loaded and navigation:route_view with first-touch event properties", async () => {
    const ft = captureFirstTouchAttribution({
      url: "https://openpromptos.com/?utm_source=hn&utm_medium=social&utm_campaign=show_hn&ref=frontpage",
      referrer: "https://news.ycombinator.com/item?id=999",
      now: new Date("2026-11-28T08:50:00.000Z"),
    });
    expect(ft).not.toBeNull();
    if (!ft) return;

    const expectedEventProps = toFirstTouchEventProperties(ft);
    expect(expectedEventProps).toEqual({
      first_acquisition_channel: "organic_social",
      first_referring_domain: "news.ycombinator.com",
      first_landing_path: "/",
      first_utm_source: "hn",
      first_utm_medium: "social",
      first_utm_campaign: "show_hn",
      first_ref: "frontpage",
    });

    const qc = createAppQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(captureMock).toHaveBeenCalledWith("landing_page_loaded", expectedEventProps);
      expect(captureMock).toHaveBeenCalledWith("navigation:route_view", {
        route_path: "/",
        is_authenticated: false,
        ...expectedEventProps,
      });
    });
  });
});
