import * as React from "react";
import { trackEvent } from "../lib/telemetry.js";

export type AuthTriggerReason =
  | "save_prompt"
  | "advanced_controls"
  | "quota_limit"
  | "protected_route"
  | "navbar_signin";

export interface AuthDialogState {
  readonly isOpen: boolean;
  readonly reason: AuthTriggerReason;
  readonly intendedRoute?: string;
  readonly safeReplayAction?: (() => void) | null;
}

type Listener = (state: AuthDialogState) => void;

let currentState: AuthDialogState = {
  isOpen: false,
  reason: "navbar_signin",
  intendedRoute: undefined,
  safeReplayAction: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) {
    listener(currentState);
  }
}

export function getAuthDialogState(): AuthDialogState {
  return currentState;
}

export function openAuthDialog(options: {
  reason: AuthTriggerReason;
  intendedRoute?: string;
  safeReplayAction?: (() => void) | null;
}): void {
  trackEvent("auth_gate_triggered", {
    reason: options.reason,
    intendedRoute: options.intendedRoute ?? null,
  });
  currentState = {
    isOpen: true,
    reason: options.reason,
    intendedRoute: options.intendedRoute,
    safeReplayAction: options.safeReplayAction ?? null,
  };
  emit();
}

export function closeAuthDialog(): void {
  currentState = {
    ...currentState,
    isOpen: false,
  };
  emit();
}

export function consumeSafeReplayAction(): (() => void) | null {
  const action = currentState.safeReplayAction ?? null;
  currentState = {
    ...currentState,
    safeReplayAction: null,
  };
  emit();
  return action;
}

export function safeInternalRoute(route?: string): string | undefined {
  if (!route) return undefined;
  const trimmed = route.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined;
  return trimmed;
}

export function resetAuthDialogStoreForTest(): void {
  currentState = {
    isOpen: false,
    reason: "navbar_signin",
    intendedRoute: undefined,
    safeReplayAction: null,
  };
  emit();
}

export function useAuthDialogStore(): AuthDialogState {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentState,
    () => currentState,
  );
}
