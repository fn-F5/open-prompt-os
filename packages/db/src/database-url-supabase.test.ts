import { describe, expect, it } from "vitest";
import { buildPgPoolConfig, resolveDatabaseUrl, resolveDirectDatabaseUrl } from "./database-url.js";

describe("Supabase and Vercel Postgres URL resolution", () => {
  it("resolves OPOS_POSTGRES_PRISMA_URL when DATABASE_URL is absent", () => {
    const url = resolveDatabaseUrl({
      OPOS_POSTGRES_PRISMA_URL:
        "postgres://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
      OPOS_POSTGRES_URL:
        "postgres://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    });
    expect(url).toBe(
      "postgres://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    );
  });

  it("falls back to OPOS_POSTGRES_URL and OPOS_POSTGRES_* discrete fields", () => {
    expect(
      resolveDatabaseUrl({
        OPOS_POSTGRES_URL:
          "postgres://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      }),
    ).toBe("postgres://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres");

    expect(
      resolveDatabaseUrl({
        OPOS_POSTGRES_USER: "postgres.proj",
        OPOS_POSTGRES_PASSWORD: "secret",
        OPOS_POSTGRES_HOST: "aws-0-us-east-1.pooler.supabase.com",
        OPOS_POSTGRES_DATABASE: "postgres",
      }),
    ).toBe(
      "postgresql://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres?schema=public",
    );
  });

  it("prefers OPOS_POSTGRES_URL_NON_POOLING for direct migrations", () => {
    const direct = resolveDirectDatabaseUrl({
      OPOS_POSTGRES_PRISMA_URL:
        "postgres://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
      OPOS_POSTGRES_URL_NON_POOLING:
        "postgres://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    });
    expect(direct).toBe(
      "postgres://postgres.proj:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    );
  });

  it("falls back to resolveDatabaseUrl when direct URLs are unset", () => {
    const direct = resolveDirectDatabaseUrl({
      DATABASE_URL: "postgresql://app:pass@db.internal:5432/open_prompt_os",
    });
    expect(direct).toBe("postgresql://app:pass@db.internal:5432/open_prompt_os");
  });

  it("configures relaxed SSL for hosted sslmode=require and Supabase URLs while keeping localhost plain", () => {
    expect(
      buildPgPoolConfig(
        "postgres://postgres.proj:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require",
      ),
    ).toEqual({
      connectionString:
        "postgres://postgres.proj:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
      ssl: { rejectUnauthorized: false },
    });

    expect(buildPgPoolConfig("postgresql://admin:pass@localhost:5432/open_prompt_os")).toEqual({
      connectionString: "postgresql://admin:pass@localhost:5432/open_prompt_os",
    });
  });
});
