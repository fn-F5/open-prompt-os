const PRODUCTION_ORIGIN = "https://openpromptos.com";

export interface AuthBootConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly databaseUrl: string;
  readonly secret: string;
  readonly baseURL: string;
  readonly trustedOrigins: readonly string[];
  readonly rpID: string;
  readonly passkeyOrigin: string;
  readonly resendApiKey?: string;
  readonly mailProvider?: string;
  readonly mailFrom: string;
  readonly mailReplyTo: string;
  readonly googleClientId?: string;
  readonly googleClientSecret?: string;
  readonly githubClientId?: string;
  readonly githubClientSecret?: string;
  readonly trustProxy: boolean;
  readonly secureCookies: boolean;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim() ?? "";
  if (!value) throw new Error(`Refusing to start. ${name} is required.`);
  return value;
}

export function loadAuthBoot(env: Record<string, string | undefined>): AuthBootConfig | null {
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("Refusing to start. Set NODE_ENV to development, test, or production.");
  }
  if (nodeEnv === "production") {
    const secret = required(env, "BETTER_AUTH_SECRET");
    if (secret.length < 32 || secret.toLowerCase().includes("development")) {
      throw new Error("Refusing to start. BETTER_AUTH_SECRET is not a production secret.");
    }
    if (env.BETTER_AUTH_URL !== PRODUCTION_ORIGIN) {
      throw new Error("Refusing to start. BETTER_AUTH_URL must be https://openpromptos.com.");
    }
    if (env.WEB_ORIGINS !== PRODUCTION_ORIGIN) {
      throw new Error("Refusing to start. WEB_ORIGINS must be https://openpromptos.com.");
    }
    const databaseUrl = required(env, "DATABASE_URL");
    if (!databaseUrl.startsWith("postgres")) {
      throw new Error("Refusing to start. DATABASE_URL must be PostgreSQL.");
    }
    required(env, "RESEND_API_KEY");
    if (env.PASSKEY_RP_ID !== "openpromptos.com") {
      throw new Error("Refusing to start. PASSKEY_RP_ID must be openpromptos.com.");
    }
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("Refusing to start. BETTER_AUTH_SECRET must be at least 32 characters.");
  }
  const baseURL = (env.BETTER_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const trustedOrigins = (env.WEB_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const rpID =
    env.PASSKEY_RP_ID?.trim() || (nodeEnv === "production" ? "openpromptos.com" : "localhost");
  const passkeyOrigin = env.PASSKEY_ORIGIN?.trim() || trustedOrigins[0] || baseURL;
  return {
    nodeEnv,
    databaseUrl,
    secret,
    baseURL,
    trustedOrigins,
    rpID,
    passkeyOrigin,
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
    mailProvider: env.MAIL_PROVIDER?.trim().toLowerCase() || undefined,
    mailFrom: env.MAIL_FROM?.trim() || "OpenPrompt OS <login@mail.openpromptos.com>",
    mailReplyTo: env.MAIL_REPLY_TO?.trim() || "hello@openpromptos.com",
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || undefined,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET?.trim() || undefined,
    githubClientId: env.GITHUB_CLIENT_ID?.trim() || undefined,
    githubClientSecret: env.GITHUB_CLIENT_SECRET?.trim() || undefined,
    trustProxy: env.TRUST_PROXY === "true",
    secureCookies: baseURL.startsWith("https://"),
  };
}
