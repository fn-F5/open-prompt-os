import type { AuthenticatedUser } from "@open-prompt-os/contracts";
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { resetPostHogUser, syncPostHogIdentity } from "./posthog.js";

export interface AuthSessionSnapshot {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly user: AuthenticatedUser | null;
}

export interface OAuthProviderStatus {
  readonly google: boolean;
  readonly github: boolean;
}

type SessionListener = (snapshot: AuthSessionSnapshot) => void;

let currentSnapshot: AuthSessionSnapshot = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
};

let initialized = false;
const listeners = new Set<SessionListener>();

function notifyListeners() {
  for (const listener of listeners) {
    listener(currentSnapshot);
  }
}

function authBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured === "string" && configured.trim() && configured.trim() !== "same-origin") {
    return configured.trim().replace(/\/$/, "");
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3001";
}

const betterAuth = createAuthClient({
  baseURL: authBaseUrl(),
  fetchOptions: { credentials: "include" },
  plugins: [emailOTPClient()],
});

function isPlan(value: unknown): value is AuthenticatedUser["plan"] {
  return value === "free" || value === "pro" || value === "team";
}

function toUser(value: unknown): AuthenticatedUser | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.email !== "string") return null;
  if (typeof record.spaceId !== "string" || typeof record.spaceName !== "string") return null;
  if (!isPlan(record.plan) || typeof record.hasPasskey !== "boolean") return null;
  return {
    id: record.id,
    email: record.email,
    name: typeof record.name === "string" && record.name.trim() ? record.name : "Operator",
    spaceId: record.spaceId,
    spaceName: record.spaceName,
    plan: record.plan,
    hasPasskey: record.hasPasskey,
  };
}

function resolveSocialCallbackUrl(callbackURL?: string): string {
  const trimmed = callbackURL?.trim();
  if (trimmed) {
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
      return new URL(trimmed, window.location.origin).toString();
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.origin === window.location.origin) {
        return parsed.toString();
      }
    } catch {
      // Fall through to current page URL
    }
  }
  return window.location.href;
}

async function signInWithSocial(
  provider: "google" | "github",
  label: string,
  options?: { callbackURL?: string },
): Promise<void> {
  const result = await betterAuth.signIn.social({
    provider,
    callbackURL: resolveSocialCallbackUrl(options?.callbackURL),
  });
  if (result?.error) {
    const message = (result.error as { message?: unknown }).message;
    throw new Error(
      typeof message === "string" && message.trim() ? message : `Could not start ${label} sign-in.`,
    );
  }
}

function applyUser(value: unknown) {
  const user = toUser(value);
  currentSnapshot = {
    isAuthenticated: Boolean(user),
    isLoading: false,
    user,
  };
  syncPostHogIdentity(user);
  notifyListeners();
}

export const authClient = {
  getSession(): AuthSessionSnapshot {
    return currentSnapshot;
  },

  subscribe(listener: SessionListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setLoading(isLoading: boolean): void {
    currentSnapshot = { ...currentSnapshot, isLoading };
    notifyListeners();
  },

  ensureInitialized(): void {
    if (initialized || import.meta.env.MODE === "test") return;
    initialized = true;
    this.setLoading(true);
    void this.refresh().catch(() => {
      this.setLoading(false);
    });
  },

  async refresh(): Promise<void> {
    if (import.meta.env.MODE === "test") return;
    const result = await betterAuth.getSession();
    applyUser(result.data?.user);
  },

  async getOAuthProviders(): Promise<OAuthProviderStatus> {
    if (import.meta.env.MODE === "test") return { google: false, github: false };
    try {
      const response = await fetch(`${authBaseUrl()}/api/auth/providers`, {
        credentials: "include",
      });
      if (!response.ok) return { google: false, github: false };
      const data = (await response.json()) as Partial<OAuthProviderStatus>;
      return {
        google: Boolean(data.google),
        github: Boolean(data.github),
      };
    } catch {
      return { google: false, github: false };
    }
  },

  async checkSignupStatus(email: string): Promise<boolean | null> {
    if (import.meta.env.MODE === "test") return null;
    try {
      const response = await fetch(`${authBaseUrl()}/api/auth/signup-status`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(2000) : undefined,
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { isNewUser?: unknown };
      return typeof data.isNewUser === "boolean" ? data.isNewUser : null;
    } catch {
      return null;
    }
  },

  async sendEmailCode(input: { email: string; captchaToken?: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Enter a valid email address.");
    const result = await betterAuth.emailOtp.sendVerificationOtp(
      {
        email,
        type: "sign-in",
      },
      input.captchaToken ? { headers: { "x-captcha-response": input.captchaToken } } : undefined,
    );
    if (result.error) {
      const code = (result.error as { code?: string }).code;
      if (code === "MISSING_RESPONSE" || code === "VERIFICATION_FAILED") {
        throw new Error("Human verification failed. Please complete the check and try again.");
      }
      throw new Error("Could not send a sign-in code.");
    }
  },

  async verifyEmailCode(input: {
    email: string;
    otp: string;
    name?: string;
  }): Promise<AuthenticatedUser> {
    const email = input.email.trim().toLowerCase();
    const otp = input.otp.trim();
    if (!/^\d{6}$/.test(otp)) throw new Error("Enter the six-digit code.");
    const result = await betterAuth.signIn.emailOtp({
      email,
      otp,
      name: input.name?.trim() || email.split("@")[0] || "Operator",
    });
    if (result.error) throw new Error("That code is invalid or expired.");
    await this.refresh();
    const user = currentSnapshot.user;
    if (!user) throw new Error("Sign-in did not start a session.");
    return user;
  },

  async signInWithGoogle(options?: { callbackURL?: string }): Promise<void> {
    await signInWithSocial("google", "Google", options);
  },

  async signInWithGitHub(options?: { callbackURL?: string }): Promise<void> {
    await signInWithSocial("github", "GitHub", options);
  },

  async signOut(): Promise<void> {
    if (import.meta.env.MODE !== "test") {
      await betterAuth.signOut();
    }
    currentSnapshot = { isAuthenticated: false, isLoading: false, user: null };
    resetPostHogUser();
    notifyListeners();
  },
};

export function setAuthSessionForTest(user: AuthenticatedUser | null): void {
  currentSnapshot = {
    isAuthenticated: Boolean(user),
    isLoading: false,
    user,
  };
  syncPostHogIdentity(user);
  notifyListeners();
}
