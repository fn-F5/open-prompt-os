const PRODUCTION_ORIGIN = "https://openpromptos.com";

export interface AuthBootConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly databaseUrl: string;
  /** Legacy single secret. With `secrets`, only used to decrypt pre-rotation payloads. */
  readonly secret?: string;
  /** Versioned secrets, current first. Older entries are decrypt/verify-only. */
  readonly secrets?: readonly AuthSecret[];
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
  readonly turnstileSecretKey?: string;
  readonly trustProxy: boolean;
  readonly secureCookies: boolean;
}

export interface AuthSecret {
  readonly version: number;
  readonly value: string;
}

const MIN_SECRET_LENGTH = 32;

function fail(message: string): never {
  throw new Error(`Refusing to start. ${message}`);
}

/** Parses `BETTER_AUTH_SECRETS` (`<version>:<secret>,...`, current first). */
export function parseAuthSecrets(raw: string | undefined): AuthSecret[] | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const seen = new Set<number>();
  return trimmed.split(",").map((entry, index) => {
    const position = index + 1;
    const colon = entry.indexOf(":");
    if (colon === -1) {
      fail(`BETTER_AUTH_SECRETS entry ${position} must use the format <version>:<secret>.`);
    }
    const versionText = entry.slice(0, colon).trim();
    const value = entry.slice(colon + 1).trim();
    if (!/^\d+$/.test(versionText)) {
      fail(`BETTER_AUTH_SECRETS entry ${position} must have a non-negative integer version.`);
    }
    const version = Number(versionText);
    if (seen.has(version)) fail(`BETTER_AUTH_SECRETS has duplicate version ${version}.`);
    seen.add(version);
    if (!value) fail(`BETTER_AUTH_SECRETS version ${version} has an empty secret.`);
    return { version, value };
  });
}

function assertProductionSecret(name: string, value: string): void {
  if (value.length < MIN_SECRET_LENGTH || value.toLowerCase().includes("development")) {
    fail(`${name} is not a production secret.`);
  }
}

function assertSecretLength(name: string, value: string): void {
  if (value.length < MIN_SECRET_LENGTH) {
    fail(`${name} must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
}

function secretsLabel(secret: AuthSecret): string {
  return `BETTER_AUTH_SECRETS version ${secret.version}`;
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
  const secrets = parseAuthSecrets(env.BETTER_AUTH_SECRETS);
  const legacySecret = env.BETTER_AUTH_SECRET?.trim() || undefined;

  if (nodeEnv === "production") {
    if (secrets) {
      for (const entry of secrets) assertProductionSecret(secretsLabel(entry), entry.value);
      if (legacySecret) assertProductionSecret("BETTER_AUTH_SECRET", legacySecret);
    } else {
      assertProductionSecret("BETTER_AUTH_SECRET", required(env, "BETTER_AUTH_SECRET"));
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
  if (secrets) {
    for (const entry of secrets) assertSecretLength(secretsLabel(entry), entry.value);
    if (legacySecret) assertSecretLength("BETTER_AUTH_SECRET", legacySecret);
  } else {
    assertSecretLength("BETTER_AUTH_SECRET", legacySecret ?? "");
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
    secret: legacySecret,
    secrets,
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
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY?.trim() || undefined,
    trustProxy: env.TRUST_PROXY === "true",
    secureCookies: baseURL.startsWith("https://"),
  };
}
