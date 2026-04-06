/**
 * In-memory rate limiter for Netlify Functions.
 *
 * Uses a sliding window counter per IP/user key.
 * In serverless: each cold-start resets the map, so this is best-effort
 * protection against bursts within the same container lifetime.
 * For production hardened rate limiting, use an external store (Redis/KV).
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });
 *   if (limiter.isLimited(key)) return jsonResponse(429, { error: 'Too many requests' });
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
}

interface RateLimiter {
  /**
   * Returns true if the key has exceeded the limit.
   * Automatically increments the counter.
   */
  isLimited(key: string): boolean;
  /** Returns remaining requests for a key */
  remaining(key: string): number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  // Use a shared store keyed by options fingerprint to survive module caching
  const storeKey = `${opts.windowMs}-${opts.max}`;
  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map());
  }
  const store = stores.get(storeKey)!;

  // Periodic cleanup to prevent memory leaks (every 60s)
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 60_000);

  return {
    isLimited(key: string): boolean {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        // New window
        store.set(key, { count: 1, resetAt: now + opts.windowMs });
        return false;
      }

      entry.count++;
      if (entry.count > opts.max) {
        return true; // RATE LIMITED
      }
      return false;
    },

    remaining(key: string): number {
      const entry = store.get(key);
      if (!entry || Date.now() > entry.resetAt) return opts.max;
      return Math.max(0, opts.max - entry.count);
    },
  };
}

/**
 * Extract a rate-limit key from the request.
 * Prefers authenticated user UID, falls back to IP.
 */
export function getRateLimitKey(event: { headers: Record<string, string | undefined> }, userId?: string): string {
  if (userId) return `user:${userId}`;
  return `ip:${event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown'}`;
}

/**
 * Pre-configured limiters for different tiers.
 */
export const rateLimiters = {
  /** AI endpoints — expensive, strict limit: 10 req/min */
  ai: createRateLimiter({ windowMs: 60_000, max: 10 }),
  /** Write endpoints — moderate: 60 req/min */
  write: createRateLimiter({ windowMs: 60_000, max: 60 }),
  /** Read endpoints — generous: 200 req/min */
  read: createRateLimiter({ windowMs: 60_000, max: 200 }),
  /** Auth endpoints — strict: 20 req/min (brute force protection) */
  auth: createRateLimiter({ windowMs: 60_000, max: 20 }),
};
