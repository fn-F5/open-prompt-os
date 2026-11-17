import * as React from "react";
import { trackEvent } from "../lib/telemetry.js";

export type AuthTriggerReason =
  | "save_prompt"
  | "advanced_controls"
  | "quota_limit"
  | "protected_route"
  | "navbar_signin";

export type AuthDialogMode = "signin" | "signup";

export interface AuthDialogState {
  readonly isOpen: boolean;
  readonly reason: AuthTriggerReason;
  readonly mode: AuthDialogMode;
  readonly intendedRoute?: string;
  readonly safeReplayAction?: (() => void) | null;
}

type Listener = (state: AuthDialogState) => void;

let currentState: AuthDialogState = {
  isOpen: false,
  reason: "navbar_signin",
  mode: "signin",
  intendedRoute: undefined,
  safeReplayAction: null,
};

function defaultModeForReason(reason: AuthTriggerReason): AuthDialogMode {
  if (reason === "save_prompt" || reason === "quota_limit" || reason === "advanced_controls") {
    return "signup";
  }
  return "signin";
}

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
  mode?: AuthDialogMode;
  intendedRoute?: string;
  safeReplayAction?: (() => void) | null;
}): void {
  const mode = options.mode ?? defaultModeForReason(options.reason);
  trackEvent("auth_gate_triggered", {
    reason: options.reason,
    mode,
    intendedRoute: options.intendedRoute ?? null,
  });
  currentState = {
    isOpen: true,
    reason: options.reason,
    mode,
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
    mode: "signin",
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
