/** Fixed-window rate limiter (in memory; one process). */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; returns false when `key` is over its limit for the current window. */
  allow(key: string): boolean {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t - h.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: t, count: 1 });
      if (this.hits.size > 10_000) this.prune(t);
      return true;
    }
    h.count++;
    return h.count <= this.limit;
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) if (t - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}

/**
 * The client address used for rate limiting. With `header` set (e.g. `cf-connecting-ip`), that
 * header is trusted as-is. Otherwise X-Forwarded-For is read from the right: the entry
 * `hops` from the end was added by the nearest trusted proxy, and entries to its left can be
 * forged by the client. Falls back to "local" when there is no proxy header.
 */
export function clientIp(get: (name: string) => string | undefined, hops: number, header?: string): string {
  if (header) return get(header)?.trim() || 'local';
  const parts = (get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'local';
  return parts[Math.max(0, parts.length - Math.max(1, hops))] ?? 'local';
}
