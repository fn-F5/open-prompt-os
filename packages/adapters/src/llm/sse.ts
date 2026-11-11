import { LlmProviderError } from "@open-prompt-os/adapter-kit";

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
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const data = part
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data.length > 0) yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (signal.aborted) {
    throw new LlmProviderError("timeout", "The provider request timed out.");
  }
}
