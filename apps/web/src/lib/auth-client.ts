import { passkeyClient } from "@better-auth/passkey/client";
import type { AuthenticatedUser } from "@open-prompt-os/contracts";
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

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
  plugins: [emailOTPClient(), passkeyClient()],
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

function applyUser(value: unknown) {
  const user = toUser(value);
  currentSnapshot = {
    isAuthenticated: Boolean(user),
    isLoading: false,
    user,
  };
  notifyListeners();
}

export function isPasskeySupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.PublicKeyCredential !== "undefined";
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

  async sendEmailCode(input: { email: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Enter a valid email address.");
    const result = await betterAuth.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    if (result.error) throw new Error("Could not send a sign-in code.");
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

  async signInWithGoogle(): Promise<void> {
    await betterAuth.signIn.social({
      provider: "google",
      callbackURL: window.location.href,
    });
  },

  async signInWithGitHub(): Promise<void> {
    await betterAuth.signIn.social({
      provider: "github",
      callbackURL: window.location.href,
    });
  },

  async signInWithPasskey(): Promise<AuthenticatedUser> {
    if (!isPasskeySupported()) {
      throw new Error("Passkeys are not available in this browser.");
    }
    const result = await betterAuth.signIn.passkey();
    if (result.error) throw new Error("Passkey verification was canceled or unavailable.");
    await this.refresh();
    const user = currentSnapshot.user;
    if (!user) throw new Error("Passkey sign-in did not start a session.");
    return user;
  },

  async registerPasskey(): Promise<void> {
    if (!isPasskeySupported()) {
      throw new Error("Passkeys are not available in this browser.");
    }
    const result = await betterAuth.passkey.addPasskey({ name: "This device" });
    if (result.error) throw new Error("Passkey registration was canceled or failed.");
    await this.refresh();
  },

  async listPasskeys(): Promise<Array<{ id: string; name: string; createdAt: string | null }>> {
    const result = await betterAuth.passkey.listUserPasskeys();
    if (result.error || !result.data) return [];
    return result.data.map((item) => ({
      id: item.id,
      name: item.name?.trim() || "Passkey",
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    }));
  },

  async deletePasskey(id: string): Promise<void> {
    const result = await betterAuth.passkey.deletePasskey({ id });
    if (result.error) throw new Error("Could not remove passkey.");
    await this.refresh();
  },

  async signOut(): Promise<void> {
    if (import.meta.env.MODE !== "test") {
      await betterAuth.signOut();
    }
    currentSnapshot = { isAuthenticated: false, isLoading: false, user: null };
    notifyListeners();
  },
};

export function setAuthSessionForTest(user: AuthenticatedUser | null): void {
  currentSnapshot = {
    isAuthenticated: Boolean(user),
    isLoading: false,
    user,
  };
  notifyListeners();
}
