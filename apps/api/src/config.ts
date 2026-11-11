import { z } from "zod";

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  });

const optionalPositiveInt = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim().length === 0) return fallback;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Expected a positive integer, received ${value}`);
      }
      return parsed;
    });

const EnvSchema = z.object({
  PORT: optionalPositiveInt(3001),
  WEB_ORIGINS: z.string().optional(),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_API_KEY_2: optionalSecret,
  GOOGLE_GENERATIVE_AI_API_KEY_2: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  GROQ_API_KEY: optionalSecret,
  OPENROUTER_API_KEY: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  OLLAMA_BASE_URL: optionalSecret,
  LLM_TIMEOUT_MS: optionalPositiveInt(20_000),
  RATE_LIMIT_PER_MINUTE: optionalPositiveInt(30),
  TRUST_PROXY: z.string().optional(),
});

export interface AppConfig {
  readonly port: number;
  readonly webOrigins: readonly string[];
  readonly geminiApiKey?: string;
  readonly geminiApiKey2?: string;
  readonly openaiApiKey?: string;
  readonly groqApiKey?: string;
  readonly openrouterApiKey?: string;
  readonly anthropicApiKey?: string;
  readonly ollamaBaseUrl?: string;
  readonly llmTimeoutMs: number;
  readonly rateLimitPerMinute: number;
  readonly trustProxy: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.parse(env);
  const origins = (parsed.WEB_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return {
    port: parsed.PORT,
    webOrigins: origins,
    geminiApiKey: parsed.GEMINI_API_KEY,
    geminiApiKey2: parsed.GEMINI_API_KEY_2 ?? parsed.GOOGLE_GENERATIVE_AI_API_KEY_2,
    openaiApiKey: parsed.OPENAI_API_KEY,
    groqApiKey: parsed.GROQ_API_KEY,
    openrouterApiKey: parsed.OPENROUTER_API_KEY,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    ollamaBaseUrl: parsed.OLLAMA_BASE_URL,
    llmTimeoutMs: parsed.LLM_TIMEOUT_MS,
    rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
    trustProxy: parsed.TRUST_PROXY === "true",
  };
}
