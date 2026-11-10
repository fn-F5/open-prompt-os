import { Button } from "@open-prompt-os/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import * as React from "react";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { useReducedEffects } from "../../hooks/use-reduced-effects.js";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { safeGetItem, safeSetItem } from "../../lib/storage.js";
import { trackEvent } from "../../lib/telemetry.js";

export interface PulseHotspotProps {
  readonly hotspotId: string;
  readonly label: string;
  readonly description: string;
}

const LOCAL_HOTSPOT_PREFIX = "open-prompt-os:hotspot-dismissed:";

export function PulseHotspot({ hotspotId, label, description }: PulseHotspotProps) {
  const { isAuthenticated } = useAuthSession();
  const { prefersReducedMotion } = useReducedEffects();
  const qc = useQueryClient();

  const [localDismissed, setLocalDismissed] = React.useState<boolean>(() => {
    return safeGetItem(`${LOCAL_HOTSPOT_PREFIX}${hotspotId}`) === "true";
  });
  const [expanded, setExpanded] = React.useState(false);

  const prefsQuery = useQuery({
    queryKey: queryKeys.preferences.onboarding(),
    queryFn: () => orpcClient.userPreferences.get(),
    enabled: isAuthenticated,
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const timestamp = new Date().toISOString();
      safeSetItem(`${LOCAL_HOTSPOT_PREFIX}${hotspotId}`, "true");
      setLocalDismissed(true);
      setExpanded(false);
      trackEvent("hotspot_dismissed", { hotspotId });
      return orpcClient.userPreferences.updateOnboarding({
        hotspotId,
        timestamp,
      });
    },
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.preferences.onboarding(), updated);
    },
  });

  if (!isAuthenticated) return null;
  if (localDismissed || prefsQuery.data?.dismissedHotspots?.[hotspotId]) {
    return null;
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        onClick={() => setExpanded((o) => !o)}
        className="group relative inline-flex items-center justify-center w-6 h-6 rounded-full focus-ring cursor-pointer"
      >
        {!prefersReducedMotion ? (
          <span
            aria-hidden="true"
            className="absolute inline-flex h-full w-full rounded-full border-2 border-[var(--accent-primary)] opacity-70 animate-ping group-hover:animate-none group-focus:animate-none"
          />
        ) : null}
        <span
          aria-hidden="true"
          className="relative inline-flex rounded-full h-3 w-3 bg-[var(--accent-primary)] border-2 border-[var(--page-bg)]"
        />
      </button>

      {expanded ? (
        <div
          role="dialog"
          aria-label={label}
          className="absolute bottom-full left-0 mb-3 z-50 w-72 rounded-2xl p-4 glass-surface text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{label}</div>
            <button
              type="button"
              aria-label="Dismiss tip permanently"
              onClick={() => dismissMutation.mutate()}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-0.5 rounded focus-ring"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
            {description}
          </p>
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="solid" onClick={() => dismissMutation.mutate()}>
              Got it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
