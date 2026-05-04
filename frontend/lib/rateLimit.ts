/**
 * NexaMind — In-Memory Rate Limiter
 *
 * Simple sliding-window rate limiter using a Map.
 * Entries are automatically cleaned up every 5 minutes to prevent leaks.
 *
 * Usage:
 *   const result = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
 *   if (!result.allowed) return 429;
 */

interface RateLimitEntry {
  count: number;
  /** Unix timestamp (ms) when the window resets */
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Purge expired entries every 5 minutes to prevent unbounded growth
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  Array.from(store.entries()).forEach(([key, entry]) => {
    if (entry.resetAt < now) store.delete(key);
  });
}, CLEANUP_INTERVAL_MS);

export interface RateLimitResult {
  /** Whether the request is within the allowed limit */
  allowed: boolean;
  /** Requests remaining in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the window resets */
  resetAt: number;
}

/**
 * Check and increment a rate limit counter.
 *
 * @param key        - Unique key (e.g. "register:192.168.1.1")
 * @param maxRequests - Maximum requests allowed per window
 * @param windowMs   - Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  entry.count += 1;
  store.set(key, entry);

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}
