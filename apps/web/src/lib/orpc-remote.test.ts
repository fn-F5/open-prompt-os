import type { ComposePromptOutput } from "@open-prompt-os/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authClient } from "./auth-client.js";
import { OrpcClientError, orpcClient, resetOrpcTestState } from "./orpc.js";

const input = {
  interactionId: "int_remote",
  draft: {
    rawInput: "Write a checklist for [Service_Name]",
    mode: "text" as const,
    modelId: "gemini-2.5-pro",
    constraints: [] as string[],
    guardrails: [] as string[],
    advanced: {},
  },
};

const output: ComposePromptOutput = {
  interactionId: "int_remote",
  compiledPrompt: "Hello world",
  detectedVariables: [],
  followUpQuestions: [],
  providerId: "rule-synthesizer",
  modelId: "rule-synthesizer",
  latencyMs: 4,
  healedFromFailure: false,
  remainingDailyPrompts: null,
  requestId: "req_remote",
};

describe("remote compose client", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetOrpcTestState();
    await authClient.signOut();
  });

  it("keeps the local synthesizer when VITE_API_URL is unset", async () => {
    vi.stubEnv("VITE_API_URL", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await orpcClient.prompts.compose(input);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.compiledPrompt.length).toBeGreaterThan(0);
    expect(result.providerId).not.toBe("");
  });

  it("streams deltas from the API and forwards the abort signal", async () => {
    vi.stubEnv("VITE_API_URL", "http://127.0.0.1:3001");
    const controller = new AbortController();
    const chunks: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      const body = [
        `event: text-delta\ndata: ${JSON.stringify({ text: "Hello" })}\n\n`,
        `event: text-delta\ndata: ${JSON.stringify({ text: " world" })}\n\n`,
        `event: done\ndata: ${JSON.stringify(output)}\n\n`,
      ].join("");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    const result = await orpcClient.prompts.compose(input, {
      signal: controller.signal,
      onChunk: (partial) => chunks.push(partial),
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/prompts/compose/stream");
    expect(chunks).toEqual(["Hello", "Hello world"]);
    expect(result.compiledPrompt).toBe("Hello world");
    expect(result.providerId).toBe("rule-synthesizer");
  });

  it("dispatches remote RPC calls with auth headers for library operations", async () => {
    vi.stubEnv("VITE_API_URL", "http://127.0.0.1:3001");
    await authClient.signInWithEmail({
      email: "engineer@company.com",
      name: "Lead Engineer",
    });

    const calls: Array<{ url: string; body: unknown; headers: HeadersInit | undefined }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
        headers: init?.headers,
      });

      const urlStr = String(url);
      if (urlStr.includes("/rpc/prompts/save")) {
        return new Response(
          JSON.stringify({
            json: {
              id: "prm_123",
              title: "Saved Prompt",
              rawInput: "Prompt",
              compiledPrompt: "Compiled",
              mode: "text",
              framework: "costar",
              modelId: "claude-3-7-sonnet",
              category: "Engineering",
              tags: [],
              detectedVariables: [],
              isShared: false,
              shareId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/rpc/prompts/delete")) {
        return new Response(JSON.stringify({ json: { deleted: true } }), { status: 200 });
      }
      if (urlStr.includes("/rpc/prompts/share")) {
        return new Response(
          JSON.stringify({
            json: { shareId: "shr_123", shareUrl: "https://test.os/share/shr_123" },
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/rpc/prompts/getShared")) {
        return new Response(
          JSON.stringify({
            json: {
              id: "prm_shared",
              title: "Public Prompt",
              rawInput: "Raw",
              compiledPrompt: "Compiled",
              mode: "text",
              framework: "costar",
              modelId: "claude-3-7-sonnet",
              category: "General",
              tags: [],
              detectedVariables: [],
              isShared: true,
              shareId: "shr_123",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/rpc/prompts/history")) {
        return new Response(JSON.stringify({ json: { items: [], nextCursor: null } }), {
          status: 200,
        });
      }
      if (urlStr.includes("/rpc/billing/status")) {
        return new Response(
          JSON.stringify({
            json: {
              plan: "pro",
              status: "active",
              remainingDailyPrompts: 499,
              dailyLimit: 500,
              resetAt: new Date().toISOString(),
              seats: 1,
              currentPeriodEnd: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ json: {} }), { status: 200 });
    });

    const saved = await orpcClient.prompts.save({
      title: "Saved Prompt",
      rawInput: "Prompt",
      compiledPrompt: "Compiled",
      mode: "text",
      framework: "costar",
      modelId: "claude-3-7-sonnet",
      category: "Engineering",
      tags: [],
    });
    expect(saved.id).toBe("prm_123");
    expect(calls[0]?.url).toBe("http://127.0.0.1:3001/rpc/prompts/save");
    const saveHeaders = calls[0]?.headers as Record<string, string>;
    expect(saveHeaders["x-user-id"]).toBeDefined();
    expect(saveHeaders["x-space-id"]).toBeDefined();

    const del = await orpcClient.prompts.delete({ id: "prm_123" });
    expect(del.deleted).toBe(true);

    const share = await orpcClient.prompts.share({ id: "prm_123" });
    expect(share.shareId).toBe("shr_123");

    const shared = await orpcClient.prompts.getShared({ shareId: "shr_123" });
    expect(shared?.id).toBe("prm_shared");

    const hist = await orpcClient.prompts.history();
    expect(hist.items).toEqual([]);

    const billing = await orpcClient.billing.status();
    expect(billing.plan).toBe("pro");
    expect(billing.remainingDailyPrompts).toBe(499);
  });

  it("translates HTTP error responses to OrpcClientError", async () => {
    vi.stubEnv("VITE_API_URL", "http://127.0.0.1:3001");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "QUOTA_EXCEEDED",
          message: "Daily limit reached.",
          requestId: "req_quota_err",
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      orpcClient.prompts.refine({
        originalPrompt: "test",
        mode: "improve",
        targetLength: "balanced",
      }),
    ).rejects.toThrowError(OrpcClientError);
  });
});
