import type { Hono } from "hono";
import type { ApiEnv } from "./app-env.js";
import { logger } from "./logger.js";
import { createServerApp } from "./server.js";

let cachedApp: Hono<ApiEnv> | null = null;

function getApp(): Hono<ApiEnv> {
  if (!cachedApp) {
    try {
      cachedApp = createServerApp({ loadDotEnv: false }).app;
    } catch (error) {
      logger.error("Failed to boot API server for Vercel", {
        event: "vercel.boot_error",
        err: error,
      });
      throw error;
    }
  }
  return cachedApp;
}

export default {
  fetch(request: Request) {
    return getApp().fetch(request);
  },
};
