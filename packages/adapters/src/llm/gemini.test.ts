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

  it("yields the first streamed delta before later chunks resolve and preserves usage", async () => {
    let releaseSecondChunk!: () => void;
    const secondChunkGate = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve;
    });
    const client: GeminiClient = {
      async generateContent() {
        return { text: "", inputTokens: 0, outputTokens: 0 };
      },
      async *generateContentStream() {
        yield { text: "First " };
        await secondChunkGate;
        yield { text: "Second", inputTokens: 12, outputTokens: 7 };
      },
    };

    const adapter = createGeminiAdapter({ apiKey: "local-test-key", client });
    const iterator = adapter.stream(request)[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual({ type: "text-delta", text: "First " });

    releaseSecondChunk();
    const second = await iterator.next();
    expect(second.done).toBe(false);
    expect(second.value).toEqual({ type: "text-delta", text: "Second" });

    const done = await iterator.next();
    expect(done.done).toBe(false);
    expect(done.value?.type).toBe("done");
    if (done.value?.type === "done") {
      expect(done.value.result.text).toBe("First Second");
      expect(done.value.result.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
    }
  });

  it("fails over across models before the first streamed delta and aborts if an error occurs mid-stream", async () => {
    const seenModels: string[] = [];
    const client: GeminiClient = {
      async generateContent() {
        return { text: "", inputTokens: 0, outputTokens: 0 };
      },
      async *generateContentStream(call) {
        seenModels.push(call.model);
        if (call.model === "gemini-3.6-flash") {
          throw new Error(
            '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}',
          );
        }
        yield { text: "from fallback model" };
      },
    };

    const adapter = createGeminiAdapter({ apiKey: "local-test-key", client });
    const events: LlmStreamEvent[] = [];
    for await (const event of adapter.stream(request)) {
      events.push(event);
    }
    expect(seenModels).toEqual(["gemini-3.6-flash", "gemini-3.5-flash"]);
    expect(events[0]).toEqual({ type: "text-delta", text: "from fallback model" });
    expect(events[1]?.type).toBe("done");
    if (events[1]?.type === "done") {
      expect(events[1].result.modelId).toBe("gemini-3.5-flash");
    }

    const midStreamModels: string[] = [];
    const midStreamClient: GeminiClient = {
      async generateContent() {
        return { text: "", inputTokens: 0, outputTokens: 0 };
      },
      async *generateContentStream(call) {
        midStreamModels.push(call.model);
        yield { text: "partial" };
        throw new Error("upstream stream reset sk-secret-token");
      },
    };
    const midStreamAdapter = createGeminiAdapter({
      apiKey: "local-test-key",
      client: midStreamClient,
    });
    const received: LlmStreamEvent[] = [];
    await expect(async () => {
      for await (const event of midStreamAdapter.stream(request)) {
        received.push(event);
      }
    }).rejects.toMatchObject({ code: "provider_error" });
    expect(received).toEqual([{ type: "text-delta", text: "partial" }]);
    expect(midStreamModels).toEqual(["gemini-3.5-flash"]);
  });

  it("uploads video bytes, polls until ACTIVE, analyzes, and deletes the file even on errors or abort", async () => {
    const deleted: string[] = [];
    let pollCount = 0;
    let seenVideoUri: string | undefined;

    const client: GeminiClient = {
      async generateContent(call) {
        seenVideoUri = call.video?.fileUri;
        return { text: '{"ok":true}', inputTokens: 20, outputTokens: 10 };
      },
      async *generateContentStream() {
        yield { text: "" };
      },
      async uploadFile() {
        return {
          name: "files/vid_1",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/vid_1",
          mimeType: "video/mp4",
          state: "PROCESSING",
        };
      },
      async getFile(name) {
        pollCount += 1;
        return {
          name,
          uri: "https://generativelanguage.googleapis.com/v1beta/files/vid_1",
          mimeType: "video/mp4",
          state: pollCount >= 2 ? "ACTIVE" : "PROCESSING",
        };
      },
      async deleteFile(name) {
        deleted.push(name);
      },
    };

    const adapter = createGeminiAdapter({
      apiKey: "local-test-key",
      client,
      filePollIntervalMs: 1,
    });

    const okRes = await adapter.complete({
      ...request,
      responseMimeType: "application/json",
      video: {
        bytes: new Uint8Array([1, 2, 3, 4]),
        mimeType: "video/mp4",
      },
    });
    expect(okRes.text).toBe('{"ok":true}');
    expect(pollCount).toBe(2);
    expect(seenVideoUri).toBe("https://generativelanguage.googleapis.com/v1beta/files/vid_1");
    expect(deleted).toEqual(["files/vid_1"]);

    // Cleanup on generateContent failure
    const failingClient: GeminiClient = {
      ...client,
      async uploadFile() {
        return {
          name: "files/vid_fail",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/vid_fail",
          mimeType: "video/mp4",
          state: "ACTIVE",
        };
      },
      async generateContent() {
        throw new Error("bad upstream status 400");
      },
    };
    const failAdapter = createGeminiAdapter({
      apiKey: "local-test-key",
      client: failingClient,
      filePollIntervalMs: 1,
    });
    await expect(
      failAdapter.complete({
        ...request,
        video: { bytes: new Uint8Array([1, 2]), mimeType: "video/mp4" },
      }),
    ).rejects.toMatchObject({ code: "provider_error" });
    expect(deleted).toContain("files/vid_fail");

    // Cleanup on AbortSignal during polling
    const abortController = new AbortController();
    const abortingClient: GeminiClient = {
      ...client,
      async uploadFile() {
        return {
          name: "files/vid_abort",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/vid_abort",
          mimeType: "video/mp4",
          state: "PROCESSING",
        };
      },
      async getFile(name) {
        abortController.abort();
        return {
          name,
          uri: "https://generativelanguage.googleapis.com/v1beta/files/vid_abort",
          mimeType: "video/mp4",
          state: "PROCESSING",
        };
      },
    };
    const abortAdapter = createGeminiAdapter({
      apiKey: "local-test-key",
      client: abortingClient,
      filePollIntervalMs: 1,
    });
    await expect(
      abortAdapter.complete({
        ...request,
        signal: abortController.signal,
        video: { bytes: new Uint8Array([1, 2]), mimeType: "video/mp4" },
      }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(deleted).toContain("files/vid_abort");
  });
});
