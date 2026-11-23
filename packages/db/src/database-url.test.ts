import { describe, expect, it, vi } from "vitest";
import { resolveDatabaseUrl } from "./database-url.js";

describe("resolveDatabaseUrl", () => {
  it("uses the passed env object instead of leaking process.env and does not auto-load .env", () => {
    const loadSpy =
      typeof process.loadEnvFile === "function"
        ? vi.spyOn(process, "loadEnvFile").mockImplementation(() => {})
        : null;
    try {
      const url = resolveDatabaseUrl({
        DATABASE_URL: "postgresql://custom_user:custom_pass@db.internal:5433/custom_db",
      });
      expect(url).toBe("postgresql://custom_user:custom_pass@db.internal:5433/custom_db");
      if (loadSpy) {
        expect(loadSpy).not.toHaveBeenCalled();
      }
    } finally {
      loadSpy?.mockRestore();
    }
  });

  it("trims whitespace around explicit DATABASE_URL", () => {
    const url = resolveDatabaseUrl({
      DATABASE_URL: "  postgresql://u:p@host:5432/app  ",
    });
    expect(url).toBe("postgresql://u:p@host:5432/app");
  });

  it("ignores unexpanded ${...} template placeholders in DATABASE_URL and composes from POSTGRES_*", () => {
    const url = resolveDatabaseUrl({
      DATABASE_URL: "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/app",
      POSTGRES_USER: "ops",
      POSTGRES_PASSWORD: "s3cr3t",
      POSTGRES_DB: "prompt_os",
      POSTGRES_HOST: "pg.local",
      POSTGRES_PORT: "6432",
    });
    expect(url).toBe("postgresql://ops:s3cr3t@pg.local:6432/prompt_os?schema=public");
  });

  it("URL-encodes special characters in credentials and database name", () => {
    const url = resolveDatabaseUrl({
      POSTGRES_USER: "user@corp",
      POSTGRES_PASSWORD: "p@ss:w/o#rd%20!",
      POSTGRES_DB: "prompt os/prod",
    });
    expect(url).toBe(
      "postgresql://user%40corp:p%40ss%3Aw%2Fo%23rd%2520!@localhost:5432/prompt%20os%2Fprod?schema=public",
    );
  });

  it("omits password colon when POSTGRES_PASSWORD is empty", () => {
    const url = resolveDatabaseUrl({
      POSTGRES_USER: "readonly",
      POSTGRES_DB: "analytics",
    });
    expect(url).toBe("postgresql://readonly@localhost:5432/analytics?schema=public");
  });

  it("returns fallback connection string in test env when DB vars are absent", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "test" })).toBe(
      "postgresql://admin:password@localhost:5432/open_prompt_os?schema=public",
    );
    expect(resolveDatabaseUrl({ VITEST: "true" })).toBe(
      "postgresql://admin:password@localhost:5432/open_prompt_os?schema=public",
    );
  });

  it("throws when DB is not configured outside test environments", () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: "production" })).toThrow(
      /Database not configured/i,
    );
    expect(() => resolveDatabaseUrl({})).toThrow(/Database not configured/i);
  });
});
