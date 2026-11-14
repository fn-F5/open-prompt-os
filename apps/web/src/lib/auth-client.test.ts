import type { AuthenticatedUser } from "@open-prompt-os/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  createAuthClientMock: vi.fn(),
  getSessionMock: vi.fn(),
  sendVerificationOtpMock: vi.fn(),
  signInEmailOtpMock: vi.fn(),
  signInSocialMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("better-auth/client", () => ({
  createAuthClient: (opts: unknown) => {
    hoisted.createAuthClientMock(opts);
    return {
      getSession: hoisted.getSessionMock,
      emailOtp: {
        sendVerificationOtp: hoisted.sendVerificationOtpMock,
      },
      signIn: {
        emailOtp: hoisted.signInEmailOtpMock,
        social: hoisted.signInSocialMock,
      },
      signOut: hoisted.signOutMock,
    };
  },
}));

import { authClient, setAuthSessionForTest } from "./auth-client.js";

const sampleUser: AuthenticatedUser = {
  id: "user_1",
  email: "ada@example.com",
  name: "Ada",
  spaceId: "space_1",
  spaceName: "Ada's Workspace",
  plan: "pro",
  hasPasskey: false,
};

describe("authClient", () => {
  beforeEach(() => {
    setAuthSessionForTest(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("manages subscriptions and loading state", () => {
    const listener = vi.fn();
    const unsub = authClient.subscribe(listener);

    authClient.setLoading(true);
    expect(authClient.getSession().isLoading).toBe(true);
    expect(listener).toHaveBeenCalledWith({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });

    setAuthSessionForTest(sampleUser);
    expect(authClient.getSession()).toEqual({
      isAuthenticated: true,
      isLoading: false,
      user: sampleUser,
    });

    unsub();
    listener.mockClear();
    authClient.setLoading(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("validates email and forwards x-captcha-response on sendEmailCode", async () => {
    await expect(authClient.sendEmailCode({ email: "invalid-email" })).rejects.toThrow(
      "Enter a valid email address.",
    );
    expect(hoisted.sendVerificationOtpMock).not.toHaveBeenCalled();

    hoisted.sendVerificationOtpMock.mockResolvedValueOnce({ data: {}, error: null });
    await authClient.sendEmailCode({ email: "  ADA@Example.COM ", captchaToken: "cf-tok-1" });
    expect(hoisted.sendVerificationOtpMock).toHaveBeenCalledWith(
      { email: "ada@example.com", type: "sign-in" },
      { headers: { "x-captcha-response": "cf-tok-1" } },
    );

    hoisted.sendVerificationOtpMock.mockResolvedValueOnce({ data: {}, error: null });
    await authClient.sendEmailCode({ email: "ada@example.com" });
    expect(hoisted.sendVerificationOtpMock).toHaveBeenLastCalledWith(
      { email: "ada@example.com", type: "sign-in" },
      undefined,
    );

    hoisted.sendVerificationOtpMock.mockResolvedValueOnce({
      data: null,
      error: { code: "MISSING_RESPONSE" },
    });
    await expect(authClient.sendEmailCode({ email: "ada@example.com" })).rejects.toThrow(
      "Human verification failed. Please complete the check and try again.",
    );

    hoisted.sendVerificationOtpMock.mockResolvedValueOnce({
      data: null,
      error: { code: "VERIFICATION_FAILED" },
    });
    await expect(authClient.sendEmailCode({ email: "ada@example.com" })).rejects.toThrow(
      "Human verification failed. Please complete the check and try again.",
    );

    hoisted.sendVerificationOtpMock.mockResolvedValueOnce({
      data: null,
      error: { code: "RATE_LIMITED" },
    });
    await expect(authClient.sendEmailCode({ email: "ada@example.com" })).rejects.toThrow(
      "Could not send a sign-in code.",
    );
  });

  it("validates OTP format and handles verifyEmailCode errors", async () => {
    await expect(
      authClient.verifyEmailCode({ email: "ada@example.com", otp: "123" }),
    ).rejects.toThrow("Enter the six-digit code.");
    await expect(
      authClient.verifyEmailCode({ email: "ada@example.com", otp: "abcdef" }),
    ).rejects.toThrow("Enter the six-digit code.");
    await expect(
      authClient.verifyEmailCode({ email: "ada@example.com", otp: "a123456" }),
    ).rejects.toThrow("Enter the six-digit code.");
    await expect(
      authClient.verifyEmailCode({ email: "ada@example.com", otp: "123456a" }),
    ).rejects.toThrow("Enter the six-digit code.");

    hoisted.signInEmailOtpMock.mockResolvedValueOnce({
      data: null,
      error: { code: "INVALID_OTP" },
    });
    await expect(
      authClient.verifyEmailCode({ email: "ada@example.com", otp: " 123456 " }),
    ).rejects.toThrow("That code is invalid or expired.");

    // In test mode refresh() is a no-op, so if no session snapshot exists it throws
    hoisted.signInEmailOtpMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(
      authClient.verifyEmailCode({ email: "  ADA@Example.COM ", otp: "123456", name: "   " }),
    ).rejects.toThrow("Sign-in did not start a session.");
    expect(hoisted.signInEmailOtpMock).toHaveBeenLastCalledWith({
      email: "ada@example.com",
      otp: "123456",
      name: "ada",
    });

    setAuthSessionForTest(sampleUser);
    hoisted.signInEmailOtpMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const signedIn = await authClient.verifyEmailCode({
      email: "ada@example.com",
      otp: "654321",
      name: " Ada Lovelace ",
    });
    expect(signedIn).toEqual(sampleUser);
    expect(hoisted.signInEmailOtpMock).toHaveBeenLastCalledWith({
      email: "ada@example.com",
      otp: "654321",
      name: "Ada Lovelace",
    });
  });

  it("handles social sign-in", async () => {
    hoisted.signInSocialMock.mockResolvedValue({});
    await authClient.signInWithGoogle();
    expect(hoisted.signInSocialMock).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: window.location.href,
    });

    await authClient.signInWithGitHub();
    expect(hoisted.signInSocialMock).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: window.location.href,
    });
  });

  it("refreshes session, fetches OAuth providers, and signs out outside test mode", async () => {
    expect(await authClient.getOAuthProviders()).toEqual({ google: false, github: false });

    vi.stubEnv("MODE", "development");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ google: true, github: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ google: true, github: true }), { status: 500 }),
      )
      .mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await authClient.getOAuthProviders()).toEqual({ google: true, github: false });
    expect(await authClient.getOAuthProviders()).toEqual({ google: false, github: false });
    expect(await authClient.getOAuthProviders()).toEqual({ google: false, github: false });

    const refreshListener = vi.fn();
    const unsubRefresh = authClient.subscribe(refreshListener);
    hoisted.getSessionMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "u_2",
          email: "grace@example.com",
          name: "   ",
          spaceId: "sp_2",
          spaceName: "Workspace",
          plan: "team",
          hasPasskey: true,
        },
      },
    });
    await authClient.refresh();
    expect(refreshListener).toHaveBeenCalled();
    expect(authClient.getSession()).toEqual({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: "u_2",
        email: "grace@example.com",
        name: "Operator",
        spaceId: "sp_2",
        spaceName: "Workspace",
        plan: "team",
        hasPasskey: true,
      },
    });
    unsubRefresh();

    // Null session response resets user without throwing
    hoisted.getSessionMock.mockResolvedValueOnce({ data: null });
    await authClient.refresh();
    expect(authClient.getSession().user).toBeNull();

    // Invalid user payloads normalize to null
    for (const badUser of [
      null,
      "not-an-object",
      {},
      { id: 123, email: "a@b.com", spaceId: "s", spaceName: "n", plan: "free", hasPasskey: false },
      { id: "u", email: 123, spaceId: "s", spaceName: "n", plan: "free", hasPasskey: false },
      { id: "u", email: "a@b.com", spaceId: 123, spaceName: "n", plan: "free", hasPasskey: false },
      { id: "u", email: "a@b.com", spaceId: "s", spaceName: 123, plan: "free", hasPasskey: false },
      {
        id: "u",
        email: "a@b.com",
        spaceId: "s",
        spaceName: "n",
        plan: "invalid",
        hasPasskey: false,
      },
      { id: "u", email: "a@b.com", spaceId: "s", spaceName: "n", plan: "free", hasPasskey: "no" },
    ]) {
      hoisted.getSessionMock.mockResolvedValueOnce({ data: { user: badUser } });
      await authClient.refresh();
      expect(authClient.getSession()).toEqual({
        isAuthenticated: false,
        isLoading: false,
        user: null,
      });
    }

    // Valid free & pro plans normalize properly
    for (const validPlan of ["free", "pro", "team"] as const) {
      hoisted.getSessionMock.mockResolvedValueOnce({
        data: {
          user: {
            id: "u_p",
            email: "p@example.com",
            name: "P",
            spaceId: "sp_p",
            spaceName: "WS",
            plan: validPlan,
            hasPasskey: false,
          },
        },
      });
      await authClient.refresh();
      expect(authClient.getSession().user?.plan).toBe(validPlan);
    }

    // ensureInitialized runs once outside test mode, sets loading, and recovers on error
    let rejectPendingSession!: (reason?: unknown) => void;
    hoisted.getSessionMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPendingSession = reject;
        }),
    );
    authClient.ensureInitialized();
    expect(authClient.getSession().isLoading).toBe(true);
    rejectPendingSession(new Error("offline"));
    await vi.waitFor(() => {
      expect(authClient.getSession().isLoading).toBe(false);
    });
    const callsAfterFirst = hoisted.getSessionMock.mock.calls.length;
    authClient.ensureInitialized();
    expect(hoisted.getSessionMock).toHaveBeenCalledTimes(callsAfterFirst);

    const signOutListener = vi.fn();
    const unsubSignOut = authClient.subscribe(signOutListener);
    hoisted.signOutMock.mockResolvedValueOnce({});
    setAuthSessionForTest(sampleUser);
    signOutListener.mockClear();
    await authClient.signOut();
    expect(hoisted.signOutMock).toHaveBeenCalledTimes(1);
    expect(authClient.getSession().isAuthenticated).toBe(false);
    expect(signOutListener).toHaveBeenCalledWith({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });
    unsubSignOut();
  });

  it("falls back to Operator name when email local-part is empty and verifies client bootstrap", async () => {
    setAuthSessionForTest(sampleUser);
    hoisted.signInEmailOtpMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await authClient.verifyEmailCode({ email: "@example.com", otp: "123456" });
    expect(hoisted.signInEmailOtpMock).toHaveBeenLastCalledWith({
      email: "@example.com",
      otp: "123456",
      name: "Operator",
    });

    // In test mode ensureInitialized() is a no-op
    const callsBeforeTestInit = hoisted.getSessionMock.mock.calls.length;
    authClient.ensureInitialized();
    expect(hoisted.getSessionMock).toHaveBeenCalledTimes(callsBeforeTestInit);

    // Non-string user name falls back to Operator
    vi.stubEnv("MODE", "development");
    hoisted.getSessionMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "u_n",
          email: "n@example.com",
          name: 42,
          spaceId: "sp_n",
          spaceName: "WS",
          plan: "free",
          hasPasskey: false,
        },
      },
    });
    await authClient.refresh();
    expect(authClient.getSession().user?.name).toBe("Operator");

    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "  https://api.example.com/  ");
    vi.stubEnv("MODE", "development");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ google: false, github: false }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { authClient: freshClient } = await import("./auth-client.js");
    expect(freshClient.getSession()).toEqual({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });
    expect(hoisted.createAuthClientMock).toHaveBeenLastCalledWith({
      baseURL: "https://api.example.com",
      fetchOptions: { credentials: "include" },
      plugins: [expect.objectContaining({ id: "email-otp" })],
    });
    await freshClient.getOAuthProviders();
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/auth/providers", {
      credentials: "include",
    });

    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "   ");
    const fetchBlank = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ google: false, github: false }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchBlank);
    const { authClient: blankUrlClient } = await import("./auth-client.js");
    await blankUrlClient.getOAuthProviders();
    expect(fetchBlank).toHaveBeenCalledWith(`${window.location.origin}/api/auth/providers`, {
      credentials: "include",
    });

    vi.resetModules();
    vi.stubEnv("VITE_API_URL", " same-origin ");
    const fetchSameOrigin = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ google: false, github: false }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchSameOrigin);
    const { authClient: sameOriginClient } = await import("./auth-client.js");
    await sameOriginClient.getOAuthProviders();
    expect(fetchSameOrigin).toHaveBeenCalledWith(`${window.location.origin}/api/auth/providers`, {
      credentials: "include",
    });
  });
});
