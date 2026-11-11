import type { LlmProviderAdapter } from "@open-prompt-os/adapter-kit";
import { FAILOVER_ORDER, lookupModel } from "./catalog.js";

export interface ProviderRegistry {
  resolve(modelId: string | null): LlmProviderAdapter;
  failoverChain(modelId: string | null): readonly LlmProviderAdapter[];
  list(): readonly LlmProviderAdapter[];
}

export function createRegistry(adapters: readonly LlmProviderAdapter[]): ProviderRegistry {
  const registered = [...adapters];
  const found = registered.find((adapter) => adapter.id === "rule-synthesizer");
  if (!found) {
    throw new Error("Rule synthesizer adapter is required");
  }
  const synthesizer: LlmProviderAdapter = found;

  function failoverChain(modelId: string | null): readonly LlmProviderAdapter[] {
    const preferred = lookupModel(modelId).providerId;
    const order = [preferred, ...FAILOVER_ORDER.filter((id) => id !== preferred)];
    const chain: LlmProviderAdapter[] = [];
    for (const id of order) {
      const adapter = registered.find((item) => item.id === id && item.isConfigured());
      if (adapter && !chain.some((item) => item.id === adapter.id)) chain.push(adapter);
    }
    if (!chain.some((item) => item.id === "rule-synthesizer")) chain.push(synthesizer);
    return chain;
  }

  return {
    resolve(modelId) {
      return failoverChain(modelId)[0] ?? synthesizer;
    },
    failoverChain,
    list() {
      return registered;
    },
  };
}
