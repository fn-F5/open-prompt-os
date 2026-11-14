import type { PrismaClient } from "@open-prompt-os/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuthBootConfig, loadAuthBoot } from "./boot.js";
import { createAuth } from "./create-auth.js";
import { createCaptureMailer } from "./mailer.js";

const mockTx = {
  spaceMember: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  space: {
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock("@open-prompt-os/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@open-prompt-os/db")>();
  return {
    ...actual,
    runAsSystem: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  };
});

let ipCounter = 1;
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

function makeBoot(overrides: Partial<AuthBootConfig> = {}): AuthBootConfig {
  const base = loadAuthBoot({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://app@localhost:5432/open_prompt_os",
    BETTER_AUTH_SECRET: "c".repeat(40),
    BETTER_AUTH_URL: "http://localhost:3001",
    WEB_ORIGINS: "http://localhost:5173",
    PASSKEY_RP_ID: "localhost",
    PASSKEY_ORIGIN: "http://localhost:5173",
  });
  if (!base) throw new Error("Expected base auth boot config.");
  return { ...base, ...overrides };
}

function createInMemoryDb() {
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    passkey: [],
  };

  function matches(row: Row, where?: Row): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, val]) => {
      if (val && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
        const op = val as Record<string, unknown>;
        const current = row[key];
        if ("gt" in op && op.gt instanceof Date && current instanceof Date) {
          return current.getTime() > op.gt.getTime();
        }
        if ("lt" in op && op.lt instanceof Date && current instanceof Date) {
          return current.getTime() < op.lt.getTime();
        }
        if ("equals" in op) return current === op.equals;
      }
      return row[key] === val;
    });
  }

  function model(name: keyof typeof tables) {
    let rows = tables[name];
    if (!rows) {
      rows = [];
      tables[name] = rows;
    }
    return {
      async findUnique({ where }: { where: Row }) {
        return rows.find((r) => matches(r, where)) ?? null;
      },
      async findFirst({
        where,
        orderBy,
      }: {
        where?: Row;
        orderBy?: Record<string, "asc" | "desc">;
      }) {
        let filtered = rows.filter((r) => matches(r, where));
        if (orderBy) {
          const [field, dir] = Object.entries(orderBy)[0] ?? [];
          if (field) {
            filtered = [...filtered].sort((a, b) => {
              const av = a[field] instanceof Date ? (a[field] as Date).getTime() : String(a[field]);
              const bv = b[field] instanceof Date ? (b[field] as Date).getTime() : String(b[field]);
              if (av === bv) return 0;
              return (av < bv ? -1 : 1) * (dir === "desc" ? -1 : 1);
            });
          }
        }
        return filtered[0] ?? null;
      },
      async findMany({ where }: { where?: Row } = {}) {
        return rows.filter((r) => matches(r, where));
      },
      async create({ data }: { data: Row }) {
        const row = { id: data.id ?? `${name}_${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
      async update({ where, data }: { where: Row; data: Row }) {
        const idx = rows.findIndex((r) => matches(r, where));
        if (idx === -1) throw new Error(`Missing ${name}`);
        rows[idx] = { ...rows[idx], ...data };
        return rows[idx];
      },
      async delete({ where }: { where: Row }) {
        const idx = rows.findIndex((r) => matches(r, where));
        if (idx === -1) throw new Error(`Missing ${name}`);
        const [removed] = rows.splice(idx, 1);
        return removed;
      },
      async deleteMany({ where }: { where?: Row } = {}) {
        const before = rows.length;
        const kept = rows.filter((r) => !matches(r, where));
        rows.splice(0, rows.length, ...kept);
        return { count: before - kept.length };
      },
      async count({ where }: { where?: Row } = {}) {
        return rows.filter((r) => matches(r, where)).length;
      },
    };
  }

  return {
    user: model("user"),
    session: model("session"),
    account: model("account"),
    verification: model("verification"),
    passkey: model("passkey"),
  } as unknown as PrismaClient;
}

describe("createAuth configuration and lifecycle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("refuses to start in production without RESEND_API_KEY", () => {
    expect(() =>
      createAuth({
        db: createInMemoryDb(),
        boot: makeBoot({ nodeEnv: "production", resendApiKey: undefined }),
      }),
    ).toThrow("Refusing to start. RESEND_API_KEY is required in production.");
  });

  it("uses Resend in production and when mailProvider is resend with apiKey", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const prodAuth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({
        nodeEnv: "production",
        resendApiKey: "re_prod_key",
        mailFrom: "Prod <prod@example.com>",
        mailReplyTo: "reply@example.com",
      }),
    });

    const prodRes = await prodAuth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ email: "prod@example.com", type: "sign-in" }),
      }),
    );
    expect(prodRes.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
    const prodInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(prodInit.headers).toMatchObject({ authorization: "Bearer re_prod_key" });
    expect(JSON.parse(String(prodInit.body))).toMatchObject({
      from: "Prod <prod@example.com>",
      reply_to: "reply@example.com",
    });

    const devResendAuth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({
        nodeEnv: "development",
        mailProvider: "resend",
        resendApiKey: "re_dev_key",
      }),
    });
    const devRes = await devResendAuth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ email: "dev@example.com", type: "sign-in" }),
      }),
    );
    expect(devRes.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Development with resendApiKey set, but mailProvider !== "resend" must NOT send via Resend
    const devConsoleAuth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({
        nodeEnv: "development",
        mailProvider: "console",
        resendApiKey: "re_dev_key",
      }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleRes = await devConsoleAuth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ email: "console@example.com", type: "sign-in" }),
      }),
    );
    expect(consoleRes.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^sign-in code for console@example\.com is \d{6}$/),
    );
  });

  it("logs OTP in development local mailer and stays quiet in test local mailer", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const devAuth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({ nodeEnv: "development", mailProvider: "resend", resendApiKey: undefined }),
    });

    const devRes = await devAuth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ email: "dev@example.com", type: "sign-in" }),
      }),
    );
    expect(devRes.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^sign-in code for dev@example\.com is \d{6}$/),
    );

    logSpy.mockClear();

    const testAuth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({ nodeEnv: "test" }),
    });
    const testRes = await testAuth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ email: "quiet@example.com", type: "sign-in" }),
      }),
    );
    expect(testRes.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalled();

    // Non-sign-in OTP types do not send sign-in emails
    const nonSignInRes = await testAuth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ email: "quiet@example.com", type: "email-verification" }),
      }),
    );
    expect(nonSignInRes.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("passes Turnstile check when siteverify returns success and allows sign-in when unconfigured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const mailer = createCaptureMailer();

    const guardedAuth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({ turnstileSecretKey: "cf-secret" }),
      mailer,
    });

    const ok = await guardedAuth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
          "x-captcha-response": "valid-cf-token",
        },
        body: JSON.stringify({ email: "ada@example.com", type: "sign-in" }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(mailer.take("ada@example.com")).toMatch(/^\d{6}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("configures Google and GitHub social providers only when both ID and secret exist", async () => {
    const missingAuth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot(),
    });
    const missingGoogle = await missingAuth.handler(
      new Request("http://localhost:3001/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ provider: "google" }),
      }),
    );
    expect(missingGoogle.status).toBe(404);
    expect(await missingGoogle.text()).toContain("Provider not found");

    const partialAuthA = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({ googleClientId: "only-id", githubClientSecret: "only-secret" }),
    });

    const partialGoogleA = await partialAuthA.handler(
      new Request("http://localhost:3001/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ provider: "google" }),
      }),
    );
    expect(partialGoogleA.status).toBe(404);

    const partialGithubA = await partialAuthA.handler(
      new Request("http://localhost:3001/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ provider: "github" }),
      }),
    );
    expect(partialGithubA.status).toBe(404);

    const partialAuthB = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({ googleClientSecret: "only-secret", githubClientId: "only-id" }),
    });

    const partialGoogleB = await partialAuthB.handler(
      new Request("http://localhost:3001/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ provider: "google" }),
      }),
    );
    expect(partialGoogleB.status).toBe(404);

    const partialGithubB = await partialAuthB.handler(
      new Request("http://localhost:3001/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ provider: "github" }),
      }),
    );
    expect(partialGithubB.status).toBe(404);

    const enabledAuth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({
        googleClientId: "g-id",
        googleClientSecret: "g-sec",
        githubClientId: "gh-id",
        githubClientSecret: "gh-sec",
      }),
    });

    const googleRes = await enabledAuth.handler(
      new Request("http://localhost:3001/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ provider: "google" }),
      }),
    );
    expect(googleRes.status).toBe(200);
    expect((await googleRes.json()) as { url: string }).toMatchObject({
      url: expect.stringContaining("accounts.google.com"),
    });

    const githubRes = await enabledAuth.handler(
      new Request("http://localhost:3001/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ provider: "github" }),
      }),
    );
    expect(githubRes.status).toBe(200);
    expect((await githubRes.json()) as { url: string }).toMatchObject({
      url: expect.stringContaining("github.com/login/oauth/authorize"),
    });
  });

  it("creates personal workspace on sign-up and enriches customSession with plan and passkey status", async () => {
    const db = createInMemoryDb();
    const mailer = createCaptureMailer();

    let createdSpace: { id: string; name: string; plan: string } | null = null;
    mockTx.spaceMember.findFirst.mockImplementation(async () =>
      createdSpace ? { space: createdSpace } : null,
    );
    mockTx.space.create.mockImplementation(
      async ({ data }: { data: { name: string; plan: string } }) => {
        createdSpace = { id: "space_1", name: data.name, plan: data.plan };
        return createdSpace;
      },
    );
    mockTx.spaceMember.create.mockResolvedValue({ id: "mem_1" });
    mockTx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: "ada@example.com",
      name: "Ada",
      memberships: createdSpace ? [{ space: createdSpace }] : [],
      passkeys: [{ id: "pk_1" }],
    }));

    const auth = createAuth({
      db,
      boot: makeBoot(),
      mailer,
      otpMax: 5,
    });

    const sent = await auth.handler(
      new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ email: "ada@example.com", type: "sign-in" }),
      }),
    );
    expect(sent.status).toBe(200);

    const otp = mailer.take("ada@example.com");
    expect(otp).toMatch(/^\d{6}$/);

    const verified = await auth.handler(
      new Request("http://localhost:3001/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify({ email: "ada@example.com", otp, name: "Ada" }),
      }),
    );
    expect(verified.status).toBe(200);

    expect(mockTx.space.create).toHaveBeenCalledTimes(1);
    expect(mockTx.space.create).toHaveBeenCalledWith({
      data: { name: "Ada's Workspace", plan: "free" },
    });
    expect(mockTx.spaceMember.findFirst).toHaveBeenCalledWith({
      where: { userId: expect.any(String) },
      include: { space: true },
      orderBy: { createdAt: "asc" },
    });
    expect(mockTx.spaceMember.create).toHaveBeenCalledWith({
      data: { spaceId: "space_1", userId: expect.any(String), role: "owner" },
    });

    const cookie = (verified.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");

    // Test pro plan normalization via customSession
    createdSpace = { id: "space_1", name: "Ada's Workspace", plan: "pro" };
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user).toMatchObject({
      email: "ada@example.com",
      name: "Ada",
      spaceId: "space_1",
      spaceName: "Ada's Workspace",
      plan: "pro",
      hasPasskey: true,
    });

    // Test team plan & unknown plan normalization -> "free"
    createdSpace = { id: "space_1", name: "Ada's Workspace", plan: "team" };
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user?.plan).toBe(
      "team",
    );

    createdSpace = { id: "space_1", name: "Ada's Workspace", plan: "enterprise" };
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user?.plan).toBe(
      "free",
    );

    // Fallback to ensurePersonalSpace when memberships is empty & user name is null/whitespace
    createdSpace = null;
    mockTx.user.findUnique.mockImplementationOnce(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: "ada@example.com",
      name: null,
      memberships: [],
      passkeys: [],
    }));
    const fallbackSession = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(fallbackSession?.user).toMatchObject({
      spaceName: "Personal Workspace",
      plan: "free",
      hasPasskey: false,
    });

    createdSpace = null;
    mockTx.user.findUnique.mockImplementationOnce(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: "ada@example.com",
      name: "   ",
      memberships: [],
      passkeys: [],
    }));
    const blankNameSession = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(blankNameSession?.user?.spaceName).toBe("Personal Workspace");

    // Missing user row in customSession throws Account not found
    mockTx.user.findUnique.mockResolvedValueOnce(null);
    await expect(auth.api.getSession({ headers: new Headers({ cookie }) })).rejects.toThrow(
      "Account not found.",
    );
  });

  it("rate limits OTP requests according to otpMax and respects trustProxy headers", async () => {
    const auth = createAuth({
      db: createInMemoryDb(),
      boot: makeBoot({ trustProxy: true }),
      mailer: createCaptureMailer(),
      otpMax: 2,
    });

    const ip = nextIp();
    const send = () =>
      auth.handler(
        new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:5173",
            "cf-connecting-ip": ip,
          },
          body: JSON.stringify({ email: "limit@example.com", type: "sign-in" }),
        }),
      );

    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });
});
