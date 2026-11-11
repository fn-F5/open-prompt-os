export const GEMINI_MODEL_TIERS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
] as const;

const exhaustedUntil = new Map<string, number>();
let requestCounter = 0;

export function resetGeminiFallbackState(): void {
  exhaustedUntil.clear();
  requestCounter = 0;
}

export function geminiModelChain(requested: string | undefined): readonly string[] {
  const tiers: string[] = [...GEMINI_MODEL_TIERS];
  if (requested && tiers.includes(requested)) {
    return [requested, ...tiers.filter((id) => id !== requested)];
  }
  return tiers;
}

export function accountOrder(count: number): readonly number[] {
  if (count <= 1) return [0];
  const primary = requestCounter++ % count;
  return Array.from({ length: count }, (_, index) => (primary + index) % count);
}

export function quotaKey(accountIndex: number, modelId: string): string {
  return `acc${accountIndex + 1}:${modelId}`;
}

export function isModelQuotaExhausted(key: string, now = Date.now()): boolean {
  const resetAt = exhaustedUntil.get(key);
  if (resetAt === undefined) return false;
  if (now >= resetAt) {
    exhaustedUntil.delete(key);
    return false;
  }
  return true;
}

function nextUtcMidnight(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function markModelQuotaExhausted(key: string, error: unknown, now = Date.now()): void {
  let resetAt = nextUtcMidnight(now);
  const message = error instanceof Error ? error.message : String(error ?? "");
  const delayHours = message.match(/retry in\s+(\d+)h/i);
  const hours = delayHours?.[1] ? Number.parseInt(delayHours[1], 10) : Number.NaN;
  if (!Number.isNaN(hours) && hours > 0) resetAt = now + hours * 60 * 60 * 1000;
  exhaustedUntil.set(key, resetAt);
}

export function isDailyQuotaExhaustionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { status?: number; statusCode?: number; message?: string };
  const status = record.statusCode ?? record.status;
  const message = String(record.message ?? "").toLowerCase();
  if (/retry in\s+\d+(\.\d+)?s/i.test(message)) return false;
  const quotaPhrase =
    message.includes("quota exceeded") || message.includes("exceeded your current quota");
  const billingBlock = message.includes("plan and billing");
  const code429 = status === 429 || message.includes('"code":429');
  return (
    message.includes("free_tier_requests") ||
    message.includes("requests per day") ||
    message.includes("per_day") ||
    message.includes("generativelanguage.googleapis.com/generate_content_free_tier_requests") ||
    /retry in\s+\d+h/i.test(message) ||
    (code429 && quotaPhrase && billingBlock && !message.includes("minute"))
  );
}

export function isRecoverableModelError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (isDailyQuotaExhaustionError(error)) return true;
  const record = error as { status?: number; statusCode?: number; name?: string; message?: string };
  const status = record.statusCode ?? record.status;
  if (status === 429 || status === 503 || status === 404 || status === 500) return true;
  const message = String(record.message ?? "").toLowerCase();
  return (
    record.name === "AbortError" ||
    record.name === "TimeoutError" ||
    message.includes("abort") ||
    message.includes("timeout") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("high demand") ||
    message.includes("no longer available") ||
    message.includes("not found") ||
    message.includes('"code":404') ||
    message.includes('"code":429') ||
    message.includes('"code":500') ||
    message.includes('"code":503') ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("connect timeout")
  );
}
