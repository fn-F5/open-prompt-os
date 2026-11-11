import type { LlmProviderAdapter } from "@open-prompt-os/adapter-kit";
import { createOpenAiCompatibleAdapter } from "./openai-compatible.js";

export interface OllamaAdapterOptions {
  readonly baseUrl: string;
  readonly defaultModel?: string;
  readonly fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export function createOllamaAdapter(options: OllamaAdapterOptions): LlmProviderAdapter {
  return createOpenAiCompatibleAdapter({
    id: "ollama",
    apiKey: "",
    baseUrl: options.baseUrl,
    defaultModel: options.defaultModel ?? "llama3.2",
    fetchImpl: options.fetchImpl,
  });
}
