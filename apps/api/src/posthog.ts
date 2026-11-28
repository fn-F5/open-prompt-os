import { redactSecrets } from "@open-prompt-os/core";
import { PostHog } from "posthog-node";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export interface ErrorCaptureContext {
  readonly distinctId?: string;
  readonly spaceId?: string;
  readonly requestId?: string;
  readonly path?: string;
  readonly method?: string;
  readonly status?: number;
  readonly source?: string;
}

export interface UserIdentifyContext {
  readonly distinctId: string;
  readonly spaceId?: string;
  readonly plan?: string;
  readonly setOnce?: Record<string, string | number | boolean | null | undefined>;
}

export interface UserEventContext {
  readonly distinctId: string;
  readonly event: string;
  readonly properties?: Record<string, string | number | boolean | null | undefined>;
}

export interface ApiErrorTracker {
  captureException(error: unknown, context?: ErrorCaptureContext): void;
  identifyUser?(context: UserIdentifyContext): void;
  captureEvent?(context: UserEventContext): void;
  shutdown(): Promise<void>;
}

export interface PostHogErrorTrackerOptions {
  readonly apiKey?: string;
  readonly host?: string;
  readonly enableExceptionAutocapture?: boolean;
}

export const FORBIDDEN_POSTHOG_KEYS = new Set([
  "rawInput",
  "compiledPrompt",
  "originalPrompt",
  "failedOutput",
  "prompt",
  "message",
  "title",
  "email",
  "contactEmail",
  "userEmail",
  "name",
  "userName",
  "password",
  "otp",
  "token",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "referralDetail",
  "youtubeUrl",
  "imageBase64",
]);

export type SanitizedEventPropertyValue = string | number | boolean | null;

export function sanitizeEventProperties(
  properties?: Record<string, string | number | boolean | null | undefined>,
): Record<string, SanitizedEventPropertyValue> {
  if (!properties) return {};
  const clean: Record<string, SanitizedEventPropertyValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_POSTHOG_KEYS.has(key)) continue;
    if (typeof value === "string") {
      clean[key] = redactSecrets(value);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      clean[key] = value;
    }
  }
  return clean;
}

const NOOP_ERROR_TRACKER: ApiErrorTracker = {
  captureException() {},
  identifyUser() {},
  captureEvent() {},
  async shutdown() {},
};

function sanitizeErrorForCapture(error: unknown): unknown {
  if (error instanceof Error) {
    const sanitized = new Error(redactSecrets(error.message));
    sanitized.name = error.name;
    if (error.stack) {
      sanitized.stack = redactSecrets(error.stack);
    }
    return sanitized;
  }
  if (typeof error === "string") {
    return new Error(redactSecrets(error));
  }
  return error;
}

export function createPostHogErrorTracker(options: PostHogErrorTrackerOptions): ApiErrorTracker {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    return NOOP_ERROR_TRACKER;
  }

  const host =
    options.host && options.host.trim().length > 0
      ? options.host.trim().replace(/\/+$/, "")
      : DEFAULT_POSTHOG_HOST;

  const client = new PostHog(apiKey, {
    host,
    enableExceptionAutocapture: options.enableExceptionAutocapture ?? true,
  });

  return {
    captureException(error, context) {
      const properties: Record<string, string | number> = {};
      const trimmedDistinctId = context?.distinctId?.trim();
      const trimmedSpaceId = context?.spaceId?.trim();
      if (trimmedDistinctId) properties.db_user_id = trimmedDistinctId;
      if (trimmedSpaceId) properties.spaceId = trimmedSpaceId;
      if (context?.requestId) properties.requestId = context.requestId;
      if (context?.path) properties.path = context.path;
      if (context?.method) properties.method = context.method;
      if (context?.status !== undefined) properties.status = context.status;
      if (context?.source) properties.source = context.source;

      client.captureException(sanitizeErrorForCapture(error), {
        ...(trimmedDistinctId ? { distinctId: trimmedDistinctId } : {}),
        properties,
      });
    },
    identifyUser(context) {
      const distinctId = context.distinctId.trim();
      if (!distinctId || typeof client.identify !== "function") return;
      const spaceId = context.spaceId?.trim();
      const plan = context.plan?.trim();
      const sanitizedSetOnce = sanitizeEventProperties(context.setOnce);
      client.identify({
        distinctId,
        properties: {
          $set: {
            db_user_id: distinctId,
            ...(spaceId ? { space_id: spaceId } : {}),
            ...(plan ? { plan } : {}),
          },
          ...(Object.keys(sanitizedSetOnce).length > 0 ? { $set_once: sanitizedSetOnce } : {}),
        },
      });
    },
    captureEvent(context) {
      const distinctId = context.distinctId.trim();
      const event = context.event.trim();
      if (!distinctId || !event || typeof client.capture !== "function") return;
      client.capture({
        distinctId,
        event,
        properties: {
          ...sanitizeEventProperties(context.properties),
          db_user_id: distinctId,
        },
      });
    },
    async shutdown() {
      await client.shutdown();
    },
  };
}
