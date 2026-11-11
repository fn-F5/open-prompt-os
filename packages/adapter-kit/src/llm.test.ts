import { describe, expect, it } from "vitest";
import { LlmProviderError, type LlmStreamEvent, createFakeAdapter } from "./llm.js";

const request = {
  requestId: "req_test",
  systemPrompt: "server preamble",
  userPrompt: "draft",
  timeoutMs: 1000,
};

describe("createFakeAdapter", () => {
  it("returns a fixed completion and records the request", async () => {
    const adapter = createFakeAdapter({ text: "Hello world" });
    const result = await adapter.complete(request);
    expect(result.text).toBe("Hello world");
    expect(result.providerId).toBe("gemini");
    expect(adapter.lastRequest?.userPrompt).toBe("draft");
  });

  it("streams two deltas and then the same text", async () => {
    const adapter = createFakeAdapter({ text: "Hello world" });
    const events: LlmStreamEvent[] = [];
    for await (const event of adapter.stream(request)) {
      events.push(event);
    }
    expect(events.map((event) => event.type)).toEqual(["text-delta", "text-delta", "done"]);
    const deltas = events.filter((event) => event.type === "text-delta");
    expect(deltas.map((event) => (event.type === "text-delta" ? event.text : "")).join("")).toBe(
      "Hello world",
    );
    const done = events[2];
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.text).toBe("Hello world");
    }
  });

  it("rejects complete when the signal is already aborted", async () => {
    const adapter = createFakeAdapter();
    await expect(
      adapter.complete({ ...request, signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });

  it("stops streaming without a done event when the signal is already aborted", async () => {
    const adapter = createFakeAdapter();
    const events: LlmStreamEvent[] = [];
    await expect(async () => {
      for await (const event of adapter.stream({ ...request, signal: AbortSignal.abort() })) {
        events.push(event);
      }
    }).rejects.toBeInstanceOf(LlmProviderError);
    expect(events.some((event) => event.type === "done")).toBe(false);
  });
});
