import { serve } from "@hono/node-server";
import { logger } from "./logger.js";
import { createServerApp } from "./server.js";

const { app, config, errorTracker, isE2eMode } = createServerApp({ loadDotEnv: true });

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info("API server started", {
    event: "server.started",
    port: info.port,
    e2eTestMode: isE2eMode,
  });
});

function shutdownServer(signal: string) {
  logger.info("Shutting down API server", { event: "server.shutdown", signal });
  server.close(() => {
    void errorTracker.shutdown().finally(() => {
      process.exit(0);
    });
  });
}

process.once("SIGINT", () => shutdownServer("SIGINT"));
process.once("SIGTERM", () => shutdownServer("SIGTERM"));
