import { redactSecrets } from "@open-prompt-os/core";
import { PostHog } from "posthog-node";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export interface ErrorCaptureContext {
  readonly distinctId?: string;
  readonly requestId?: string;
  readonly path?: string;
  readonly method?: string;
  readonly status?: number;
  readonly source?: string;
}

export interface ApiErrorTracker {
  captureException(error: unknown, context?: ErrorCaptureContext): void;
  shutdown(): Promise<void>;
}

export interface PostHogErrorTrackerOptions {
  readonly apiKey?: string;
  readonly host?: string;
  readonly enableExceptionAutocapture?: boolean;
}

const NOOP_ERROR_TRACKER: ApiErrorTracker = {
  captureException() {},
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
      if (context?.requestId) properties.requestId = context.requestId;
      if (context?.path) properties.path = context.path;
      if (context?.method) properties.method = context.method;
      if (context?.status !== undefined) properties.status = context.status;
      if (context?.source) properties.source = context.source;

      client.captureException(sanitizeErrorForCapture(error), {
        ...(context?.distinctId ? { distinctId: context.distinctId } : {}),
        properties,
      });
    },
    async shutdown() {
      await client.shutdown();
    },
  };
}
