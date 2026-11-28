import posthog from "posthog-js";
import { getFirstTouchAttribution, toPostHogSetOnceProperties } from "./acquisition.js";
import { sanitizeTelemetryProperties } from "./telemetry.js";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

let isInitialized = false;
let currentIdentifiedUserId: string | null = null;
let currentIdentifiedSignature: string | null = null;

export interface PostHogConfig {
  readonly apiKey: string;
  readonly apiHost: string;
}

export interface PostHogIdentityUser {
  readonly id: string;
  readonly spaceId?: string;
  readonly plan?: string;
  readonly hasPasskey?: boolean;
}

function sortDefinedEntries(
  properties: Record<string, string | number | boolean | null | undefined>,
): Array<[string, string | number | boolean | null]> {
  return Object.entries(properties)
    .filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function buildIdentitySignature(
  distinctId: string,
  setProperties: Record<string, string | number | boolean | null | undefined>,
  setOnceProperties: Record<string, string | number | boolean | null | undefined> = {},
): string {
  return JSON.stringify([
    distinctId,
    sortDefinedEntries(setProperties),
    sortDefinedEntries(setOnceProperties),
  ]);
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
  setOnceProperties?: Record<string, unknown>,
): boolean {
  const trimmedId = distinctId.trim();
  if (!trimmedId) {
    return false;
  }
  if (!isInitialized && !initPostHog()) {
    return false;
  }

  const sanitizedProps: Record<string, string | number | boolean | null | undefined> = {
    ...sanitizeTelemetryProperties(properties),
    db_user_id: trimmedId,
  };
  const storedFirstTouch = getFirstTouchAttribution();
  const rawSetOnce: Record<string, unknown> = {
    ...(storedFirstTouch ? toPostHogSetOnceProperties(storedFirstTouch) : {}),
    ...(setOnceProperties ?? {}),
  };
  const sanitizedSetOnceRaw = sanitizeTelemetryProperties(rawSetOnce);
  const sanitizedSetOnce: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(sanitizedSetOnceRaw)) {
    if (value !== undefined) {
      sanitizedSetOnce[key] = value;
    }
  }

  const signature = buildIdentitySignature(trimmedId, sanitizedProps, sanitizedSetOnce);
  if (currentIdentifiedUserId === trimmedId && currentIdentifiedSignature === signature) {
    return true;
  }

  if (Object.keys(sanitizedSetOnce).length > 0) {
    posthog.identify(trimmedId, sanitizedProps, sanitizedSetOnce);
  } else {
    posthog.identify(trimmedId, sanitizedProps);
  }
  currentIdentifiedUserId = trimmedId;
  currentIdentifiedSignature = signature;
  return true;
}

export function syncPostHogIdentity(
  user: PostHogIdentityUser | null,
  setOnceProperties?: Record<string, unknown>,
): boolean {
  if (user?.id) {
    return identifyPostHogUser(
      user.id,
      {
        ...(user.spaceId ? { space_id: user.spaceId } : {}),
        ...(user.plan ? { plan: user.plan } : {}),
        ...(typeof user.hasPasskey === "boolean" ? { has_passkey: user.hasPasskey } : {}),
      },
      setOnceProperties,
    );
  }
  if (currentIdentifiedUserId !== null) {
    return resetPostHogUser();
  }
  return false;
}

export function resetPostHogUser(): boolean {
  currentIdentifiedUserId = null;
  currentIdentifiedSignature = null;
  if (!isInitialized) {
    return false;
  }

  posthog.reset();
  return true;
}

export function resetPostHogForTest(): void {
  isInitialized = false;
  currentIdentifiedUserId = null;
  currentIdentifiedSignature = null;
}
