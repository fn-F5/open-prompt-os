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
  NODE_ENV: optionalSecret,
  PORT: optionalPositiveInt(3001),
  WEB_ORIGINS: z.string().optional(),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_API_KEY_2: optionalSecret,
  GOOGLE_GENERATIVE_AI_API_KEY_2: optionalSecret,
  GEMINI_MODEL: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: optionalSecret,
  GROQ_API_KEY: optionalSecret,
  GROQ_MODEL: optionalSecret,
  OPENROUTER_API_KEY: optionalSecret,
  OPENROUTER_MODEL: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: optionalSecret,
  OLLAMA_BASE_URL: optionalSecret,
  OLLAMA_MODEL: optionalSecret,
  LLM_TIMEOUT_MS: optionalPositiveInt(30_000),
  RATE_LIMIT_PER_MINUTE: optionalPositiveInt(30),
  TRUST_PROXY: z.string().optional(),
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  STRIPE_PRICE_PRO_MONTHLY: optionalSecret,
  STRIPE_PRICE_PRO_YEARLY: optionalSecret,
  STRIPE_PRICE_TEAM_MONTHLY: optionalSecret,
  STRIPE_PRICE_TEAM_YEARLY: optionalSecret,
  POSTHOG_KEY: optionalSecret,
  POSTHOG_HOST: optionalSecret,
});

export interface AppConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly webOrigins: readonly string[];
  readonly geminiApiKey?: string;
  readonly geminiApiKey2?: string;
  readonly geminiModel?: string;
  readonly openaiApiKey?: string;
  readonly openaiModel?: string;
  readonly groqApiKey?: string;
  readonly groqModel?: string;
  readonly openrouterApiKey?: string;
  readonly openrouterModel?: string;
  readonly anthropicApiKey?: string;
  readonly anthropicModel?: string;
  readonly ollamaBaseUrl?: string;
  readonly ollamaModel?: string;
  readonly llmTimeoutMs: number;
  readonly rateLimitPerMinute: number;
  readonly trustProxy: boolean;
  readonly stripeSecretKey?: string;
  readonly stripeWebhookSecret?: string;
  readonly stripePriceProMonthly?: string;
  readonly stripePriceProYearly?: string;
  readonly stripePriceTeamMonthly?: string;
  readonly stripePriceTeamYearly?: string;
  readonly posthogKey?: string;
  readonly posthogHost: string;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.parse(env);
  const origins = (parsed.WEB_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return {
    nodeEnv: parsed.NODE_ENV ?? process.env.NODE_ENV?.trim() ?? "",
    port: parsed.PORT,
    webOrigins: origins,
    geminiApiKey: parsed.GEMINI_API_KEY,
    geminiApiKey2: parsed.GEMINI_API_KEY_2 ?? parsed.GOOGLE_GENERATIVE_AI_API_KEY_2,
    geminiModel: parsed.GEMINI_MODEL,
    openaiApiKey: parsed.OPENAI_API_KEY,
    openaiModel: parsed.OPENAI_MODEL,
    groqApiKey: parsed.GROQ_API_KEY,
    groqModel: parsed.GROQ_MODEL,
    openrouterApiKey: parsed.OPENROUTER_API_KEY,
    openrouterModel: parsed.OPENROUTER_MODEL,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    anthropicModel: parsed.ANTHROPIC_MODEL,
    ollamaBaseUrl: parsed.OLLAMA_BASE_URL,
    ollamaModel: parsed.OLLAMA_MODEL,
    llmTimeoutMs: parsed.LLM_TIMEOUT_MS,
    rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
    trustProxy: parsed.TRUST_PROXY === "true",
    stripeSecretKey: parsed.STRIPE_SECRET_KEY,
    stripeWebhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    stripePriceProMonthly: parsed.STRIPE_PRICE_PRO_MONTHLY,
    stripePriceProYearly: parsed.STRIPE_PRICE_PRO_YEARLY,
    stripePriceTeamMonthly: parsed.STRIPE_PRICE_TEAM_MONTHLY,
    stripePriceTeamYearly: parsed.STRIPE_PRICE_TEAM_YEARLY,
    posthogKey: parsed.POSTHOG_KEY,
    posthogHost: parsed.POSTHOG_HOST ?? "https://us.i.posthog.com",
  };
}
