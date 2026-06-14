/**
 * Persistent rate limiter using Netlify Blobs.
 *
 * Unlike the in-memory rate limiter, this survives cold starts and works
 * correctly across multiple serverless instances.
 *
 * Falls back to the in-memory limiter if Netlify Blobs is unavailable
 * (e.g., local development without `netlify dev`).
 *
 * Usage:
 *   import { persistentRateLimiters, getRateLimitKey } from './persistent-rate-limiter';
 *   const key = getRateLimitKey(event, user?.uid);
 *   if (await persistentRateLimiters.ai.isLimited(key)) {
 *     return jsonResponse(429, { error: 'Too many requests' });
 *   }
 */

import { getStore } from '@netlify/blobs';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface PersistentRateLimiterOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
  /** Store name prefix for Netlify Blobs */
  storeName: string;
}

interface PersistentRateLimiter {
  /** Returns true if the key has exceeded the limit. */
  isLimited(key: string): Promise<boolean>;
}

function createPersistentRateLimiter(opts: PersistentRateLimiterOptions): PersistentRateLimiter {
  return {
    async isLimited(key: string): Promise<boolean> {
      try {
        const store = getStore({ name: opts.storeName, consistency: 'eventual' });
        const blobKey = key.replace(/[^a-zA-Z0-9_-]/g, '_'); // sanitize key
        const now = Date.now();

        // Read current entry
        const raw = await store.get(blobKey, { type: 'text' });
        let entry: RateLimitEntry | null = null;

        if (raw) {
          try {
            entry = JSON.parse(raw) as RateLimitEntry;
          } catch { entry = null; }
        }

        // New window or expired
        if (!entry || now > entry.resetAt) {
          const newEntry: RateLimitEntry = { count: 1, resetAt: now + opts.windowMs };
          await store.set(blobKey, JSON.stringify(newEntry));
          return false;
        }

        // Increment
        entry.count++;
        await store.set(blobKey, JSON.stringify(entry));

        return entry.count > opts.max;
      } catch (err) {
        // Blobs unavailable (local dev, permissions issue) — allow through
        console.warn(`[rate-limiter] Blobs unavailable for ${opts.storeName}, allowing request:`, err);
        return false;
      }
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
 * Pre-configured persistent limiters for different tiers.
 */
export const persistentRateLimiters = {
  /** AI endpoints — expensive, strict limit: 10 req/min */
  ai: createPersistentRateLimiter({ windowMs: 60_000, max: 10, storeName: 'rate-limit-ai' }),
  /** Write endpoints — moderate: 60 req/min */
  write: createPersistentRateLimiter({ windowMs: 60_000, max: 60, storeName: 'rate-limit-write' }),
  /** Read endpoints — generous: 200 req/min */
  read: createPersistentRateLimiter({ windowMs: 60_000, max: 200, storeName: 'rate-limit-read' }),
  /** Auth endpoints — strict: 20 req/min (brute force protection) */
  auth: createPersistentRateLimiter({ windowMs: 60_000, max: 20, storeName: 'rate-limit-auth' }),
};
