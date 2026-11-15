import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import type { ComposePromptOutput } from "@open-prompt-os/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRuntime } from "./runtime.js";

const draft = {
  interactionId: "int_test",
  draft: {
    rawInput: "Write a checklist for [Service_Name]",
    mode: "text" as const,
    modelId: "gemini-2.5-pro",
    constraints: [] as string[],
    guardrails: [] as string[],
    advanced: {},
  },
};

function runtimePlaceholderReverseEngineer(): PromptOrchestrator["reverseEngineer"] {
  return createRuntime(loadConfig({})).orchestrator.reverseEngineer;
}

function buildApp(
  limit: number,
  orchestrator = createRuntime(loadConfig({})).orchestrator,
  log?: (line: string) => void,
) {
  return createApp({
    orchestrator,
    webOrigins: ["http://localhost:5173"],
    trustProxy: false,
    allowRequest: createRateLimiter(limit, 60_000),
    log: log ?? (() => {}),
  });
}

describe("api", () => {
  it("rejects an empty prompt with VALIDATION_ERROR", async () => {
    const app = buildApp(20);
    const response = await app.request("http://localhost/rpc/prompts/compose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        json: { ...draft, draft: { ...draft.draft, rawInput: "  " } },
      }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await response.text()).toContain("VALIDATION_ERROR");
  });

  it("rate limits repeated compose calls", async () => {
    const app = buildApp(2);
    const key = `ratelimit_${Date.now()}`;
    const call = () =>
      app.request("http://localhost/rpc/prompts/compose", {
        method: "POST",
        headers: { "content-type": "application/json", "x-client-key": key },
        body: JSON.stringify({ json: draft }),
      });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(await limited.text()).toContain("RATE_LIMITED");
  });

  it("does not echo a configured API key in health or error JSON", async () => {
    const config = loadConfig({ GEMINI_API_KEY: "AIzaTEST" });
    const runtime = createRuntime(config);
    const orchestrator: PromptOrchestrator = {
      compose: async () => {
        throw new Error(`provider failed ${config.geminiApiKey}`);
      },
      composeStream: runtime.orchestrator.composeStream.bind(runtime.orchestrator),
      refine: runtime.orchestrator.refine.bind(runtime.orchestrator),
      reverseEngineer: runtime.orchestrator.reverseEngineer.bind(runtime.orchestrator),
      healthSnapshot: () => runtime.orchestrator.healthSnapshot(),
    };
    const logs: string[] = [];
    const app = buildApp(20, orchestrator, (line) => logs.push(line));
    const health = await app.request("http://localhost/healthz");
    expect(await health.text()).not.toContain("AIza");
    const failed = await app.request("http://localhost/rpc/prompts/compose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: draft }),
    });
    expect(await failed.text()).not.toContain("AIza");
    expect(logs.join("\n")).not.toContain("AIza");
  });

  it("treats an empty provider key as unconfigured", () => {
    expect(loadConfig({ GEMINI_API_KEY: "" }).geminiApiKey).toBeUndefined();
  });

  it("allows x-captcha-response in CORS preflight headers", async () => {
    const app = buildApp(20);
    const response = await app.request(
      "http://localhost/api/auth/email-otp/send-verification-otp",
      {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,x-captcha-response",
        },
      },
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "x-captcha-response",
    );
  });
});

describe("compose stream", () => {
  it("emits text deltas before the done payload", async () => {
    const key = `stream_delta_${Date.now()}`;
    const output: ComposePromptOutput = {
      interactionId: "int_test",
      compiledPrompt: "Hello",
      detectedVariables: [],
      followUpQuestions: [],
      providerId: "rule-synthesizer",
      modelId: "rule-synthesizer",
      latencyMs: 1,
      healedFromFailure: false,
      remainingDailyPrompts: null,
      requestId: "req_stream",
    };
    const orchestrator: PromptOrchestrator = {
      async compose() {
        return output;
      },
      async *composeStream() {
        yield { type: "text-delta", text: "Hello" };
        yield { type: "done", output };
      },
      async refine(input) {
        return {
          optimizedPrompt: input.originalPrompt,
          detectedVariables: [],
          unresolvedVariables: [],
          duplicateVariables: [],
          findings: [],
          summary: "ok",
          providerId: "rule-synthesizer",
          modelId: "rule-synthesizer",
          latencyMs: 1,
          requestId: "req_refine",
        };
      },
      reverseEngineer: runtimePlaceholderReverseEngineer(),
      healthSnapshot: () => [],
    };
    const app = buildApp(20, orchestrator);
    const response = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-key": key },
      body: JSON.stringify(draft),
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body.indexOf("event: text-delta")).toBeLessThan(body.indexOf("event: done"));
    expect(body).toContain('data: {"text":"Hello"}');
    expect(body).toContain('"compiledPrompt":"Hello"');
  });

  it("returns JSON instead of an event stream when validation fails", async () => {
    const app = buildApp(20);
    const response = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, draft: { ...draft.draft, rawInput: "  " } }),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("stops the iterator when the request is aborted", async () => {
    const stopped = { value: false };
    const output: ComposePromptOutput = {
      interactionId: "int_test",
      compiledPrompt: "Hello",
      detectedVariables: [],
      followUpQuestions: [],
      providerId: "rule-synthesizer",
      modelId: "rule-synthesizer",
      latencyMs: 1,
      healedFromFailure: false,
      remainingDailyPrompts: null,
      requestId: "req_abort",
    };
    const orchestrator: PromptOrchestrator = {
      async compose() {
        return output;
      },
      async *composeStream(_input, ctx) {
        try {
          yield { type: "text-delta", text: "Hello" };
          await new Promise<void>((resolve) => {
            if (ctx.signal?.aborted) {
              stopped.value = true;
              resolve();
              return;
            }
            const timer = setTimeout(resolve, 5_000);
            ctx.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              stopped.value = true;
              resolve();
            });
          });
        } finally {
          if (ctx.signal?.aborted) stopped.value = true;
        }
      },
      async refine(input) {
        return {
          optimizedPrompt: input.originalPrompt,
          detectedVariables: [],
          unresolvedVariables: [],
          duplicateVariables: [],
          findings: [],
          summary: "ok",
          providerId: "rule-synthesizer",
          modelId: "rule-synthesizer",
          latencyMs: 1,
          requestId: "req_refine",
        };
      },
      reverseEngineer: runtimePlaceholderReverseEngineer(),
      healthSnapshot: () => [],
    };
    const app = buildApp(20, orchestrator);
    const controller = new AbortController();
    const abortKey = `stream_abort_${Date.now()}`;
    const response = await app.request("http://localhost/api/prompts/compose/stream", {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-key": abortKey },
      body: JSON.stringify(draft),
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    await reader?.read();
    controller.abort();
    await reader?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stopped.value).toBe(true);
  });
});

describe("runtime, config, rate-limiter, and clientKey helpers", () => {
  it("throws when integer config env variables are invalid", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow(/Expected a positive integer/);
    expect(() => loadConfig({ LLM_TIMEOUT_MS: "abc" })).toThrow(/Expected a positive integer/);
    expect(() => loadConfig({ RATE_LIMIT_PER_MINUTE: "-5" })).toThrow(
      /Expected a positive integer/,
    );
  });

  it("registers configured optional provider adapters in createRuntime", () => {
    const { orchestrator } = createRuntime(
      loadConfig({
        GEMINI_API_KEY: "gem-1",
        OPENAI_API_KEY: "oai-1",
        GROQ_API_KEY: "groq-1",
        OPENROUTER_API_KEY: "or-1",
        ANTHROPIC_API_KEY: "ant-1",
        OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      }),
    );
    const ids = orchestrator.healthSnapshot().map((entry) => entry.providerId);
    expect(ids).toEqual([
      "rule-synthesizer",
      "gemini",
      "openai",
      "groq",
      "openrouter",
      "anthropic",
      "ollama",
    ]);
  });

  it("resets rate limiter counts after windowMs and prunes stale entries above 10k", () => {
    let clock = 1_000;
    const allow = createRateLimiter(2, 500, () => clock);

    expect(allow("client-a")).toBe(true);
    expect(allow("client-a")).toBe(true);
    expect(allow("client-a")).toBe(false);

    clock += 600;
    expect(allow("client-a")).toBe(true);

    for (let i = 0; i <= 10_001; i++) {
      allow(`bulk-${i}`);
    }
    clock += 1_000;
    expect(allow("after-sweep")).toBe(true);
  });

  it("resolves clientKey from trusted proxy headers and falls back safely", async () => {
    const { Hono } = await import("hono");
    const { clientKey } = await import("./client-key.js");
    const app = new Hono();
    app.get("/trust", (c) => c.text(clientKey(c, true)));
    app.get("/untrusted", (c) => c.text(clientKey(c, false)));

    const cfRes = await app.request("/trust", {
      headers: { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" },
    });
    expect(await cfRes.text()).toBe("203.0.113.9");

    const xffRes = await app.request("/trust", {
      headers: { "x-forwarded-for": "198.51.100.2, 10.0.0.1" },
    });
    expect(await xffRes.text()).toBe("198.51.100.2");

    const fallbackRes = await app.request("/untrusted");
    expect(await fallbackRes.text()).toBe("unknown");
  });
});
