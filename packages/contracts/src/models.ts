import { z } from "zod";
import { ComposerModeSchema } from "./prompts.js";

export const ProviderIdSchema = z.enum([
  "gemini",
  "openai",
  "anthropic",
  "groq",
  "openrouter",
  "ollama",
  "rule-synthesizer",
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const ModelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerId: ProviderIdSchema,
  providerName: z.string(),
  glyph: z.string(),
  modes: z.array(ComposerModeSchema),
  capabilities: z.array(z.string()),
  status: z.enum(["available", "degraded", "fallback"]),
  latencyLabel: z.string(),
});
export type ModelOption = z.infer<typeof ModelOptionSchema>;

export const ProviderHealthSchema = z.object({
  providerId: ProviderIdSchema,
  circuit: z.enum(["closed", "open", "half_open"]),
  recentFailureRate: z.number(),
  lastErrorAt: z.string().nullable(),
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;
