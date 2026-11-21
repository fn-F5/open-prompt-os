const BIDI_AND_NUL = new RegExp(`[${String.fromCharCode(0)}\\u202A-\\u202E\\u2066-\\u2069]`, "g");
const GOOGLE_KEY = /AIza[0-9A-Za-z\-_]*/g;
const SECRET_KEY = /sk-[A-Za-z0-9_\-]{4,}/g;
const STRIPE_KEY = /\b(?:sk|rk|whsec)_[A-Za-z0-9_]{8,}/g;
const RESEND_KEY = /\bre_[A-Za-z0-9_]{8,}/g;
const SESSION_COOKIE = /((?:__Secure-)?better-auth\.session_token|session_token)=[^;\s]+/gi;
const BEARER = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const FORBIDDEN_KEYS = new Set(["systemPrompt", "system", "messages"]);

const CJK_CHAR_REGEX = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g;
const WORD_TOKEN_REGEX = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const LETTER_REGEX = /\p{L}/u;
const REPEATED_CHAR_SPAM_REGEX = /(\p{L})\1{4,}/u;
const ASCII_LATIN_WORD_REGEX = /^[a-z]+$/i;
const LATIN_VOWEL_REGEX = /[aeiou]/i;

const KEYBOARD_MASH_SEQUENCES = [
  "asdfg",
  "sdfgh",
  "dfghj",
  "fghjk",
  "ghjkl",
  "qwert",
  "werty",
  "ertyu",
  "rtyui",
  "tyuio",
  "yuiop",
  "zxcvb",
  "xcvbn",
  "cvbnm",
] as const;

const GREETING_PHRASES = new Set([
  "hi",
  "hello",
  "hey",
  "hiya",
  "howdy",
  "yo",
  "sup",
  "wassup",
  "what's up",
  "whats up",
  "good morning",
  "good afternoon",
  "good evening",
  "good night",
  "gm",
  "gn",
  "greetings",
  "namaste",
  "hola",
  "bonjour",
  "ciao",
  "hi there",
  "hello there",
  "hey there",
  "how are you",
  "how are u",
  "how r u",
  "how are you doing",
  "how's it going",
  "hows it going",
  "who are you",
  "what can you do",
  "help",
  "help me",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "ok",
  "okay",
  "k",
  "kk",
  "yes",
  "no",
  "yep",
  "nope",
  "yeah",
  "nah",
  "cool",
  "nice",
  "great",
  "bye",
  "goodbye",
  "see ya",
  "cya",
  "lol",
  "lmao",
  "haha",
  "hehe",
  "hmm",
  "hm",
  "uh",
  "um",
  "please",
  "pls",
  "plz",
]);

const GREETING_ONLY_TOKENS = new Set([
  "hi",
  "hello",
  "hey",
  "hiya",
  "howdy",
  "yo",
  "sup",
  "there",
  "ok",
  "okay",
  "thanks",
  "thx",
  "bye",
  "bro",
  "dude",
  "mate",
  "friend",
  "bot",
  "ai",
  "chatgpt",
  "gemini",
  "claude",
  "sir",
  "man",
  "please",
  "pls",
]);

const PLACEHOLDER_PHRASES = new Set([
  "test",
  "testing",
  "test prompt",
  "testing 123",
  "test 123",
  "test test",
  "hello world",
  "foo",
  "bar",
  "baz",
  "foobar",
  "foo bar",
  "asdf",
  "asdfg",
  "asdfgh",
  "asdfghjkl",
  "qwerty",
  "qwertyuiop",
  "zxcv",
  "zxcvbn",
  "abc",
  "abcd",
  "abcde",
  "xyz",
  "sample",
  "sample prompt",
  "example",
  "dummy",
  "placeholder",
  "idk",
  "i don't know",
  "i dont know",
  "nothing",
  "none",
  "na",
  "n/a",
  "null",
  "undefined",
  "ping",
  "check",
  "checking",
  "just testing",
  "try",
  "trying",
  "blah",
  "blah blah",
  "lorem ipsum",
  "aaa",
  "bbb",
  "xxx",
]);

const PLACEHOLDER_ONLY_TOKENS = new Set([
  "test",
  "testing",
  "foo",
  "bar",
  "baz",
  "asdf",
  "qwerty",
  "blah",
  "dummy",
  "sample",
  "abc",
  "xyz",
  "check",
  "ping",
  "123",
  "1234",
  "12345",
]);

export type PromptQualityRejectReason =
  | "empty"
  | "greeting"
  | "placeholder"
  | "gibberish"
  | "too_short";

export type PromptQualityResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: PromptQualityRejectReason;
      readonly message: string;
    };

export interface PromptQualityOptions {
  readonly supplementalText?: readonly (string | undefined)[];
}

export function extractDraftSupplementalText(draft: {
  readonly goal?: string;
  readonly audience?: string;
  readonly format?: string;
  readonly persona?: string;
  readonly tone?: string;
  readonly constraints?: readonly string[];
  readonly guardrails?: readonly string[];
}): string[] {
  return [
    draft.goal,
    draft.audience,
    draft.format,
    draft.persona,
    draft.tone,
    ...(draft.constraints ?? []),
    ...(draft.guardrails ?? []),
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeForPhraseMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function squeezeRepeatedLetters(text: string): string {
  return text.replace(/(\p{L})\1{2,}/gu, "$1");
}

function collapseDoubleLetters(text: string): string {
  return text.replace(/(\p{L})\1+/gu, "$1");
}

const QUALITY_MESSAGES: Record<PromptQualityRejectReason, string> = {
  empty:
    "Tell me what you'd like to create, write, or explore so I can build a great prompt for you.",
  greeting:
    "Hey there! Share what you'd like the AI to help with (a topic, task, or visual idea) and I'll craft a prompt for it.",
  placeholder:
    "Looks like you're testing things out! Try typing a real topic, task, or visual idea and I'll turn it into a structured prompt.",
  gibberish:
    "I couldn't quite make out what you're aiming for — try describing your idea in a few clear words.",
  too_short:
    "Give me a little more to work with — add a few words about your goal, topic, or style so I can craft a stronger prompt.",
};

export function evaluatePromptQuality(
  input: string,
  options?: PromptQualityOptions,
): PromptQualityResult {
  const primary = stripUnsafe(input).replace(/\s+/g, " ");
  if (primary.length === 0) {
    return { ok: false, reason: "empty", message: QUALITY_MESSAGES.empty };
  }

  const supplemental = (options?.supplementalText ?? [])
    .map((item) => (typeof item === "string" ? stripUnsafe(item).replace(/\s+/g, " ") : ""))
    .filter((item) => item.length > 0);

  const combined = supplemental.length > 0 ? `${primary} ${supplemental.join(" ")}` : primary;

  if (!LETTER_REGEX.test(combined)) {
    return { ok: false, reason: "empty", message: QUALITY_MESSAGES.empty };
  }

  if (supplemental.length === 0) {
    const normalized = normalizeForPhraseMatch(primary);
    const squeezed = squeezeRepeatedLetters(normalized);
    const collapsed = collapseDoubleLetters(normalized);

    if (
      GREETING_PHRASES.has(normalized) ||
      GREETING_PHRASES.has(squeezed) ||
      GREETING_PHRASES.has(collapsed)
    ) {
      return { ok: false, reason: "greeting", message: QUALITY_MESSAGES.greeting };
    }

    if (PLACEHOLDER_PHRASES.has(normalized) || PLACEHOLDER_PHRASES.has(squeezed)) {
      return { ok: false, reason: "placeholder", message: QUALITY_MESSAGES.placeholder };
    }

    const rawTokens = squeezed.split(" ").filter((token) => token.length > 0);
    if (
      rawTokens.length > 0 &&
      rawTokens.every(
        (token) =>
          GREETING_ONLY_TOKENS.has(token) || GREETING_ONLY_TOKENS.has(collapseDoubleLetters(token)),
      )
    ) {
      return { ok: false, reason: "greeting", message: QUALITY_MESSAGES.greeting };
    }

    if (rawTokens.length > 0 && rawTokens.every((token) => PLACEHOLDER_ONLY_TOKENS.has(token))) {
      return { ok: false, reason: "placeholder", message: QUALITY_MESSAGES.placeholder };
    }
  }

  if (REPEATED_CHAR_SPAM_REGEX.test(combined)) {
    return { ok: false, reason: "gibberish", message: QUALITY_MESSAGES.gibberish };
  }

  const tokens = combined.match(WORD_TOKEN_REGEX) ?? [];
  const letterTokens = tokens.filter((token) => LETTER_REGEX.test(token));
  const lowerCombined = combined.toLowerCase();

  if (
    letterTokens.length < 4 &&
    KEYBOARD_MASH_SEQUENCES.some((seq) => lowerCombined.includes(seq))
  ) {
    return { ok: false, reason: "gibberish", message: QUALITY_MESSAGES.gibberish };
  }

  if (
    letterTokens.length > 0 &&
    letterTokens.every(
      (token) =>
        ASCII_LATIN_WORD_REGEX.test(token) && token.length >= 6 && !LATIN_VOWEL_REGEX.test(token),
    )
  ) {
    return { ok: false, reason: "gibberish", message: QUALITY_MESSAGES.gibberish };
  }

  if (letterTokens.length >= 2) {
    const uniqueLower = new Set(letterTokens.map((token) => token.toLowerCase()));
    if (uniqueLower.size === 1) {
      return { ok: false, reason: "gibberish", message: QUALITY_MESSAGES.gibberish };
    }
  }

  const cjkMatches = combined.match(CJK_CHAR_REGEX);
  if (cjkMatches && cjkMatches.length >= 4) {
    return { ok: true };
  }

  const nonSpaceLength = combined.replace(/\s+/g, "").length;
  if (letterTokens.length < 2 || nonSpaceLength < 8) {
    return { ok: false, reason: "too_short", message: QUALITY_MESSAGES.too_short };
  }

  return { ok: true };
}

export function assertMeaningfulPrompt(input: string, options?: PromptQualityOptions): void {
  const result = evaluatePromptQuality(input, options);
  if (!result.ok) {
    throw new InputGuardError(result.message);
  }
}

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
