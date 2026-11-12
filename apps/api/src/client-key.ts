import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

export function clientKey(c: Context, trustProxy: boolean): string {
  const directKey = c.req.header("x-client-key")?.trim();
  if (directKey) return directKey;
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
