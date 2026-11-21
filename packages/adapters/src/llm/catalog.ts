import type { ProviderId } from "@open-prompt-os/contracts";

export interface CatalogEntry {
  readonly modelId: string;
  readonly providerId: ProviderId;
  readonly displayName: string;
  /** Upstream model ID sent to the provider adapter when this catalog entry is selected. */
  readonly apiModelId?: string;
}

export const MODEL_CATALOG: readonly CatalogEntry[] = [
  // Frontend platform-family targets (Text)
  {
    modelId: "openai-text",
    providerId: "openai",
    displayName: "OpenAI (ChatGPT, GPT models)",
    apiModelId: "gpt-4.1",
  },
  {
    modelId: "google-text",
    providerId: "gemini",
    displayName: "Google (Gemini models)",
  },
  {
    modelId: "anthropic-text",
    providerId: "anthropic",
    displayName: "Anthropic (Claude models)",
    apiModelId: "claude-3-7-sonnet",
  },
  { modelId: "alibaba-text", providerId: "openrouter", displayName: "Alibaba (Qwen models)" },
  { modelId: "minimax-text", providerId: "openrouter", displayName: "MiniMax (M3 model)" },
  { modelId: "xai-text", providerId: "openrouter", displayName: "xAI (Grok models)" },
  { modelId: "deepseek-text", providerId: "openrouter", displayName: "DeepSeek (DeepSeek models)" },

  // Frontend platform-family targets (Image)
  {
    modelId: "openai-image",
    providerId: "openai",
    displayName: "OpenAI (GPT-image, DALL-E)",
    apiModelId: "gpt-4.1",
  },
  {
    modelId: "google-image",
    providerId: "gemini",
    displayName: "Google (Imagen, Gemini)",
  },
  {
    modelId: "midjourney-image",
    providerId: "openrouter",
    displayName: "Midjourney (Midjourney models)",
  },
  { modelId: "adobe-image", providerId: "openrouter", displayName: "Adobe (Firefly)" },
  {
    modelId: "bfl-image",
    providerId: "openrouter",
    displayName: "Black Forest Labs (FLUX models)",
  },

  // Frontend platform-family targets (Video)
  {
    modelId: "google-video",
    providerId: "gemini",
    displayName: "Google (Veo, Gemini Omni Flash)",
  },
  { modelId: "alibaba-video", providerId: "openrouter", displayName: "Alibaba (Wan)" },
  { modelId: "minimax-video", providerId: "openrouter", displayName: "MiniMax (H3)" },
  { modelId: "bytedance-video", providerId: "openrouter", displayName: "ByteDance (Seedance)" },
  { modelId: "runway-video", providerId: "openrouter", displayName: "Runway (Gen models)" },

  // Concrete model IDs
  {
    modelId: "gemini-2.5-pro",
    providerId: "gemini",
    displayName: "Gemini 2.5 Pro",
    apiModelId: "gemini-2.5-pro",
  },
  {
    modelId: "imagen-3-pro",
    providerId: "gemini",
    displayName: "Imagen 3 Studio",
  },
  {
    modelId: "veo-2-cinema",
    providerId: "gemini",
    displayName: "Veo 2 Cinema",
  },
  { modelId: "gpt-4.1", providerId: "openai", displayName: "GPT-4.1", apiModelId: "gpt-4.1" },
  { modelId: "sora-turbo", providerId: "openai", displayName: "Sora Turbo", apiModelId: "gpt-4.1" },
  {
    modelId: "claude-3-7-sonnet",
    providerId: "anthropic",
    displayName: "Claude 3.7 Sonnet",
    apiModelId: "claude-3-7-sonnet",
  },
  { modelId: "flux-1.1-pro", providerId: "openrouter", displayName: "FLUX 1.1 Pro Ultra" },
];

export const FAILOVER_ORDER: readonly ProviderId[] = [
  "gemini",
  "openai",
  "anthropic",
  "groq",
  "openrouter",
  "ollama",
  "rule-synthesizer",
];

export function lookupModel(modelId: string | null | undefined): CatalogEntry {
  const found = MODEL_CATALOG.find((entry) => entry.modelId === modelId);
  if (found) return found;
  return {
    modelId: modelId && modelId.length > 0 ? modelId : "rule-synthesizer",
    providerId: "rule-synthesizer",
    displayName: "Rule Synthesizer",
  };
}
