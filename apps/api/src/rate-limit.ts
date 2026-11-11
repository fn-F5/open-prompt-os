/** Fixed-window limiter keyed by client. Enough for one API process. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const time = now();
    if (hits.size > 10_000) {
      for (const [hitKey, hit] of hits) {
        if (hit.resetAt <= time) hits.delete(hitKey);
      }
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      hits.set(key, { count: 1, resetAt: time + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
