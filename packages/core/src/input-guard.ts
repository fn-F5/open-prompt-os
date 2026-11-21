const BIDI_AND_NUL = new RegExp(`[${String.fromCharCode(0)}\\u202A-\\u202E\\u2066-\\u2069]`, "g");
const GOOGLE_KEY = /AIza[0-9A-Za-z\-_]*/g;
const SECRET_KEY = /sk-[A-Za-z0-9_\-]{4,}/g;
const STRIPE_KEY = /\b(?:sk|rk|whsec)_[A-Za-z0-9_]{8,}/g;
const RESEND_KEY = /\bre_[A-Za-z0-9_]{8,}/g;
const SESSION_COOKIE = /((?:__Secure-)?better-auth\.session_token|session_token)=[^;\s]+/gi;
const BEARER = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const FORBIDDEN_KEYS = new Set(["systemPrompt", "system", "messages"]);

export class InputGuardError extends Error {
  readonly code = "VALIDATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "InputGuardError";
  }
}

export function isInputGuardError(error: unknown): error is InputGuardError {
  return error instanceof InputGuardError;
}

function stripUnsafe(input: string): string {
  return input.replace(BIDI_AND_NUL, "").trim();
}

export function sanitizeUserText(input: string, maxChars: number): string {
  const cleaned = stripUnsafe(input);
  if (cleaned.length === 0) {
    throw new InputGuardError("Prompt instruction cannot be empty or whitespace only.");
  }
  if (cleaned.length > maxChars) {
    throw new InputGuardError(`Input exceeds ${maxChars} characters.`);
  }
  return cleaned;
}

export function sanitizeOptionalUserText(
  input: string | undefined,
  maxChars: number,
): string | undefined {
  if (input === undefined) return undefined;
  const cleaned = stripUnsafe(input);
  if (cleaned.length === 0) return undefined;
  if (cleaned.length > maxChars) {
    throw new InputGuardError(`Input exceeds ${maxChars} characters.`);
  }
  return cleaned;
}

export function assertNoClientSystemPrompt(payload: unknown): void {
  const stack: unknown[] = [payload];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    for (const [key, value] of Object.entries(current)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new InputGuardError("Client-supplied system instructions are not allowed.");
      }
      if (value && typeof value === "object") stack.push(value);
    }
  }
}

export function redactSecrets(text: string): string {
  return text
    .replace(GOOGLE_KEY, "[redacted]")
    .replace(STRIPE_KEY, "[redacted]")
    .replace(SECRET_KEY, "[redacted]")
    .replace(RESEND_KEY, "[redacted]")
    .replace(SESSION_COOKIE, "$1=[redacted]")
    .replace(BEARER, "Bearer [redacted]");
}

const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const SOCIAL_VIDEO_HOSTS = new Set([
  "tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "instagram.com",
  "instagr.am",
  "x.com",
  "twitter.com",
  "t.co",
  "vimeo.com",
  "player.vimeo.com",
]);

export type PublicVideoUrlParseResult =
  | {
      readonly ok: true;
      readonly kind: "youtube";
      readonly canonicalUrl: string;
      readonly videoId: string;
    }
  | {
      readonly ok: false;
      readonly reason: "unsupported_social" | "invalid_url";
      readonly message: string;
    };

export function parsePublicVideoUrl(rawUrl: string): PublicVideoUrlParseResult {
  const trimmed = stripUnsafe(rawUrl);
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "invalid_url",
      message:
        "Paste a valid public YouTube or YouTube Shorts link, or upload an MP4/WebM/MOV file.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: "invalid_url",
      message: "Only HTTPS YouTube or YouTube Shorts links are supported.",
    };
  }

  const host = parsed.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "");

  if (SOCIAL_VIDEO_HOSTS.has(host)) {
    return {
      ok: false,
      reason: "unsupported_social",
      message:
        "Direct links from this platform aren't supported yet. Download the clip as an MP4 and drop it into the Upload tab for instant analysis.",
    };
  }

  let videoId: string | null = null;
  if (host === "youtu.be") {
    const candidate = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    if (YOUTUBE_VIDEO_ID_REGEX.test(candidate)) videoId = candidate;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (parsed.pathname === "/watch") {
      const candidate = parsed.searchParams.get("v") ?? "";
      if (YOUTUBE_VIDEO_ID_REGEX.test(candidate)) videoId = candidate;
    } else if (
      (pathParts[0] === "shorts" || pathParts[0] === "embed" || pathParts[0] === "live") &&
      pathParts[1] &&
      YOUTUBE_VIDEO_ID_REGEX.test(pathParts[1])
    ) {
      videoId = pathParts[1];
    }
  }

  if (!videoId) {
    return {
      ok: false,
      reason: "invalid_url",
      message: "Paste a public YouTube or YouTube Shorts link, or upload an MP4/WebM/MOV file.",
    };
  }

  return {
    ok: true,
    kind: "youtube",
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
  };
}
