import type { BillingProvider, PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import { createLocalBillingEmulator } from "@open-prompt-os/adapters";
import type { Auth } from "@open-prompt-os/auth";
import { redactSecrets } from "@open-prompt-os/core";
import { prisma } from "@open-prompt-os/db";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { z } from "zod";
import type { ApiEnv } from "./app-env.js";
import { resolveActor } from "./auth/session-resolver.js";
import { clientKey } from "./client-key.js";
import {
  createLogger,
  enrichRequestContext,
  parseTraceparent,
  resolveRequestId,
  runWithRequestContext,
} from "./logger.js";
import { createRouter } from "./router.js";
import { registerComposeStream } from "./routes/compose-stream.js";
import { registerVideoReverseEngineerStream } from "./routes/reverse-engineer-video-stream.js";
import { registerSeoRoutes } from "./routes/seo-routes.js";
import { registerStripeWebhook } from "./routes/stripe-webhook.js";

export interface AppOptions {
  orchestrator: PromptOrchestrator;
  billingProvider?: BillingProvider;
  webOrigins: readonly string[];
  trustProxy: boolean;
  allowRequest: (key: string) => boolean;
  auth?: Auth;
  oauthProviders?: { google: boolean; github: boolean };
  log?: (line: string) => void;
}

export function createApp(options: AppOptions) {
  const app = new Hono<ApiEnv>();
  const billingProvider = options.billingProvider ?? createLocalBillingEmulator();
  const router = createRouter({
    orchestrator: options.orchestrator,
    billingProvider,
    webOrigins: options.webOrigins,
  });
  const rpc = new RPCHandler(router);
  const appLogger = createLogger({ sink: options.log });

  app.use("*", async (c, next) => {
    const requestId = resolveRequestId(c.req.header("x-request-id"));
    const { traceId, spanId } = parseTraceparent(c.req.header("traceparent"));
    c.set("requestId", requestId);
    const started = Date.now();

    await runWithRequestContext(
      {
        requestId,
        traceId,
        spanId,
        sink: options.log,
      },
      async () => {
        const contentType = c.req.header("content-type") ?? "";
        let requestData: unknown = undefined;
        if (contentType.includes("application/json")) {
          try {
            const rawText = await c.req.raw.clone().text();
            requestData = rawText ? (JSON.parse(rawText) as unknown) : undefined;
          } catch {
            requestData = "[unparseable json]";
          }
        }
        const queryData = c.req.query();
        appLogger.debug(`API entry: ${c.req.method} ${c.req.path}`, {
          event: "api.entry",
          method: c.req.method,
          path: c.req.path,
          ...(Object.keys(queryData).length > 0 ? { query: queryData } : {}),
          ...(requestData !== undefined ? { requestData } : {}),
        });

        await next();
        c.res.headers.set("x-request-id", requestId);
        c.res.headers.set("x-content-type-options", "nosniff");
        c.res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
        c.res.headers.set("x-frame-options", "DENY");

        const durationMs = Date.now() - started;
        const status = c.res.status;
        const resContentType = c.res.headers.get("content-type") ?? "";
        let responseData: unknown = undefined;
        if (resContentType.includes("text/event-stream")) {
          responseData = { streaming: true };
        } else if (resContentType.includes("application/json")) {
          try {
            responseData = await c.res.clone().json();
          } catch {
            responseData = "[unparseable json]";
          }
        }
        appLogger.debug(`API exit: ${c.req.method} ${c.req.path} ${status} ${durationMs}ms`, {
          event: "api.exit",
          method: c.req.method,
          path: c.req.path,
          status,
          durationMs,
          ...(responseData !== undefined ? { responseData } : {}),
        });

        const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
        appLogger[level](`${c.req.method} ${c.req.path} ${status} ${durationMs}ms`, {
          event: "http.request",
          method: c.req.method,
          path: c.req.path,
          status,
          durationMs,
        });
      },
    );
  });
  app.use(
    "*",
    cors({
      origin: [...options.webOrigins],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "content-type",
        "x-request-id",
        "traceparent",
        "x-user-id",
        "x-space-id",
        "x-captcha-response",
        "authorization",
      ],
      exposeHeaders: ["x-request-id"],
      credentials: true,
    }),
  );
  const reverseEngineerBodyLimit = bodyLimit({ maxSize: 6 * 1024 * 1024 });
  const videoReverseEngineerBodyLimit = bodyLimit({ maxSize: 105 * 1024 * 1024 });
  const defaultBodyLimit = bodyLimit({ maxSize: 32 * 1024 });
  const stripeWebhookBodyLimit = bodyLimit({ maxSize: 256 * 1024 });
  app.use("*", async (c, next) => {
    if (c.req.path === "/rpc/prompts/reverseEngineer") {
      return reverseEngineerBodyLimit(c, next);
    }
    if (c.req.path === "/api/prompts/reverse-engineer-video/stream") {
      return videoReverseEngineerBodyLimit(c, next);
    }
    if (c.req.path === "/api/webhooks/stripe") {
      return stripeWebhookBodyLimit(c, next);
    }
    return defaultBodyLimit(c, next);
  });
  app.get("/healthz", (c) => {
    c.header("x-request-id", c.get("requestId"));
    return c.json({ ok: true });
  });

  const enforceLimit = async (
    c: { get: (key: "requestId") => string; json: (body: unknown, status: number) => Response },
    next: () => Promise<void>,
    key: string,
  ) => {
    if (!options.allowRequest(key)) {
      return c.json(
        { code: "RATE_LIMITED", message: "Too many requests.", requestId: c.get("requestId") },
        429,
      );
    }
    await next();
  };
  app.use("/rpc/*", async (c, next) => {
    return enforceLimit(c, next, clientKey(c, options.trustProxy));
  });
  app.use("/api/*", async (c, next) => {
    return enforceLimit(c, next, clientKey(c, options.trustProxy));
  });
  app.get("/api/auth/providers", (c) => {
    return c.json({
      google: Boolean(options.oauthProviders?.google),
      github: Boolean(options.oauthProviders?.github),
    });
  });

  const SignupStatusBodySchema = z.object({
    email: z.string().trim().email(),
  });

  app.post("/api/auth/signup-status", async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(
        {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON payload.",
          requestId: c.get("requestId"),
        },
        400,
      );
    }
    const parsed = SignupStatusBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          code: "VALIDATION_ERROR",
          message: "A valid email address is required.",
          requestId: c.get("requestId"),
        },
        400,
      );
    }
    const email = parsed.data.email.toLowerCase();
    const timeoutSentinel = Symbol("signup-status-timeout");
    try {
      const existing = await Promise.race([
        prisma.user.findUnique({
          where: { email },
          select: { id: true },
        }),
        new Promise<typeof timeoutSentinel>((resolve) =>
          setTimeout(() => resolve(timeoutSentinel), 1500),
        ),
      ]);
      if (existing === timeoutSentinel) {
        return c.json({ isNewUser: null });
      }
      return c.json({ isNewUser: !existing });
    } catch {
      return c.json({ isNewUser: null });
    }
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => {
    if (!options.auth) {
      return c.json(
        {
          code: "INTERNAL_ERROR",
          message: "Authentication is not configured.",
          requestId: c.get("requestId"),
        },
        503,
      );
    }
    return options.auth.handler(c.req.raw);
  });

  registerStripeWebhook(app, billingProvider);
  registerSeoRoutes(app, options.webOrigins);

  registerComposeStream(app, {
    orchestrator: options.orchestrator,
    allowRequest: () => true,
    trustProxy: options.trustProxy,
    auth: options.auth,
  });

  registerVideoReverseEngineerStream(app, {
    orchestrator: options.orchestrator,
    trustProxy: options.trustProxy,
    auth: options.auth,
  });

  app.use("/rpc/*", async (c) => {
    const requestId = c.get("requestId");
    const actor = await resolveActor(c, options.trustProxy, options.auth);
    enrichRequestContext({
      userId: actor.userId,
      spaceId: actor.spaceId,
      rpcProcedure: c.req.path.replace(/^\/rpc\//, ""),
    });
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: {
        requestId,
        actor,
        signal: c.req.raw.signal,
      },
    });
    if (!matched || !response)
      return c.json({ code: "INTERNAL_ERROR", message: "Not found", requestId }, 404);
    if (response.status === 400) {
      const text = await response.text();
      let parsed: {
        code?: string;
        message?: string;
        json?: { code?: string; message?: string };
      } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // ignore
      }
      const err = parsed?.json ?? parsed;
      const message = err?.message ?? "Request failed validation.";
      const code =
        err?.code && err.code !== "BAD_REQUEST"
          ? err.code
          : message.toLowerCase().includes("validation") || message.toLowerCase().includes("failed")
            ? "VALIDATION_ERROR"
            : (err?.code ?? "VALIDATION_ERROR");

      appLogger.warn("oRPC validation failed", {
        event: "rpc.validation_error",
        code,
        errorMessage: message,
      });

      return c.json({ code, message, requestId }, 400);
    }
    if (response.status >= 500) {
      const errorText = await response
        .clone()
        .text()
        .catch(() => "");
      appLogger.error("oRPC procedure returned server error", {
        event: "rpc.error",
        status: response.status,
        errorBody: errorText.slice(0, 500),
      });
    }
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    return new Response(response.body, { status: response.status, headers });
  });

  app.onError((error, c) => {
    const requestId = c.get("requestId");
    appLogger.error("Unhandled HTTP exception", {
      event: "http.unhandled_error",
      path: c.req.path,
      err: error,
    });
    return c.json(
      {
        code: "INTERNAL_ERROR",
        message: redactSecrets(error.message),
        requestId,
      },
      500,
    );
  });

  return app;
}
