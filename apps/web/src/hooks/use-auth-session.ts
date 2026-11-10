import type { AuthenticatedUser } from "@open-prompt-os/contracts";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { authClient } from "../lib/auth-client.js";
import { queryKeys } from "../lib/query-client.js";

export interface AuthSessionState {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly user: AuthenticatedUser | null;
  readonly signInWithEmail: (input: { email: string; name?: string }) => Promise<AuthenticatedUser>;
  readonly signInWithPasskey: () => Promise<AuthenticatedUser>;
  readonly signOut: () => Promise<void>;
}

export function useAuthSession(): AuthSessionState {
  const qc = useQueryClient();
  const snapshot = React.useSyncExternalStore(
    (listener) => authClient.subscribe(listener),
    () => authClient.getSession(),
    () => authClient.getSession(),
  );

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
    signInWithEmail: authClient.signInWithEmail,
    signInWithPasskey: authClient.signInWithPasskey,
    signOut,
  };
}
