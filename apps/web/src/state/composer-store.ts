import type { ComposePromptOutput, ComposerDraft, ComposerMode } from "@open-prompt-os/contracts";
import * as React from "react";
import { getGuestInteraction, saveGuestInteraction } from "../lib/guest-session-manager.js";
import { trackEvent } from "../lib/telemetry.js";

function createDefaultDraft(mode: ComposerMode, modelId: string | null = null): ComposerDraft {
  const defaultModel =
    modelId ??
    (mode === "image"
      ? "imagen-3-pro"
      : mode === "video"
        ? "veo-2-cinema"
        : "claude-3-7-sonnet");
  return {
    rawInput: "",
    mode,
    modelId: defaultModel,
    goal: undefined,
    audience: undefined,
    constraints: [],
    format: undefined,
    persona: undefined,
    tone: undefined,
    guardrails: [],
    framework: "costar",
    advanced: {
      length: "balanced",
      creativity: 0.3,
    },
  };
}

export interface ComposerStoreState {
  readonly activeMode: ComposerMode;
  readonly draftsByMode: Record<ComposerMode, ComposerDraft>;
  readonly selectedModelByMode: Record<ComposerMode, string>;
  readonly completedOutput: ComposePromptOutput | null;
  readonly streamingBuffer: string | null;
  readonly isAdvancedOpen: boolean;
}

function createInitialStoreState(): ComposerStoreState {
  const guest = getGuestInteraction();
  const baseDrafts: Record<ComposerMode, ComposerDraft> = {
    text: createDefaultDraft("text"),
    image: createDefaultDraft("image"),
    video: createDefaultDraft("video"),
  };

  if (guest) {
    const mode = guest.prompt.mode;
    baseDrafts[mode] = guest.prompt;
    const hydratedOutput: ComposePromptOutput | null = guest.response
      ? {
          interactionId: guest.interactionId,
          compiledPrompt: guest.response.compiledPrompt,
          detectedVariables: guest.response.detectedVariables,
          followUpQuestions: [],
          providerId: guest.response.providerId ?? "anthropic",
          modelId: guest.response.modelId ?? guest.prompt.modelId ?? "claude-3-7-sonnet",
          latencyMs: 0,
          healedFromFailure: false,
          remainingDailyPrompts: null,
          requestId: `req_hydrated_${guest.interactionId.slice(0, 8)}`,
        }
      : null;

    return {
      activeMode: mode,
      draftsByMode: baseDrafts,
      selectedModelByMode: {
        text: mode === "text" && guest.prompt.modelId ? guest.prompt.modelId : "claude-3-7-sonnet",
        image: mode === "image" && guest.prompt.modelId ? guest.prompt.modelId : "imagen-3-pro",
        video: mode === "video" && guest.prompt.modelId ? guest.prompt.modelId : "veo-2-cinema",
      },
      completedOutput: hydratedOutput,
      streamingBuffer: null,
      isAdvancedOpen: false,
    };
  }

  return {
    activeMode: "text",
    draftsByMode: baseDrafts,
    selectedModelByMode: {
      text: "claude-3-7-sonnet",
      image: "imagen-3-pro",
      video: "veo-2-cinema",
    },
    completedOutput: null,
    streamingBuffer: null,
    isAdvancedOpen: false,
  };
}

let state: ComposerStoreState = createInitialStoreState();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export const composerActions = {
  getState(): ComposerStoreState {
    return state;
  },

  getActiveDraft(): ComposerDraft {
    return state.draftsByMode[state.activeMode];
  },

  setMode(mode: ComposerMode): void {
    if (state.activeMode === mode) return;
    trackEvent("composer_mode_changed", { from: state.activeMode, to: mode });
    state = {
      ...state,
      activeMode: mode,
    };
    notify();
  },

  updateActiveDraft(patch: Partial<ComposerDraft>): void {
    const mode = state.activeMode;
    const current = state.draftsByMode[mode];
    const updated: ComposerDraft = {
      ...current,
      ...patch,
      mode,
      advanced: patch.advanced
        ? { ...current.advanced, ...patch.advanced }
        : current.advanced,
    };
    const nextModelByMode =
      patch.modelId && typeof patch.modelId === "string"
        ? { ...state.selectedModelByMode, [mode]: patch.modelId }
        : state.selectedModelByMode;

    state = {
      ...state,
      draftsByMode: {
        ...state.draftsByMode,
        [mode]: updated,
      },
      selectedModelByMode: nextModelByMode,
    };
    notify();
  },

  setStreamingBuffer(buffer: string | null): void {
    state = {
      ...state,
      streamingBuffer: buffer,
    };
    notify();
  },

  setCompletedOutput(
    output: ComposePromptOutput | null,
    options?: { isGuest?: boolean; requestTimestamp?: string },
  ): void {
    state = {
      ...state,
      completedOutput: output,
      streamingBuffer: null,
    };
    if (options?.isGuest && output) {
      const draft = state.draftsByMode[state.activeMode];
      saveGuestInteraction(
        draft,
        {
          compiledPrompt: output.compiledPrompt,
          detectedVariables: output.detectedVariables,
          providerId: output.providerId,
          modelId: output.modelId,
        },
        {
          interactionId: output.interactionId,
          requestTimestamp: options.requestTimestamp,
        },
      );
    }
    notify();
  },

  applyTemplateDraft(draft: ComposerDraft): void {
    const mode = draft.mode;
    state = {
      ...state,
      activeMode: mode,
      draftsByMode: {
        ...state.draftsByMode,
        [mode]: draft,
      },
      selectedModelByMode: draft.modelId
        ? { ...state.selectedModelByMode, [mode]: draft.modelId }
        : state.selectedModelByMode,
    };
    notify();
  },

  setAdvancedOpen(isOpen: boolean): void {
    if (isOpen && !state.isAdvancedOpen) {
      trackEvent("advanced_controls_opened", { mode: state.activeMode });
    }
    state = {
      ...state,
      isAdvancedOpen: isOpen,
    };
    notify();
  },

  resetCurrentPrompt(): void {
    const mode = state.activeMode;
    const modelId = state.selectedModelByMode[mode];
    state = {
      ...state,
      draftsByMode: {
        ...state.draftsByMode,
        [mode]: createDefaultDraft(mode, modelId),
      },
      completedOutput: null,
      streamingBuffer: null,
    };
    notify();
  },

  rehydrateFromStorage(): void {
    state = createInitialStoreState();
    notify();
  },
};

export function useComposerStore(): ComposerStoreState & { activeDraft: ComposerDraft } {
  const snapshot = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
  return {
    ...snapshot,
    activeDraft: snapshot.draftsByMode[snapshot.activeMode],
  };
}
