import { describe, expect, it, vi } from "vitest";
import { createOllamaAdapter } from "./ollama.js";

describe("createOllamaAdapter", () => {
  it("is configured from a base URL and omits an authorization header", async () => {
    expect(createOllamaAdapter({ baseUrl: "" }).isConfigured()).toBe(false);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "local" } }], model: "llama3.2" }),
        { status: 200 },
      );
    });
    const adapter = createOllamaAdapter({
      baseUrl: "http://127.0.0.1:11434/v1",
      fetchImpl,
    });
    expect(adapter.isConfigured()).toBe(true);
    const result = await adapter.complete({
      requestId: "req_ollama",
      systemPrompt: "preamble",
      userPrompt: "draft",
      timeoutMs: 1000,
    });
    expect(result.providerId).toBe("ollama");
    expect(result.text).toBe("local");
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
  });
});
