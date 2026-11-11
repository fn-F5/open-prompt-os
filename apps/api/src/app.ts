import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import { redactSecrets } from "@open-prompt-os/core";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { ApiEnv } from "./app-env.js";
import { clientKey } from "./client-key.js";
import { createRouter } from "./router.js";
import { registerComposeStream } from "./routes/compose-stream.js";

export interface AppOptions {
  orchestrator: PromptOrchestrator;
  webOrigins: readonly string[];
  trustProxy: boolean;
  allowRequest: (key: string) => boolean;
  log?: (line: string) => void;
}

export function createApp(options: AppOptions) {
  const app = new Hono<ApiEnv>();
  const router = createRouter({ orchestrator: options.orchestrator });
  const rpc = new RPCHandler(router);
  const log = options.log ?? ((line: string) => console.log(line));

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    const started = Date.now();
    await next();
    log(
      redactSecrets(
        `${c.req.method} ${c.req.path} ${c.res.status} ${requestId} ${Date.now() - started}ms`,
      ),
    );
  });
  app.use(
    "*",
    cors({
      origin: [...options.webOrigins],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );
  app.use("*", bodyLimit({ maxSize: 32 * 1024 }));
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
  registerComposeStream(app, {
    orchestrator: options.orchestrator,
    allowRequest: () => true,
    trustProxy: options.trustProxy,
  });

  app.use("/rpc/*", async (c) => {
    const requestId = c.get("requestId");
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: {
        requestId,
        clientKey: clientKey(c, options.trustProxy),
        signal: c.req.raw.signal,
      },
    });
    if (!matched || !response)
      return c.json({ code: "INTERNAL_ERROR", message: "Not found", requestId }, 404);
    if (response.status === 400) {
      return c.json(
        { code: "VALIDATION_ERROR", message: "Request failed validation.", requestId },
        400,
      );
    }
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    return new Response(response.body, { status: response.status, headers });
  });

  app.onError((error, c) => {
    const requestId = c.get("requestId");
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
