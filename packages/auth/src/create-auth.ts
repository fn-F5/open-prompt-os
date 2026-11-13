import { passkey } from "@better-auth/passkey";
import { type PrismaClient, runAsSystem } from "@open-prompt-os/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { customSession, emailOTP } from "better-auth/plugins";
import type { AuthBootConfig } from "./boot.js";
import { type SignInMailer, createCaptureMailer, createResendMailer } from "./mailer.js";

export interface CreateAuthOptions {
  readonly db: PrismaClient;
  readonly boot: AuthBootConfig;
  readonly mailer?: SignInMailer;
  readonly otpMax?: number;
}

function createLocalMailer(printCode: boolean): SignInMailer {
  const capture = createCaptureMailer();
  return {
    async send(mail) {
      await capture.send(mail);
      if (printCode) console.log(`sign-in code for ${mail.email} is ${mail.otp}`);
    },
  };
}

function planOf(value: string): "free" | "pro" | "team" {
  if (value === "pro" || value === "team") return value;
  return "free";
}

async function ensurePersonalSpace(userId: string, userName?: string | null) {
  return runAsSystem(async (tx) => {
    const existing = await tx.spaceMember.findFirst({
      where: { userId },
      include: { space: true },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing.space;

    const label = userName?.trim();
    const space = await tx.space.create({
      data: {
        name: label ? `${label}'s Workspace` : "Personal Workspace",
        plan: "free",
      },
    });
    await tx.spaceMember.create({
      data: {
        spaceId: space.id,
        userId,
        role: "owner",
      },
    });
    return space;
  });
}

export interface AuthServer {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (input: { headers: Headers }) => Promise<{
      user?: {
        id: string;
        email?: string;
        name?: string | null;
        spaceId?: string;
        spaceName?: string;
        plan?: string;
        hasPasskey?: boolean;
      } | null;
    } | null>;
  };
}

export function createAuth(options: CreateAuthOptions): AuthServer {
  if (options.boot.nodeEnv === "production" && !options.boot.resendApiKey) {
    throw new Error("Refusing to start. RESEND_API_KEY is required in production.");
  }
  const useResend =
    options.boot.nodeEnv === "production" ||
    (options.boot.mailProvider === "resend" && Boolean(options.boot.resendApiKey));
  const mailer =
    options.mailer ??
    (useResend
      ? createResendMailer({
          apiKey: options.boot.resendApiKey ?? "",
          from: options.boot.mailFrom,
          replyTo: options.boot.mailReplyTo,
        })
      : createLocalMailer(options.boot.nodeEnv === "development"));
  const otpMax = options.otpMax ?? 5;

  const socialProviders = {
    ...(options.boot.googleClientId && options.boot.googleClientSecret
      ? {
          google: {
            clientId: options.boot.googleClientId,
            clientSecret: options.boot.googleClientSecret,
          },
        }
      : {}),
    ...(options.boot.githubClientId && options.boot.githubClientSecret
      ? {
          github: {
            clientId: options.boot.githubClientId,
            clientSecret: options.boot.githubClientSecret,
          },
        }
      : {}),
  };

  return betterAuth({
    appName: "OpenPrompt OS",
    secret: options.boot.secret,
    baseURL: options.boot.baseURL,
    trustedOrigins: [...options.boot.trustedOrigins],
    database: prismaAdapter(options.db, { provider: "postgresql" }),
    emailAndPassword: { enabled: false },
    socialProviders,
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "github"],
      },
    },
    session: {
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "memory",
      window: 60,
      max: 30,
      customRules: {
        "/email-otp/send-verification-otp": { window: 600, max: otpMax },
        "/sign-in/email-otp": { window: 600, max: otpMax + 3 },
      },
    },
    advanced: {
      useSecureCookies: options.boot.secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: options.boot.secureCookies,
        sameSite: "lax",
        path: "/",
      },
      ipAddress: {
        ipAddressHeaders: options.boot.trustProxy
          ? ["cf-connecting-ip", "x-forwarded-for"]
          : ["x-real-ip"],
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensurePersonalSpace(user.id, user.name);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const space = await ensurePersonalSpace(session.userId);
            return {
              data: {
                ...session,
                activeSpaceId: space.id,
              },
            };
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        storeOTP: "hashed",
        rateLimit: { window: 600, max: otpMax },
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") return;
          await mailer.send({ email, otp });
        },
      }),
      passkey({
        rpID: options.boot.rpID,
        rpName: "OpenPrompt OS",
        origin: options.boot.passkeyOrigin,
      }),
      customSession(async ({ user, session }) => {
        const result = await runAsSystem(async (tx) => {
          const row = await tx.user.findUnique({
            where: { id: user.id },
            include: {
              memberships: {
                include: { space: true },
                orderBy: { createdAt: "asc" },
                take: 1,
              },
              passkeys: { select: { id: true }, take: 1 },
            },
          });
          return row;
        });
        if (!result) throw new Error("Account not found.");
        const space =
          result.memberships[0]?.space ?? (await ensurePersonalSpace(result.id, result.name));
        return {
          user: {
            id: result.id,
            email: result.email,
            name: result.name,
            spaceId: space.id,
            spaceName: space.name,
            plan: planOf(space.plan),
            hasPasskey: result.passkeys.length > 0,
          },
          session,
        };
      }),
    ],
  }) as unknown as AuthServer;
}
