import type { BillingProvider, LlmProviderAdapter } from "@open-prompt-os/adapter-kit";
import {
  createAnthropicAdapter,
  createGeminiAdapter,
  createLocalBillingEmulator,
  createOllamaAdapter,
  createOpenAiCompatibleAdapter,
  createOrchestrator,
  createRegistry,
  createStripeBillingProvider,
  createSynthesizerAdapter,
} from "@open-prompt-os/adapters";
import { setDbLogger } from "@open-prompt-os/db";
import type { AppConfig } from "./config.js";
import { logger } from "./logger.js";

export function createRuntime(config: AppConfig) {
  setDbLogger((event, data) => {
    logger.debug(
      event === "db.insert"
        ? `DB insert: ${String(data.model ?? "unknown")}.${String(data.operation ?? "")}`
        : `DB query: ${String(data.model ?? "unknown")}.${String(data.operation ?? "")} ${String(data.durationMs ?? 0)}ms`,
      { event, ...data },
    );
  });
  const adapters: LlmProviderAdapter[] = [createSynthesizerAdapter()];
  const geminiKeys = [config.geminiApiKey, config.geminiApiKey2].filter((key): key is string =>
    Boolean(key),
  );
  const primaryGeminiKey = geminiKeys[0];
  if (primaryGeminiKey) {
    adapters.push(
      createGeminiAdapter({
        apiKey: primaryGeminiKey,
        apiKeys: geminiKeys.slice(1),
        defaultModel: config.geminiModel,
      }),
    );
  }
  if (config.openaiApiKey) {
    adapters.push(
      createOpenAiCompatibleAdapter({
        id: "openai",
        apiKey: config.openaiApiKey,
        baseUrl: "https://api.openai.com/v1",
        defaultModel: config.openaiModel ?? "gpt-4.1",
      }),
    );
  }
  if (config.groqApiKey) {
    adapters.push(
      createOpenAiCompatibleAdapter({
        id: "groq",
        apiKey: config.groqApiKey,
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: config.groqModel ?? "llama-3.3-70b-versatile",
      }),
    );
  }
  if (config.openrouterApiKey) {
    adapters.push(
      createOpenAiCompatibleAdapter({
        id: "openrouter",
        apiKey: config.openrouterApiKey,
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: config.openrouterModel ?? "openai/gpt-4.1",
      }),
    );
  }
  if (config.anthropicApiKey) {
    adapters.push(
      createAnthropicAdapter({
        apiKey: config.anthropicApiKey,
        defaultModel: config.anthropicModel,
      }),
    );
  }
  if (config.ollamaBaseUrl) {
    adapters.push(
      createOllamaAdapter({
        baseUrl: config.ollamaBaseUrl,
        defaultModel: config.ollamaModel,
      }),
    );
  }
  const orchestrator = createOrchestrator({
    registry: createRegistry(adapters),
    timeoutMs: config.llmTimeoutMs,
    disableFailover: adapters.length > 1,
    onLlmRequest(event) {
      logger.debug(`LLM request: ${event.providerId}/${event.modelId}`, {
        event: "llm.request",
        providerId: event.providerId,
        modelId: event.modelId,
        streaming: event.streaming,
        maxOutputTokens: event.maxOutputTokens,
        timeoutMs: event.timeoutMs,
        systemPrompt: event.systemPrompt,
        userPrompt: event.userPrompt,
      });
    },
    onLlmResponse(event) {
      logger.debug(`LLM response: ${event.providerId}/${event.modelId} ${event.latencyMs}ms`, {
        event: "llm.response",
        providerId: event.providerId,
        modelId: event.modelId,
        streaming: event.streaming,
        latencyMs: event.latencyMs,
        usage: event.usage,
        healed: event.healed,
        responseText: event.text,
      });
    },
    onProviderFailure(event) {
      logger.error("LLM provider failed", {
        event: "llm.provider_failed",
        providerId: event.providerId,
        modelId: event.modelId,
        errorCode: event.code,
        errorMessage: event.message,
      });
    },
  });

  const billingProvider: BillingProvider =
    config.stripeSecretKey &&
    config.stripePriceProMonthly &&
    config.stripePriceProYearly &&
    config.stripePriceTeamMonthly &&
    config.stripePriceTeamYearly
      ? createStripeBillingProvider({
          secretKey: config.stripeSecretKey,
          webhookSecret: config.stripeWebhookSecret,
          prices: {
            proMonthly: config.stripePriceProMonthly,
            proYearly: config.stripePriceProYearly,
            teamMonthly: config.stripePriceTeamMonthly,
            teamYearly: config.stripePriceTeamYearly,
          },
        })
      : createLocalBillingEmulator();

  return { orchestrator, billingProvider };
}
