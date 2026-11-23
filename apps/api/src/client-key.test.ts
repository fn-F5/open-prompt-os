import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientKey, parseTrustProxyMode } from "./client-key.js";
import { loadConfig } from "./config.js";

describe("clientKey proxy spoofing protection", () => {
  it("parses explicit TRUST_PROXY modes and global guest daily limit", () => {
    expect(parseTrustProxyMode(undefined)).toBe(false);
    expect(parseTrustProxyMode("false")).toBe(false);
    expect(parseTrustProxyMode("proxy")).toBe("proxy");
    expect(parseTrustProxyMode("cloudflare")).toBe("cloudflare");
    expect(parseTrustProxyMode("true")).toBe(true);

    const cfg = loadConfig({
      TRUST_PROXY: "proxy",
      GLOBAL_GUEST_DAILY_LIMIT: "250",
    });
    expect(cfg.trustProxy).toBe("proxy");
    expect(cfg.globalGuestDailyLimit).toBe(250);
  });

  it("ignores spoofed cf-connecting-ip and leftmost X-Forwarded-For in 'proxy' mode", async () => {
    const app = new Hono();
    app.get("/proxy", (c) => c.text(clientKey(c, "proxy")));
    app.get("/cf", (c) => c.text(clientKey(c, "cloudflare")));
    app.get("/none", (c) => c.text(clientKey(c, "none")));

    // Behind Nginx/Railway/Render: attacker sends fake cf-connecting-ip + fake leading XFF IP;
    // proxy appends the real client IP at the end of X-Forwarded-For.
    const proxyRes = await app.request("/proxy", {
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "5.6.7.8, 203.0.113.42",
      },
    });
    expect(await proxyRes.text()).toBe("203.0.113.42");

    // Behind Cloudflare: trusts ONLY cf-connecting-ip and ignores X-Forwarded-For.
    const cfRes = await app.request("/cf", {
      headers: {
        "cf-connecting-ip": "198.51.100.77",
        "x-forwarded-for": "5.6.7.8",
      },
    });
    expect(await cfRes.text()).toBe("198.51.100.77");

    // Cloudflare mode with missing cf-connecting-ip does NOT fall back to spoofed XFF.
    const cfMissingRes = await app.request("/cf", {
      headers: {
        "x-forwarded-for": "5.6.7.8",
      },
    });
    expect(await cfMissingRes.text()).toBe("unknown");

    // Untrusted mode ignores all proxy headers.
    const noneRes = await app.request("/none", {
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "5.6.7.8",
      },
    });
    expect(await noneRes.text()).toBe("unknown");
  });
});
