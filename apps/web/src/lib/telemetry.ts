export type TelemetryEventName =
  | "composer_viewed"
  | "composer_mode_changed"
  | "prompt_generation_started"
  | "prompt_generated"
  | "prompt_generation_failed"
  | "advanced_controls_opened"
  | "auth_gate_triggered"
  | "guest_interaction_migrated"
  | "dispatch_attempted"
  | "dispatch_succeeded"
  | "tour_started"
  | "tour_completed"
  | "hotspot_dismissed"
  | "template_used"
  | "prompt_saved"
  | "marketing_section_viewed";

const FORBIDDEN_TELEMETRY_KEYS = new Set([
  "rawInput",
  "prompt",
  "compiledPrompt",
  "originalPrompt",
  "failedOutput",
  "email",
  "passkey",
  "apiKey",
  "evidence",
]);

export interface TelemetryEventRecord {
  readonly event: TelemetryEventName;
  readonly properties: Record<string, string | number | boolean | null | undefined>;
  readonly traceparent: string;
  readonly requestId: string;
  readonly timestamp: string;
}

const telemetryHistory: TelemetryEventRecord[] = [];

function randomHex(length: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * 16)];
  }
  return out;
}

export function createCorrelationHeaders(): {
  readonly traceparent: string;
  readonly "x-request-id": string;
} {
  const traceId = randomHex(32);
  const spanId = randomHex(16);
  return {
    traceparent: `00-${traceId}-${spanId}-01`,
    "x-request-id": `req_${randomHex(12)}`,
  };
}

export function sanitizeTelemetryProperties(
  props: Record<string, unknown> = {},
): Record<string, string | number | boolean | null | undefined> {
  const clean: Record<string, string | number | boolean | null | undefined> = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_TELEMETRY_KEYS.has(key)) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null ||
      value === undefined
    ) {
      clean[key] = value;
    }
  }
  return clean;
}

export function trackEvent(
  event: TelemetryEventName,
  properties: Record<string, unknown> = {},
): TelemetryEventRecord {
  const headers = createCorrelationHeaders();
  const record: TelemetryEventRecord = {
    event,
    properties: sanitizeTelemetryProperties(properties),
    traceparent: headers.traceparent,
    requestId: headers["x-request-id"],
    timestamp: new Date().toISOString(),
  };
  telemetryHistory.push(record);
  if (telemetryHistory.length > 100) {
    telemetryHistory.shift();
  }
  return record;
}

export function getTelemetryHistory(): readonly TelemetryEventRecord[] {
  return telemetryHistory;
}
