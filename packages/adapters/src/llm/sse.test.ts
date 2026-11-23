import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import { describe, expect, it } from "vitest";
import { readSseData } from "./sse.js";

function streamFromChunks(chunks: Array<string | Uint8Array>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const items: string[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

describe("readSseData", () => {
  it("reassembles events split across arbitrary chunk boundaries and multi-byte UTF-8 sequences", async () => {
    // 4-byte emoji "🚀" split across two Uint8Array chunks
    const emojiBytes = new TextEncoder().encode("🚀");
    const firstHalf = emojiBytes.slice(0, 2);
    const secondHalf = emojiBytes.slice(2);

    const res = streamFromChunks([
      "da",
      'ta: {"text":"hello ',
      firstHalf,
      secondHalf,
      '"}\n',
      "\ndata: second\n\n",
    ]);

    const events = await collect(readSseData(res, new AbortController().signal));
    expect(events).toEqual(['{"text":"hello 🚀"}', "second"]);
  });

  it("handles CRLF (\\r\\n\\r\\n) frame delimiters including split \\r / \\n across chunks", async () => {
    const res = streamFromChunks(["event: message\r\ndata: alpha\r", "\n\r\ndata: beta\r\n\r\n"]);

    const events = await collect(readSseData(res, new AbortController().signal));
    expect(events).toEqual(["alpha", "beta"]);
  });

  it("flushes a trailing SSE event when the upstream closes without a final blank line", async () => {
    const res = streamFromChunks(["data: first\n\ndata: final-without-delimiter"]);

    const events = await collect(readSseData(res, new AbortController().signal));
    expect(events).toEqual(["first", "final-without-delimiter"]);
  });

  it("joins multi-line data fields with newlines and ignores comments and non-data fields", async () => {
    const res = streamFromChunks([
      ": keepalive comment\n\n",
      "id: 42\nevent: delta\ndata: line1\ndata: line2\n\n",
      "event: empty\ndata:   \n\n",
    ]);

    const events = await collect(readSseData(res, new AbortController().signal));
    expect(events).toEqual(["line1\nline2"]);
  });

  it("returns cleanly when response.body is null", async () => {
    const res = new Response(null);
    const events = await collect(readSseData(res, new AbortController().signal));
    expect(events).toEqual([]);
  });

  it("throws LlmProviderError(timeout) and releases the stream lock when aborted", async () => {
    const controller = new AbortController();
    const res = streamFromChunks(["data: first\n\n", "data: second\n\n"]);

    const gen = readSseData(res, controller.signal);
    const first = await gen.next();
    expect(first).toEqual({ value: "first", done: false });

    controller.abort();
    await expect(gen.next()).rejects.toThrowError(LlmProviderError);
    // Lock must be released so body is not permanently locked
    expect(res.body?.locked).toBe(false);
  });
});
