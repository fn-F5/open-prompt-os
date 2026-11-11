import type { LlmStreamEvent } from "@open-prompt-os/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicAdapter } from "./anthropic.js";

const request = {
  requestId: "req_anthropic",
  systemPrompt: "preamble",
  userPrompt: "draft",
  timeoutMs: 1000,
};

describe("createAnthropicAdapter", () => {
  it("sends the system prompt separately from the user message", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          model: "claude-3-7-sonnet",
          content: [{ type: "text", text: "Improved" }],
          usage: { input_tokens: 2, output_tokens: 1 },
        }),
        { status: 200 },
      );
    });
    const adapter = createAnthropicAdapter({
      apiKey: "sk-ant-test",
      baseUrl: "https://example.test",
      fetchImpl,
    });
    const result = await adapter.complete(request);
    expect(result.text).toBe("Improved");
    const init = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as {
      system: string;
      messages: Array<{ role: string }>;
    };
    expect(body.system).toBe("preamble");
    expect(body.messages).toEqual([{ role: "user", content: "draft" }]);
    const headers = new Headers(init?.headers);
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("reads content_block_delta events", async () => {
    const sse = [
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } })}\n\n`,
      `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ].join("");
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL) => new Response(sse, { status: 200 }),
    );
    const adapter = createAnthropicAdapter({
      apiKey: "sk-ant-test",
      baseUrl: "https://example.test",
      fetchImpl,
    });
    const events: LlmStreamEvent[] = [];
    for await (const event of adapter.stream(request)) events.push(event);
    expect(events[0]).toEqual({ type: "text-delta", text: "Hi" });
    if (events[1]?.type === "done") expect(events[1].result.text).toBe("Hi");
  });

  it("is unconfigured when the key is empty", () => {
    expect(createAnthropicAdapter({ apiKey: "  " }).isConfigured()).toBe(false);
  });
});
