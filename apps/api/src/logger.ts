import { AsyncLocalStorage } from "node:async_hooks";
import { redactSecrets } from "@open-prompt-os/core";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RequestLogContext {
  readonly requestId: string;
  readonly traceId?: string;
  readonly spanId?: string;
  userId?: string;
  spaceId?: string;
  rpcProcedure?: string;
  readonly sink?: (line: string) => void;
}

const requestContextStorage = new AsyncLocalStorage<RequestLogContext>();

const FORBIDDEN_LOG_KEYS = new Set([
  "rawInput",
  "compiledPrompt",
  "originalPrompt",
  "failedOutput",
  "imageBase64",
  "password",
  "otp",
  "token",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "set-cookie",
  "email",
  "contactEmail",
  "userEmail",
]);

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

function parseLogLevel(raw: string | undefined): LogLevel {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return "info";
}

/**
 * Validates an incoming `x-request-id` header or generates a fresh UUID.
 */
export function resolveRequestId(incoming: string | undefined): string {
  const trimmed = incoming?.trim();
  if (trimmed && /^[A-Za-z0-9._-]{6,64}$/.test(trimmed)) {
    return trimmed;
  }
  return crypto.randomUUID();
}

/**
 * Parses a W3C `traceparent` header (`00-<32hex traceId>-<16hex spanId>-<flags>`).
 */
export function parseTraceparent(header: string | undefined): {
  traceId?: string;
  spanId?: string;
} {
  if (!header) return {};
  const match = header.trim().match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i);
  if (!match) return {};
  return {
    traceId: match[1]?.toLowerCase(),
    spanId: match[2]?.toLowerCase(),
  };
}

export function serializeError(error: unknown): {
  name: string;
  message: string;
  code?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    return {
      name: error.name,
      message: redactSecrets(error.message),
      ...(code ? { code } : {}),
      ...(error.stack ? { stack: redactSecrets(error.stack) } : {}),
    };
  }
  return {
    name: "UnknownError",
    message: redactSecrets(String(error)),
  };
}

/**
 * Deeply sanitizes log bindings so secrets, raw prompts, PII emails, and tokens are never logged.
 */
export function sanitizeLogBindings(
  input: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > 4) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_LOG_KEYS.has(key)) {
      clean[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string") {
      clean[key] = redactSecrets(value);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null ||
      value === undefined
    ) {
      clean[key] = value;
    } else if (value instanceof Error) {
      clean[key] = serializeError(value);
    } else if (Array.isArray(value)) {
      clean[key] = value.slice(0, 20).map((item) => {
        if (typeof item === "string") return redactSecrets(item);
        if (item instanceof Error) return serializeError(item);
        if (item && typeof item === "object") {
          return sanitizeLogBindings(item as Record<string, unknown>, depth + 1);
        }
        return item;
      });
    } else if (typeof value === "object") {
      clean[key] = sanitizeLogBindings(value as Record<string, unknown>, depth + 1);
    }
  }
  return clean;
}

export function runWithRequestContext<T>(
  ctx: RequestLogContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return requestContextStorage.run(ctx, fn);
}

export function getRequestContext(): RequestLogContext | undefined {
  return requestContextStorage.getStore();
}

export function enrichRequestContext(
  patch: Partial<Pick<RequestLogContext, "userId" | "spaceId" | "rpcProcedure">>,
): void {
  const store = requestContextStorage.getStore();
  if (!store) return;
  if (patch.userId !== undefined) store.userId = patch.userId;
  if (patch.spaceId !== undefined) store.spaceId = patch.spaceId;
  if (patch.rpcProcedure !== undefined) store.rpcProcedure = patch.rpcProcedure;
}

export interface Logger {
  debug(msg: string, bindings?: Record<string, unknown>): void;
  info(msg: string, bindings?: Record<string, unknown>): void;
  warn(msg: string, bindings?: Record<string, unknown>): void;
  error(msg: string, bindings?: Record<string, unknown>): void;
}

export function createLogger(options?: {
  minLevel?: LogLevel;
  sink?: (line: string) => void;
}): Logger {
  const minLevel = options?.minLevel ?? parseLogLevel(process.env.LOG_LEVEL);
  const minPriority = LEVEL_PRIORITY[minLevel];
  const defaultSink = options?.sink ?? ((line: string) => console.log(line));

  function write(level: LogLevel, msg: string, bindings: Record<string, unknown> = {}): void {
    if (LEVEL_PRIORITY[level] < minPriority) return;
    const ctx = requestContextStorage.getStore();
    const targetSink = options?.sink ?? ctx?.sink ?? defaultSink;
    const record: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      service: "open-prompt-os-api",
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx?.traceId ? { traceId: ctx.traceId } : {}),
      ...(ctx?.spanId ? { spanId: ctx.spanId } : {}),
      ...(ctx?.userId ? { userId: ctx.userId } : {}),
      ...(ctx?.spaceId ? { spaceId: ctx.spaceId } : {}),
      ...(ctx?.rpcProcedure ? { rpcProcedure: ctx.rpcProcedure } : {}),
      msg: redactSecrets(msg),
      ...sanitizeLogBindings(bindings),
    };
    targetSink(JSON.stringify(record));
  }

  return {
    debug: (msg, bindings) => write("debug", msg, bindings),
    info: (msg, bindings) => write("info", msg, bindings),
    warn: (msg, bindings) => write("warn", msg, bindings),
    error: (msg, bindings) => write("error", msg, bindings),
  };
}

export const logger = createLogger();
