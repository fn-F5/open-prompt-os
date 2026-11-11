import type { LlmStreamEvent } from "@open-prompt-os/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleAdapter } from "./openai-compatible.js";

const request = {
  requestId: "req_openai",
  systemPrompt: "preamble",
  userPrompt: "draft",
  timeoutMs: 1000,
  modelId: "gpt-4.1",
};

describe("createOpenAiCompatibleAdapter", () => {
  it("posts a system message and a user message", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          model: "gpt-4.1",
          choices: [{ message: { content: "Hello" } }],
          usage: { prompt_tokens: 3, completion_tokens: 1 },
        }),
        { status: 200 },
      );
    });
    const adapter = createOpenAiCompatibleAdapter({
      id: "openai",
      apiKey: "sk-test-value",
      baseUrl: "https://example.test/v1",
      defaultModel: "gpt-4.1",
      fetchImpl,
    });
    const result = await adapter.complete(request);
    expect(result.text).toBe("Hello");
    const init = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]).toEqual({ role: "system", content: "preamble" });
    expect(body.messages[1]).toEqual({ role: "user", content: "draft" });
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 1 });
  });

  it("parses streamed deltas", async () => {
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(sse, { status: 200 });
    });
    const adapter = createOpenAiCompatibleAdapter({
      id: "groq",
      apiKey: "sk-test-value",
      baseUrl: "https://example.test/openai/v1",
      defaultModel: "llama-3.3-70b-versatile",
      fetchImpl,
    });
    const events: LlmStreamEvent[] = [];
    for await (const event of adapter.stream(request)) events.push(event);
    expect(events[0]).toEqual({ type: "text-delta", text: "Hel" });
    expect(events[1]).toEqual({ type: "text-delta", text: "lo" });
    if (events[2]?.type === "done") expect(events[2].result.text).toBe("Hello");
  });

  it("stays unconfigured without a key and maps timeouts", async () => {
    const missing = createOpenAiCompatibleAdapter({
      id: "openrouter",
      apiKey: "",
      baseUrl: "https://example.test/api/v1",
      defaultModel: "openai/gpt-4.1",
    });
    expect(missing.isConfigured()).toBe(false);

    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const adapter = createOpenAiCompatibleAdapter({
      id: "openai",
      apiKey: "sk-test-value",
      baseUrl: "https://example.test/v1",
      defaultModel: "gpt-4.1",
      fetchImpl,
    });
    await expect(adapter.complete({ ...request, timeoutMs: 20 })).rejects.toMatchObject({
      code: "timeout",
    });
  });
});
