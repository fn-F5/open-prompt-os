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
  const rafIdRef = React.useRef<number | null>(null);
  const pendingBufferRef = React.useRef<string | null>(null);

  const cancelPendingFlush = React.useCallback(() => {
    if (rafIdRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingBufferRef.current = null;
  }, []);

  React.useEffect(() => cancelPendingFlush, [cancelPendingFlush]);

  const mutation = useMutation<ComposePromptOutput, Error, ComposeMutationArgs>({
    mutationFn: async ({ draft, followUpAnswers }) => {
      // Cancel any in-flight request before starting a newer one (Section 18)
      cancelPendingFlush();
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

      let hasFlushedFirstChunk = false;
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
              if (
                !partial ||
                controller.signal.aborted ||
                abortControllerRef.current !== controller
              ) {
                return;
              }
              if (
                !hasFlushedFirstChunk ||
                typeof window === "undefined" ||
                typeof window.requestAnimationFrame !== "function"
              ) {
                hasFlushedFirstChunk = true;
                composerActions.setStreamingBuffer(partial);
                return;
              }
              pendingBufferRef.current = partial;
              if (rafIdRef.current === null) {
                rafIdRef.current = window.requestAnimationFrame(() => {
                  rafIdRef.current = null;
                  if (controller.signal.aborted || abortControllerRef.current !== controller) {
                    pendingBufferRef.current = null;
                    return;
                  }
                  const latest = pendingBufferRef.current;
                  pendingBufferRef.current = null;
                  if (latest !== null) {
                    composerActions.setStreamingBuffer(latest);
                  }
                });
              }
            },
          },
        );

        cancelPendingFlush();
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
        cancelPendingFlush();
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
    cancelPendingFlush();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    composerActions.setStreamingBuffer(null);
  }, [cancelPendingFlush]);

  return {
    ...mutation,
    stopGeneration,
  };
}
