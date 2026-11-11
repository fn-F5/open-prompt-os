const BIDI_AND_NUL = new RegExp(`[${String.fromCharCode(0)}\\u202A-\\u202E\\u2066-\\u2069]`, "g");
const GOOGLE_KEY = /AIza[0-9A-Za-z\-_]*/g;
const SECRET_KEY = /sk-[A-Za-z0-9_\-]{4,}/g;
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
    .replace(SECRET_KEY, "[redacted]")
    .replace(BEARER, "Bearer [redacted]");
}
