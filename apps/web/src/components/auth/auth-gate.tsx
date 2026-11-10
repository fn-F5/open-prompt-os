import * as React from "react";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { type AuthTriggerReason, openAuthDialog } from "../../state/auth-dialog-store.js";

export type AuthGateDecision = "block_loading" | "allow_authenticated" | "prompt_auth";

export function evaluateAuthGateDecision(state: {
  isLoading: boolean;
  isAuthenticated: boolean;
}): AuthGateDecision {
  if (state.isLoading) return "block_loading";
  if (state.isAuthenticated) return "allow_authenticated";
  return "prompt_auth";
}

export interface AuthGateProps {
  readonly reason: AuthTriggerReason;
  readonly intendedRoute?: string;
  /**
   * Optional idempotent, non-destructive, non-billable callback to replay after sign-in.
   */
  readonly onSafeReplay?: () => void;
  readonly onAuthenticatedAction: () => void;
  readonly children: React.ReactElement<{
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    "aria-busy"?: boolean;
  }>;
}

export function AuthGate({
  reason,
  intendedRoute,
  onSafeReplay,
  onAuthenticatedAction,
  children,
}: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuthSession();
  const decision = evaluateAuthGateDecision({ isLoading, isAuthenticated });

  const handleActivate = (event: React.MouseEvent) => {
    children.props.onClick?.(event);
    if (event.defaultPrevented) return;

    if (decision === "block_loading") {
      event.preventDefault();
      return;
    }

    if (decision === "allow_authenticated") {
      onAuthenticatedAction();
      return;
    }

    event.preventDefault();
    openAuthDialog({
      reason,
      intendedRoute,
      safeReplayAction: onSafeReplay ?? null,
    });
  };

  return React.cloneElement(children, {
    onClick: handleActivate,
    disabled: Boolean(children.props.disabled || decision === "block_loading"),
    "aria-busy": decision === "block_loading" ? true : undefined,
  });
}
