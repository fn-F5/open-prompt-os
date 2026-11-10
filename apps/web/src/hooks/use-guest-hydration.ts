import { toast } from "@open-prompt-os/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  clearGuestInteraction,
  getGuestInteraction,
  markGuestMigration,
} from "../lib/guest-session-manager.js";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { trackEvent } from "../lib/telemetry.js";
import { consumeSafeReplayAction } from "../state/auth-dialog-store.js";
import { useAuthSession } from "./use-auth-session.js";

export function useGuestHydration() {
  const { isAuthenticated, isLoading, user } = useAuthSession();
  const qc = useQueryClient();
  const inFlightRef = React.useRef(false);

  const migrationMutation = useMutation({
    mutationFn: async () => {
      const record = getGuestInteraction();
      if (!record || record.migrationStatus === "migrating") {
        return null;
      }

      markGuestMigration("migrating");

      // Notify sibling tabs via BroadcastChannel if available
      let channel: BroadcastChannel | null = null;
      if (typeof BroadcastChannel !== "undefined") {
        try {
          channel = new BroadcastChannel("open-prompt-os:guest-migration");
          channel.postMessage({ type: "MIGRATING", interactionId: record.interactionId });
        } catch {
          channel = null;
        }
      }

      try {
        const result = await orpcClient.prompts.importGuestInteraction({
          interactionId: record.interactionId,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          prompt: record.prompt,
          response: record.response,
        });

        clearGuestInteraction();
        channel?.postMessage({ type: "MIGRATED", interactionId: record.interactionId });
        channel?.close();

        trackEvent("guest_interaction_migrated", {
          imported: result.imported,
          mode: record.prompt.mode,
        });

        await qc.invalidateQueries({ queryKey: queryKeys.prompts.all });
        await qc.invalidateQueries({ queryKey: queryKeys.billing.status() });

        if (result.imported) {
          toast({
            title: "Workspace synced",
            description: "Your guest prompt and output were saved to your private library.",
          });
        }

        const replay = consumeSafeReplayAction();
        if (replay) {
          replay();
        }

        return result;
      } catch (err) {
        channel?.close();
        markGuestMigration("failed");
        toast({
          title: "Could not sync guest prompt",
          description: "Your work is safely retained in this browser. You can retry anytime.",
          tone: "error",
          actionLabel: "Retry sync",
          onAction: () => {
            inFlightRef.current = false;
            migrationMutation.mutate();
          },
        });
        throw err;
      }
    },
  });

  React.useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (inFlightRef.current) return;

    const record = getGuestInteraction();
    if (!record) return;
    if (record.migrationStatus === "migrating") return;

    // Only migrate if there is meaningful prompt content
    if (!record.prompt.rawInput.trim()) {
      clearGuestInteraction();
      return;
    }

    inFlightRef.current = true;
    migrationMutation.mutate(undefined, {
      onSettled: () => {
        inFlightRef.current = false;
      },
    });
  }, [isLoading, isAuthenticated, user, migrationMutation]);

  return {
    isMigrating: migrationMutation.isPending,
    retryMigration: () => migrationMutation.mutate(),
  };
}
