import { LlmProviderError } from "@open-prompt-os/adapter-kit";

export interface UserFacingServerError {
  readonly code: "PROVIDER_UNAVAILABLE" | "INTERNAL_ERROR";
  readonly message: string;
}

const HIGH_TRAFFIC_MESSAGE =
  "We're experiencing high traffic right now. Please try again in a moment.";
const TEMPORARY_ISSUE_MESSAGE =
  "We're experiencing a temporary issue on our side. Please try again in a moment.";

const HIGH_TRAFFIC_PATTERNS =
  /429|resource_exhausted|quota|rate.?limit|too many requests|overloaded|503|capacity|cooling down|timeout|timed out/i;

/**
 * Converts any internal/upstream server error into a calm, user-friendly message
 * while ensuring raw provider JSON, stack traces, and internal details stay in server logs only.
 */
export function toUserFacingServerError(error: unknown): UserFacingServerError {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");

  if (error instanceof LlmProviderError) {
    if (error.code === "timeout" || HIGH_TRAFFIC_PATTERNS.test(rawMessage)) {
      return { code: "PROVIDER_UNAVAILABLE", message: HIGH_TRAFFIC_MESSAGE };
    }
    return { code: "PROVIDER_UNAVAILABLE", message: TEMPORARY_ISSUE_MESSAGE };
  }

  if (HIGH_TRAFFIC_PATTERNS.test(rawMessage)) {
    return { code: "PROVIDER_UNAVAILABLE", message: HIGH_TRAFFIC_MESSAGE };
  }

  return { code: "INTERNAL_ERROR", message: TEMPORARY_ISSUE_MESSAGE };
}
