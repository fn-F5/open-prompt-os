import posthog from "posthog-js";
import { sanitizeTelemetryProperties } from "./telemetry.js";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

let isInitialized = false;

export interface PostHogConfig {
  readonly apiKey: string;
  readonly apiHost: string;
}

export function resolvePostHogConfig(): PostHogConfig | null {
  const rawKey = import.meta.env.POSTHOG_KEY;
  const apiKey = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!apiKey) {
    return null;
  }

  const rawHost = import.meta.env.POSTHOG_HOST;
  const apiHost =
    typeof rawHost === "string" && rawHost.trim().length > 0
      ? rawHost.trim().replace(/\/+$/, "")
      : DEFAULT_POSTHOG_HOST;

  return { apiKey, apiHost };
}

export function initPostHog(): boolean {
  if (isInitialized) {
    return true;
  }

  const config = resolvePostHogConfig();
  if (!config) {
    return false;
  }

  posthog.init(config.apiKey, {
    api_host: config.apiHost,
    person_profiles: "identified_only",
    capture_pageview: false,
    autocapture: false,
    capture_exceptions: true,
  });
  isInitialized = true;
  return true;
}

export function capturePostHogEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): boolean {
  if (!isInitialized && !initPostHog()) {
    return false;
  }

  posthog.capture(eventName, sanitizeTelemetryProperties(properties));
  return true;
}

export function capturePostHogException(
  error: unknown,
  properties: Record<string, unknown> = {},
): boolean {
  if (!isInitialized && !initPostHog()) {
    return false;
  }

  posthog.captureException(error, sanitizeTelemetryProperties(properties));
  return true;
}

export function identifyPostHogUser(
  distinctId: string,
  properties: Record<string, unknown> = {},
): boolean {
  const trimmedId = distinctId.trim();
  if (!trimmedId) {
    return false;
  }
  if (!isInitialized && !initPostHog()) {
    return false;
  }

  posthog.identify(trimmedId, sanitizeTelemetryProperties(properties));
  return true;
}

export function resetPostHogUser(): boolean {
  if (!isInitialized) {
    return false;
  }

  posthog.reset();
  return true;
}

export function resetPostHogForTest(): void {
  isInitialized = false;
}
