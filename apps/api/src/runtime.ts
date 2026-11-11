import type { LlmProviderAdapter } from "@open-prompt-os/adapter-kit";
import {
  createAnthropicAdapter,
  createGeminiAdapter,
  createOllamaAdapter,
  createOpenAiCompatibleAdapter,
  createOrchestrator,
  createRegistry,
  createSynthesizerAdapter,
} from "@open-prompt-os/adapters";
import type { AppConfig } from "./config.js";

export function createRuntime(config: AppConfig) {
  const adapters: LlmProviderAdapter[] = [createSynthesizerAdapter()];
  const geminiKeys = [config.geminiApiKey, config.geminiApiKey2].filter((key): key is string =>
    Boolean(key),
  );
  const primaryGeminiKey = geminiKeys[0];
  if (primaryGeminiKey) {
    adapters.push(createGeminiAdapter({ apiKey: primaryGeminiKey, apiKeys: geminiKeys.slice(1) }));
  }
  if (config.openaiApiKey) {
    adapters.push(
      createOpenAiCompatibleAdapter({
        id: "openai",
        apiKey: config.openaiApiKey,
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4.1",
      }),
    );
  }
  if (config.groqApiKey) {
    adapters.push(
      createOpenAiCompatibleAdapter({
        id: "groq",
        apiKey: config.groqApiKey,
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: "llama-3.3-70b-versatile",
      }),
    );
  }
  if (config.openrouterApiKey) {
    adapters.push(
      createOpenAiCompatibleAdapter({
        id: "openrouter",
        apiKey: config.openrouterApiKey,
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: "openai/gpt-4.1",
      }),
    );
  }
  if (config.anthropicApiKey) {
    adapters.push(createAnthropicAdapter({ apiKey: config.anthropicApiKey }));
  }
  if (config.ollamaBaseUrl) {
    adapters.push(createOllamaAdapter({ baseUrl: config.ollamaBaseUrl }));
  }
  const orchestrator = createOrchestrator({
    registry: createRegistry(adapters),
    timeoutMs: config.llmTimeoutMs,
  });
  return { orchestrator };
}
