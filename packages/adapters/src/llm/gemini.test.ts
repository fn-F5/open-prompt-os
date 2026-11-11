import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import type { LlmStreamEvent } from "@open-prompt-os/adapter-kit";
import { beforeEach, describe, expect, it } from "vitest";
import { resetGeminiFallbackState } from "./gemini-chain.js";
import { type GeminiClient, createGeminiAdapter } from "./gemini.js";

const request = {
  requestId: "req_gemini",
  systemPrompt: "preamble",
  userPrompt: "draft",
  timeoutMs: 1000,
};

describe("createGeminiAdapter", () => {
  beforeEach(() => {
    resetGeminiFallbackState();
  });

  it("reports missing keys as not configured", async () => {
    const adapter = createGeminiAdapter({ apiKey: "" });
    expect(adapter.isConfigured()).toBe(false);
    await expect(adapter.complete(request)).rejects.toMatchObject({ code: "not_configured" });
  });

  it("returns a unary completion from the injected client", async () => {
    const client: GeminiClient = {
      async generateContent() {
        return { text: "Role: editor", inputTokens: 4, outputTokens: 2 };
      },
      async *generateContentStream() {
        yield { text: "" };
      },
    };
    const adapter = createGeminiAdapter({ apiKey: "local-test-key", client });
    const result = await adapter.complete({ ...request, modelId: "gemini-2.5-pro" });
    expect(result.text).toBe("Role: editor");
    expect(result.providerId).toBe("gemini");
    expect(result.modelId).toBe("gemini-3.6-flash");
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 2 });
  });

  it("maps two streamed chunks into deltas and a done event", async () => {
    const client: GeminiClient = {
      async generateContent() {
        return { text: "", inputTokens: 0, outputTokens: 0 };
      },
      async *generateContentStream() {
        yield { text: "Hel" };
        yield { text: "lo" };
      },
    };
    const adapter = createGeminiAdapter({ apiKey: "local-test-key", client });
    const events: LlmStreamEvent[] = [];
    for await (const event of adapter.stream(request)) events.push(event);
    expect(events[0]).toEqual({ type: "text-delta", text: "Hel" });
    expect(events[1]).toEqual({ type: "text-delta", text: "lo" });
    expect(events[2]?.type).toBe("done");
    if (events[2]?.type === "done") expect(events[2].result.text).toBe("Hello");
  });

  it("maps an aborted call to a timeout and redacts provider errors", async () => {
    const hanging: GeminiClient = {
      generateContent(call) {
        return new Promise((_resolve, reject) => {
          call.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
      async *generateContentStream() {
        yield { text: "" };
      },
    };
    const adapter = createGeminiAdapter({ apiKey: "local-test-key", client: hanging });
    await expect(adapter.complete({ ...request, timeoutMs: 20 })).rejects.toMatchObject({
      code: "timeout",
    });

    const leaking: GeminiClient = {
      async generateContent() {
        throw new Error("upstream sk-live-secret-value");
      },
      async *generateContentStream() {
        yield { text: "" };
      },
    };
    const unsafe = createGeminiAdapter({ apiKey: "local-test-key", client: leaking });
    try {
      await unsafe.complete(request);
      throw new Error("expected provider_error");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmProviderError);
      expect((error as Error).message).not.toContain("sk-live-secret-value");
      expect((error as Error).message).toContain("[redacted]");
    }
  });

  it("tries the next Gemini model after a daily quota error", async () => {
    const seen: string[] = [];
    const client: GeminiClient = {
      async generateContent(call) {
        seen.push(call.model);
        if (call.model === "gemini-3.6-flash") {
          throw new Error(
            '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}',
          );
        }
        return { text: "from the next model", inputTokens: 1, outputTokens: 1 };
      },
      async *generateContentStream() {
        yield { text: "" };
      },
    };
    const adapter = createGeminiAdapter({ apiKey: "local-test-key", client });
    const result = await adapter.complete(request);
    expect(result.modelId).toBe("gemini-3.5-flash");
    expect(result.text).toBe("from the next model");
    const again = await adapter.complete(request);
    expect(again.modelId).toBe("gemini-3.5-flash");
    expect(seen.filter((model) => model === "gemini-3.6-flash")).toHaveLength(1);
  });

  it("tries the second key when the first key is out of quota", async () => {
    const clients: GeminiClient[] = [
      {
        async generateContent() {
          throw new Error(
            '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}',
          );
        },
        async *generateContentStream() {
          yield { text: "" };
        },
      },
      {
        async generateContent() {
          return { text: "second account", inputTokens: 1, outputTokens: 1 };
        },
        async *generateContentStream() {
          yield { text: "" };
        },
      },
    ];
    const adapter = createGeminiAdapter({
      apiKey: "local-test-key",
      apiKeys: ["local-second-key"],
      clients,
    });
    const result = await adapter.complete(request);
    expect(result.text).toBe("second account");
    expect(result.modelId).toBe("gemini-3.6-flash");
  });
});
