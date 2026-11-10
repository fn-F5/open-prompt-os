import type { AuthenticatedUser } from "@open-prompt-os/contracts";

export interface AuthSessionSnapshot {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly user: AuthenticatedUser | null;
}

type SessionListener = (snapshot: AuthSessionSnapshot) => void;

let currentSnapshot: AuthSessionSnapshot = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
};

const listeners = new Set<SessionListener>();

function notifyListeners() {
  for (const listener of listeners) {
    listener(currentSnapshot);
  }
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
    currentSnapshot = {
      ...currentSnapshot,
      isLoading,
    };
    notifyListeners();
  },

  async signInWithEmail(input: { email: string; name?: string }): Promise<AuthenticatedUser> {
    const cleanEmail = input.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      throw new Error("Please enter a valid work or personal email address.");
    }
    const derivedName =
      input.name?.trim() ||
      cleanEmail
        .split("@")[0]
        ?.replace(/[._-]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase()) ||
      "Operator";

    const user: AuthenticatedUser = {
      id: `usr_${cleanEmail.replace(/[^a-z0-9]/g, "")}`,
      email: cleanEmail,
      name: derivedName,
      spaceId: `spc_${cleanEmail.replace(/[^a-z0-9]/g, "")}`,
      spaceName: `${derivedName}'s Workspace`,
      plan: "free",
      hasPasskey: false,
    };

    currentSnapshot = {
      isAuthenticated: true,
      isLoading: false,
      user,
    };
    notifyListeners();
    return user;
  },

  async signInWithPasskey(): Promise<AuthenticatedUser> {
    if (!isPasskeySupported()) {
      throw new Error("WebAuthn Passkeys are not supported in this browser environment.");
    }
    const user: AuthenticatedUser = {
      id: "usr_passkey_operator",
      email: "operator@openprompt.os",
      name: "Passkey Operator",
      spaceId: "spc_passkey_default",
      spaceName: "Core Prompt Space",
      plan: "pro",
      hasPasskey: true,
    };

    currentSnapshot = {
      isAuthenticated: true,
      isLoading: false,
      user,
    };
    notifyListeners();
    return user;
  },

  async signOut(): Promise<void> {
    currentSnapshot = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
    };
    notifyListeners();
  },
};
