import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

export type TrustProxyMode = boolean | "cloudflare" | "proxy" | "none";

export function parseTrustProxyMode(raw: string | undefined): TrustProxyMode {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "cloudflare") return "cloudflare";
  if (normalized === "proxy") return "proxy";
  if (normalized === "true") return true;
  return false;
}

export function clientKey(c: Context, trustProxy: TrustProxyMode): string {
  if (process.env.NODE_ENV === "test") {
    const directKey = c.req.header("x-client-key")?.trim();
    if (directKey) return directKey;
  }
  if (trustProxy === "cloudflare") {
    const cfIp = c.req.header("cf-connecting-ip")?.trim();
    if (cfIp) return cfIp;
  } else if (trustProxy === "proxy") {
    // Behind a standard reverse proxy (Nginx/Railway/Render/ALB), ignore cf-connecting-ip
    // and use the rightmost X-Forwarded-For entry appended by the trusted proxy hop.
    const rawXff = c.req.header("x-forwarded-for");
    if (rawXff) {
      const hops = rawXff
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const proxyAppended = hops.at(-1);
      if (proxyAppended) return proxyAppended;
    }
  } else if (trustProxy === true) {
    const cfIp = c.req.header("cf-connecting-ip")?.trim();
    if (cfIp) return cfIp;
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
