import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import {
  createLogger,
  enrichRequestContext,
  getRequestContext,
  parseTraceparent,
  resolveRequestId,
  runWithRequestContext,
  sanitizeLogBindings,
  serializeError,
} from "./logger.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRuntime } from "./runtime.js";

function parseLogs(lines: readonly string[]): Array<Record<string, unknown>> {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("Structured Logger & Correlation Context", () => {
  it("parses valid W3C traceparent headers and rejects malformed ones", () => {
    expect(parseTraceparent("00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01")).toEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
    });

    expect(parseTraceparent(undefined)).toEqual({});
    expect(parseTraceparent("invalid-header")).toEqual({});
    expect(parseTraceparent("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toEqual({});
  });

  it("preserves safe incoming x-request-id and replaces missing or unsafe values", () => {
    expect(resolveRequestId("  req_abc123_XYZ.1  ")).toBe("req_abc123_XYZ.1");
    expect(resolveRequestId("short")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId("bad\nnewline")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sanitizes forbidden keys, secrets, arrays, nested objects, and Error stacks", () => {
    const err = new Error("Upstream failed for AIzaSySECRET123 and re_live_12345678");
    (err as Error & { code?: string }).code = "ECONNREFUSED";

    const clean = sanitizeLogBindings({
      rawInput: "my private prompt",
      compiledPrompt: "my compiled output",
      contactEmail: "user@example.com",
      apiKey: "sk-secret",
      cookie: "better-auth.session_token=abc",
      safeCount: 3,
      tags: ["Bearer secret_tok_123", { password: "123", ok: true }],
      nested: {
        a: {
          b: {
            c: {
              d: {
                deep: "dropped",
              },
            },
          },
        },
      },
      err,
    });

    expect(clean.rawInput).toBe("[redacted]");
    expect(clean.compiledPrompt).toBe("[redacted]");
    expect(clean.contactEmail).toBe("[redacted]");
    expect(clean.apiKey).toBe("[redacted]");
    expect(clean.cookie).toBe("[redacted]");
    expect(clean.safeCount).toBe(3);
    expect(clean.tags).toEqual(["Bearer [redacted]", { password: "[redacted]", ok: true }]);
    expect(clean.err).toMatchObject({
      name: "Error",
      code: "ECONNREFUSED",
    });
    expect(String((clean.err as { message: string }).message)).not.toContain("AIza");
    expect(String((clean.err as { message: string }).message)).not.toContain("re_live_");
    expect(serializeError("string-err")).toEqual({ name: "UnknownError", message: "string-err" });
  });

  it("filters by minLevel and propagates AsyncLocalStorage context", async () => {
    const lines: string[] = [];
    const log = createLogger({ minLevel: "warn", sink: (line) => lines.push(line) });

    log.debug("ignored debug");
    log.info("ignored info");
    expect(lines).toHaveLength(0);

    await runWithRequestContext(
      {
        requestId: "req_ctx_1",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
      },
      async () => {
        expect(getRequestContext()?.requestId).toBe("req_ctx_1");
        enrichRequestContext({
          userId: "usr_1",
          spaceId: "spc_1",
          rpcProcedure: "prompts.compose",
        });
        log.warn("quota low", { remaining: 1 });
        log.error("boom", { err: new Error("fail sk-12345") });
      },
    );

    expect(getRequestContext()).toBeUndefined();
    const parsed = parseLogs(lines);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      level: "warn",
      service: "open-prompt-os-api",
      requestId: "req_ctx_1",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      userId: "usr_1",
      spaceId: "spc_1",
      rpcProcedure: "prompts.compose",
      msg: "quota low",
      remaining: 1,
    });
    expect(parsed[1]).toMatchObject({
      level: "error",
      requestId: "req_ctx_1",
      msg: "boom",
    });
    expect(JSON.stringify(parsed[1])).not.toContain("sk-12345");
  });

  it("emits canonical NDJSON request logs with traceparent, tenant context, and error logs in createApp", async () => {
    const lines: string[] = [];
    const baseRuntime = createRuntime(loadConfig({}));
    const failingOrchestrator: PromptOrchestrator = {
      ...baseRuntime.orchestrator,
      compose: async () => {
        throw new Error("provider crashed with AIzaSyLEAKEDKEY and sk-proj-9999");
      },
      composeStream: baseRuntime.orchestrator.composeStream.bind(baseRuntime.orchestrator),
      refine: baseRuntime.orchestrator.refine.bind(baseRuntime.orchestrator),
      reverseEngineer: baseRuntime.orchestrator.reverseEngineer.bind(baseRuntime.orchestrator),
      healthSnapshot: () => baseRuntime.orchestrator.healthSnapshot(),
    };

    const app = createApp({
      orchestrator: failingOrchestrator,
      webOrigins: ["http://localhost:5173"],
      trustProxy: false,
      allowRequest: createRateLimiter(100, 60_000),
      log: (line) => lines.push(line),
    });

    // 1. 200 OK with traceparent & x-request-id correlation
    const healthRes = await app.request("http://localhost/healthz", {
      headers: {
        "x-request-id": "req_trace_test_1",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      },
    });
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get("x-request-id")).toBe("req_trace_test_1");

    // 2. 400 validation failure -> warn canonical log + rpc.validation_error
    const badRes = await app.request("http://localhost/rpc/feedback/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_bad_1",
      },
      body: JSON.stringify({ json: { kind: "bug_report", message: "no" } }),
    });
    expect(badRes.status).toBe(400);

    // 3. Invalid Stripe webhook signature -> warn log
    const badWebhook = await app.request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "invalid",
        "x-request-id": "req_wh_bad",
      },
      body: JSON.stringify({ eventId: "evt_1" }),
    });
    expect(badWebhook.status).toBe(400);

    // 4. 500 failure inside compose -> error logs with redacted secrets & serialized err
    const failRes = await app.request("http://localhost/rpc/prompts/compose", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_fail_500",
        "x-user-id": "usr_log_test",
        "x-space-id": "spc_log_test",
      },
      body: JSON.stringify({
        json: {
          interactionId: "int_fail",
          draft: {
            rawInput: "Test prompt that triggers failure",
            mode: "text",
            modelId: "gemini-2.5-pro",
            constraints: [],
            guardrails: [],
            advanced: {},
          },
        },
      }),
    });
    expect(failRes.status).toBe(500);

    const parsed = parseLogs(lines);
    const healthLog = parsed.find(
      (entry) => entry.event === "http.request" && entry.requestId === "req_trace_test_1",
    );
    expect(healthLog).toMatchObject({
      level: "info",
      method: "GET",
      path: "/healthz",
      status: 200,
      requestId: "req_trace_test_1",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
    });

    const badRpcLog = parsed.find(
      (entry) => entry.event === "rpc.validation_error" && entry.requestId === "req_bad_1",
    );
    expect(badRpcLog).toMatchObject({
      level: "warn",
      rpcProcedure: "feedback/submit",
      code: "VALIDATION_ERROR",
    });

    const badWebhookLog = parsed.find(
      (entry) =>
        entry.event === "billing.webhook_invalid_signature" && entry.requestId === "req_wh_bad",
    );
    expect(badWebhookLog).toMatchObject({ level: "warn" });

    const failProcLog = parsed.find(
      (entry) => entry.event === "prompt.execution_failed" && entry.requestId === "req_fail_500",
    );
    expect(failProcLog).toMatchObject({
      level: "error",
      userId: "usr_log_test",
      spaceId: "spc_log_test",
      rpcProcedure: "prompts/compose",
    });
    expect(JSON.stringify(parsed)).not.toContain("AIza");
    expect(JSON.stringify(parsed)).not.toContain("sk-proj-");
  });
});
