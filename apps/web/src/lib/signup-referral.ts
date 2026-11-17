import {
  type RecordSignupAttributionInput,
  RecordSignupAttributionInputSchema,
} from "@open-prompt-os/contracts";
import { orpcClient } from "./orpc.js";
import { trackEvent } from "./telemetry.js";

export const PENDING_REFERRAL_STORAGE_KEY = "open-prompt-os:pending-referral";

export function savePendingSignupReferral(input: RecordSignupAttributionInput): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, JSON.stringify(input));
  } catch {
    // Ignore storage errors (private browsing / restricted quota)
  }
}

export function clearPendingSignupReferral(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function consumePendingSignupReferral(): RecordSignupAttributionInput | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
    const parsed = RecordSignupAttributionInputSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function recordSignupReferral(input: RecordSignupAttributionInput): Promise<void> {
  try {
    const result = await orpcClient.userPreferences.recordSignupAttribution(input);
    if (result.recorded) {
      trackEvent("signup_attribution_recorded", {
        referralSource: result.referralSource,
      });
    }
  } catch {
    // Never fail authentication due to optional attribution persistence
  }
}

export async function flushPendingSignupReferral(): Promise<void> {
  const pending = consumePendingSignupReferral();
  if (!pending) return;
  await recordSignupReferral(pending);
}
