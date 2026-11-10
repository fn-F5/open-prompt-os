import type { ComposePromptOutput, ComposerDraft } from "@open-prompt-os/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { saveGuestInteraction } from "../lib/guest-session-manager.js";
import { OrpcClientError, orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { trackEvent } from "../lib/telemetry.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";
import { useAuthSession } from "./use-auth-session.js";

export interface ComposeMutationArgs {
  readonly draft: ComposerDraft;
  readonly followUpAnswers?: Record<string, string>;
}

export function useComposePrompt() {
  const { isAuthenticated } = useAuthSession();
  const qc = useQueryClient();
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const mutation = useMutation<ComposePromptOutput, Error, ComposeMutationArgs>({
    mutationFn: async ({ draft, followUpAnswers }) => {
      // Cancel any in-flight request before starting a newer one (Section 18)
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const interactionId = `int_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const requestTimestamp = new Date().toISOString();

      trackEvent("prompt_generation_started", {
        mode: draft.mode,
        modelId: draft.modelId ?? "default",
        framework: draft.framework ?? "costar",
        isAuthenticated,
      });

      // Save initial guest draft before completion (without incomplete streaming chunks)
      if (!isAuthenticated) {
        saveGuestInteraction(draft, null, { interactionId, requestTimestamp });
      }

      composerActions.setStreamingBuffer("");

      try {
        const result = await orpcClient.prompts.compose(
          {
            interactionId,
            draft,
            followUpAnswers,
          },
          {
            signal: controller.signal,
            onChunk: (partial) => {
              composerActions.setStreamingBuffer(partial);
            },
          },
        );

        composerActions.setCompletedOutput(result, {
          isGuest: !isAuthenticated,
          requestTimestamp,
        });

        trackEvent("prompt_generated", {
          mode: draft.mode,
          modelId: result.modelId,
          providerId: result.providerId,
          latencyMs: result.latencyMs,
          healedFromFailure: result.healedFromFailure,
          requestId: result.requestId,
        });

        qc.invalidateQueries({ queryKey: queryKeys.billing.status() });
        return result;
      } catch (err) {
        composerActions.setStreamingBuffer(null);
        const code = err instanceof OrpcClientError ? err.code : "INTERNAL_ERROR";
        const requestId = err instanceof OrpcClientError ? err.requestId : undefined;

        trackEvent("prompt_generation_failed", {
          mode: draft.mode,
          errorCode: code,
          requestId,
        });

        if (code === "QUOTA_EXCEEDED") {
          openAuthDialog({ reason: "quota_limit" });
        }
        throw err;
      }
    },
  });

  const stopGeneration = React.useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    composerActions.setStreamingBuffer(null);
  }, []);

  return {
    ...mutation,
    stopGeneration,
  };
}
