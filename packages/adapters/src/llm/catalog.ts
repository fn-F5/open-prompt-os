import type { ProviderId } from "@open-prompt-os/contracts";

export interface CatalogEntry {
  readonly modelId: string;
  readonly providerId: ProviderId;
  readonly displayName: string;
}

export const MODEL_CATALOG: readonly CatalogEntry[] = [
  { modelId: "gemini-2.5-pro", providerId: "gemini", displayName: "Gemini 2.5 Pro" },
  { modelId: "imagen-3-pro", providerId: "gemini", displayName: "Imagen 3 Studio" },
  { modelId: "veo-2-cinema", providerId: "gemini", displayName: "Veo 2 Cinema" },
  { modelId: "gpt-4.1", providerId: "openai", displayName: "GPT-4.1" },
  { modelId: "sora-turbo", providerId: "openai", displayName: "Sora Turbo" },
  { modelId: "claude-3-7-sonnet", providerId: "anthropic", displayName: "Claude 3.7 Sonnet" },
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
