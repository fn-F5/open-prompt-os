import { safeGetItem, safeRemoveItem, safeSetItem } from "./storage.js";

export const FIRST_TOUCH_ATTRIBUTION_STORAGE_KEY = "open-prompt-os:first-touch-attribution";

export type AcquisitionChannel =
  | "paid"
  | "email"
  | "organic_social"
  | "organic_search"
  | "ai_search"
  | "referral"
  | "campaign"
  | "direct";

export interface FirstTouchAttribution {
  readonly utm_source?: string;
  readonly utm_medium?: string;
  readonly utm_campaign?: string;
  readonly utm_term?: string;
  readonly utm_content?: string;
  readonly ref?: string;
  readonly referrer: string;
  readonly referring_domain: string;
  readonly landing_path: string;
  readonly channel: AcquisitionChannel;
  readonly captured_at: string;
}

export interface CaptureFirstTouchInput {
  readonly url?: string;
  readonly referrer?: string;
  readonly now?: Date;
}

export interface ChannelClassificationInput {
  readonly utm_source?: string;
  readonly utm_medium?: string;
  readonly utm_campaign?: string;
  readonly ref?: string;
  readonly referring_domain?: string;
}

const VALID_CHANNELS = new Set<AcquisitionChannel>([
  "paid",
  "email",
  "organic_social",
  "organic_search",
  "ai_search",
  "referral",
  "campaign",
  "direct",
]);

const EMAIL_PATTERN = /\S+@\S+\.\S+/;
const SECRET_PREFIX_PATTERN = /^(sk-|pk_|phc_|ghp_|gho_|AIza|whsec_|re_)/i;
const BEARER_PATTERN = /(?:^|\s)Bearer\s+/i;

const PAID_MEDIUM_PATTERN = /^(cpc|ppc|paid|paid_social|paid-social|display|sponsored|cpm|sem)$/i;
const EMAIL_CHANNEL_PATTERN = /^(email|newsletter|e-mail)$/i;
const SOCIAL_MEDIUM_PATTERN = /^(social|organic_social|social-media)$/i;
const REFERRAL_MEDIUM_PATTERN = /^referral$/i;

const OAUTH_REDIRECT_HOSTS = new Set([
  "accounts.google.com",
  "appleid.apple.com",
  "login.microsoftonline.com",
]);

const AI_ASSISTANT_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "perplexity.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
] as const;

const SEARCH_ENGINE_HOSTS = [
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.com",
  "baidu.com",
  "ecosia.org",
  "kagi.com",
  "search.brave.com",
] as const;

const GOOGLE_SEARCH_HOST_PATTERN = /^google\.[a-z]{2,}(?:\.[a-z]{2,})?$/i;
const YANDEX_SEARCH_HOST_PATTERN = /^yandex\.[a-z]{2,}(?:\.[a-z]{2,})?$/i;

const SOCIAL_COMMUNITY_HOSTS = [
  "t.co",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "reddit.com",
  "news.ycombinator.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "threads.net",
  "bsky.app",
  "producthunt.com",
] as const;

const MAX_VALUE_LENGTH = 120;

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function matchesHostList(domain: string, hosts: readonly string[]): boolean {
  return hosts.some((host) => domain === host || domain.endsWith(`.${host}`));
}

function isValidChannel(value: unknown): value is AcquisitionChannel {
  return typeof value === "string" && VALID_CHANNELS.has(value as AcquisitionChannel);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isValidFirstTouchAttribution(value: unknown): value is FirstTouchAttribution {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.referrer !== "string" ||
    !record.referrer ||
    typeof record.referring_domain !== "string" ||
    !record.referring_domain ||
    typeof record.landing_path !== "string" ||
    !record.landing_path ||
    !isValidChannel(record.channel) ||
    typeof record.captured_at !== "string" ||
    !record.captured_at
  ) {
    return false;
  }

  return (
    isOptionalString(record.utm_source) &&
    isOptionalString(record.utm_medium) &&
    isOptionalString(record.utm_campaign) &&
    isOptionalString(record.utm_term) &&
    isOptionalString(record.utm_content) &&
    isOptionalString(record.ref)
  );
}

export function sanitizeAcquisitionValue(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ASCII control characters from URL query params
  const collapsed = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!collapsed) {
    return undefined;
  }
  if (
    EMAIL_PATTERN.test(collapsed) ||
    SECRET_PREFIX_PATTERN.test(collapsed) ||
    BEARER_PATTERN.test(collapsed)
  ) {
    return undefined;
  }
  const capped =
    collapsed.length > MAX_VALUE_LENGTH ? collapsed.slice(0, MAX_VALUE_LENGTH).trim() : collapsed;
  return capped || undefined;
}

export function parseExternalReferrer(
  rawReferrer: string | null | undefined,
  currentUrl: string | URL,
): { readonly referrer: string; readonly referring_domain: string } {
  const direct = { referrer: "$direct", referring_domain: "$direct" } as const;
  if (typeof rawReferrer !== "string" || !rawReferrer.trim()) {
    return direct;
  }

  let refUrl: URL;
  try {
    refUrl = new URL(rawReferrer.trim());
  } catch {
    return direct;
  }

  if (refUrl.protocol !== "http:" && refUrl.protocol !== "https:") {
    return direct;
  }

  const referringDomain = normalizeHostname(refUrl.hostname);
  if (!referringDomain || OAUTH_REDIRECT_HOSTS.has(referringDomain)) {
    return direct;
  }

  let currentHost = "";
  try {
    const parsedCurrent = typeof currentUrl === "string" ? new URL(currentUrl) : currentUrl;
    currentHost = normalizeHostname(parsedCurrent.hostname);
  } catch {
    currentHost = "";
  }

  if (currentHost && referringDomain === currentHost) {
    return direct;
  }

  return {
    referrer: `${refUrl.origin}${refUrl.pathname}`,
    referring_domain: referringDomain,
  };
}

export function classifyAcquisitionChannel(input: ChannelClassificationInput): AcquisitionChannel {
  const medium = input.utm_medium?.trim() ?? "";
  const source = input.utm_source?.trim() ?? "";
  const campaign = input.utm_campaign?.trim() ?? "";
  const ref = input.ref?.trim() ?? "";
  const referringDomain = input.referring_domain ? normalizeHostname(input.referring_domain) : "";

  if (medium && PAID_MEDIUM_PATTERN.test(medium)) {
    return "paid";
  }
  if (
    (medium && EMAIL_CHANNEL_PATTERN.test(medium)) ||
    (source && EMAIL_CHANNEL_PATTERN.test(source))
  ) {
    return "email";
  }
  if (medium && SOCIAL_MEDIUM_PATTERN.test(medium)) {
    return "organic_social";
  }
  if (medium && REFERRAL_MEDIUM_PATTERN.test(medium)) {
    return "referral";
  }
  if (source || medium || campaign) {
    return "campaign";
  }

  if (referringDomain && referringDomain !== "$direct") {
    if (matchesHostList(referringDomain, AI_ASSISTANT_HOSTS)) {
      return "ai_search";
    }
    if (
      GOOGLE_SEARCH_HOST_PATTERN.test(referringDomain) ||
      YANDEX_SEARCH_HOST_PATTERN.test(referringDomain) ||
      matchesHostList(referringDomain, SEARCH_ENGINE_HOSTS)
    ) {
      return "organic_search";
    }
    if (matchesHostList(referringDomain, SOCIAL_COMMUNITY_HOSTS)) {
      return "organic_social";
    }
    return "referral";
  }

  if (ref) {
    return "referral";
  }

  return "direct";
}

export function getFirstTouchAttribution(): FirstTouchAttribution | null {
  const raw = safeGetItem(FIRST_TOUCH_ATTRIBUTION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidFirstTouchAttribution(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function captureFirstTouchAttribution(
  input?: CaptureFirstTouchInput,
): FirstTouchAttribution | null {
  const existing = getFirstTouchAttribution();
  if (existing) {
    return existing;
  }

  if (!input?.url && typeof window === "undefined") {
    return null;
  }

  const rawUrl = input?.url ?? window.location.href;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  const rawReferrer =
    input?.referrer !== undefined
      ? input.referrer
      : typeof document !== "undefined"
        ? document.referrer
        : "";

  const utm_source = sanitizeAcquisitionValue(parsedUrl.searchParams.get("utm_source"));
  const utm_medium = sanitizeAcquisitionValue(parsedUrl.searchParams.get("utm_medium"));
  const utm_campaign = sanitizeAcquisitionValue(parsedUrl.searchParams.get("utm_campaign"));
  const utm_term = sanitizeAcquisitionValue(parsedUrl.searchParams.get("utm_term"));
  const utm_content = sanitizeAcquisitionValue(parsedUrl.searchParams.get("utm_content"));
  const ref = sanitizeAcquisitionValue(parsedUrl.searchParams.get("ref"));

  const { referrer, referring_domain } = parseExternalReferrer(rawReferrer, parsedUrl);
  const landing_path = parsedUrl.pathname || "/";
  const channel = classifyAcquisitionChannel({
    utm_source,
    utm_medium,
    utm_campaign,
    ref,
    referring_domain,
  });
  const captured_at = (input?.now ?? new Date()).toISOString();

  const record: FirstTouchAttribution = {
    ...(utm_source ? { utm_source } : {}),
    ...(utm_medium ? { utm_medium } : {}),
    ...(utm_campaign ? { utm_campaign } : {}),
    ...(utm_term ? { utm_term } : {}),
    ...(utm_content ? { utm_content } : {}),
    ...(ref ? { ref } : {}),
    referrer,
    referring_domain,
    landing_path,
    channel,
    captured_at,
  };

  safeSetItem(FIRST_TOUCH_ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function clearFirstTouchAttributionForTest(): void {
  safeRemoveItem(FIRST_TOUCH_ATTRIBUTION_STORAGE_KEY);
}

export function toPostHogSetOnceProperties(record: FirstTouchAttribution): Record<string, string> {
  return {
    first_referrer: record.referrer,
    first_referring_domain: record.referring_domain,
    first_landing_path: record.landing_path,
    first_acquisition_channel: record.channel,
    first_seen_at: record.captured_at,
    $initial_referrer: record.referrer,
    $initial_referring_domain: record.referring_domain,
    ...(record.utm_source
      ? { first_utm_source: record.utm_source, $initial_utm_source: record.utm_source }
      : {}),
    ...(record.utm_medium
      ? { first_utm_medium: record.utm_medium, $initial_utm_medium: record.utm_medium }
      : {}),
    ...(record.utm_campaign
      ? { first_utm_campaign: record.utm_campaign, $initial_utm_campaign: record.utm_campaign }
      : {}),
    ...(record.utm_term
      ? { first_utm_term: record.utm_term, $initial_utm_term: record.utm_term }
      : {}),
    ...(record.utm_content
      ? { first_utm_content: record.utm_content, $initial_utm_content: record.utm_content }
      : {}),
    ...(record.ref ? { first_ref: record.ref } : {}),
  };
}

export function toFirstTouchEventProperties(record: FirstTouchAttribution): Record<string, string> {
  return {
    first_acquisition_channel: record.channel,
    first_referring_domain: record.referring_domain,
    first_landing_path: record.landing_path,
    ...(record.utm_source ? { first_utm_source: record.utm_source } : {}),
    ...(record.utm_medium ? { first_utm_medium: record.utm_medium } : {}),
    ...(record.utm_campaign ? { first_utm_campaign: record.utm_campaign } : {}),
    ...(record.ref ? { first_ref: record.ref } : {}),
  };
}
