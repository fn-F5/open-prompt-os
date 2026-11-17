import type { FeedbackKind } from "@open-prompt-os/contracts";
import * as React from "react";
import { trackEvent } from "../lib/telemetry.js";

export type FeedbackDialogSource = "navbar" | "footer" | "settings" | "workspace";

export interface FeedbackDialogState {
  readonly isOpen: boolean;
  readonly defaultKind: FeedbackKind;
  readonly source: FeedbackDialogSource;
}

type Listener = (state: FeedbackDialogState) => void;

let currentState: FeedbackDialogState = {
  isOpen: false,
  defaultKind: "feature_request",
  source: "navbar",
};

const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) {
    listener(currentState);
  }
}

export function getFeedbackDialogState(): FeedbackDialogState {
  return currentState;
}

export function openFeedbackDialog(options?: {
  defaultKind?: FeedbackKind;
  source?: FeedbackDialogSource;
}): void {
  const defaultKind = options?.defaultKind ?? "feature_request";
  const source = options?.source ?? "navbar";
  trackEvent("feedback_dialog_opened", { defaultKind, source });
  currentState = {
    isOpen: true,
    defaultKind,
    source,
  };
  emit();
}

export function closeFeedbackDialog(): void {
  currentState = {
    ...currentState,
    isOpen: false,
  };
  emit();
}

export function resetFeedbackDialogStoreForTest(): void {
  currentState = {
    isOpen: false,
    defaultKind: "feature_request",
    source: "navbar",
  };
  emit();
}

export function useFeedbackDialogStore(): FeedbackDialogState {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentState,
    () => currentState,
  );
}
