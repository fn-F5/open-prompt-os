import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRuntime } from "./runtime.js";

const envFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig(process.env);
const { orchestrator } = createRuntime(config);
const app = createApp({
  orchestrator,
  webOrigins: config.webOrigins,
  trustProxy: config.trustProxy,
  allowRequest: createRateLimiter(config.rateLimitPerMinute, 60_000),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`api listening on ${info.port}`);
});
