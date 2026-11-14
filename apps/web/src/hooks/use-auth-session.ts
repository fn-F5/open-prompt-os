import type { AuthenticatedUser } from "@open-prompt-os/contracts";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { authClient } from "../lib/auth-client.js";
import { queryKeys } from "../lib/query-client.js";

export interface AuthSessionState {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly user: AuthenticatedUser | null;
  readonly sendEmailCode: (input: { email: string; captchaToken?: string }) => Promise<void>;
  readonly verifyEmailCode: (input: {
    email: string;
    otp: string;
    name?: string;
  }) => Promise<AuthenticatedUser>;
  readonly signInWithGoogle: () => Promise<void>;
  readonly signInWithGitHub: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const sendEmailCode: AuthSessionState["sendEmailCode"] = (input) => authClient.sendEmailCode(input);
const verifyEmailCode: AuthSessionState["verifyEmailCode"] = (input) =>
  authClient.verifyEmailCode(input);
const signInWithGoogle: AuthSessionState["signInWithGoogle"] = () => authClient.signInWithGoogle();
const signInWithGitHub: AuthSessionState["signInWithGitHub"] = () => authClient.signInWithGitHub();

export function useAuthSession(): AuthSessionState {
  const qc = useQueryClient();
  const snapshot = React.useSyncExternalStore(
    (listener) => authClient.subscribe(listener),
    () => authClient.getSession(),
    () => authClient.getSession(),
  );

  React.useEffect(() => {
    authClient.ensureInitialized();
  }, []);

  const signOut = React.useCallback(async () => {
    await authClient.signOut();
    // Clear user-scoped sensitive caches on sign-out without deleting retained guest data (Section 7.1, 18)
    qc.removeQueries({ queryKey: queryKeys.prompts.all });
    qc.removeQueries({ queryKey: queryKeys.preferences.onboarding() });
    qc.invalidateQueries({ queryKey: queryKeys.billing.status() });
  }, [qc]);

  return {
    isAuthenticated: snapshot.isAuthenticated,
    isLoading: snapshot.isLoading,
    user: snapshot.user,
    sendEmailCode,
    verifyEmailCode,
    signInWithGoogle,
    signInWithGitHub,
    signOut,
  };
}
