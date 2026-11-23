import { LlmProviderError } from "@open-prompt-os/adapter-kit";

function extractEventData(frame: string): string {
  return frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
}

export async function* readSseData(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        buffer = (buffer + decoder.decode()).replace(/\r\n/g, "\n");
        break;
      }
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const data = extractEventData(part);
        if (data.length > 0) yield data;
      }
    }
    if (!signal.aborted && buffer.length > 0) {
      const trailing = extractEventData(buffer);
      if (trailing.length > 0) yield trailing;
    }
  } finally {
    reader.releaseLock();
  }
  if (signal.aborted) {
    throw new LlmProviderError("timeout", "The provider request timed out.");
  }
}
