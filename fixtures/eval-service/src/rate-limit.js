/** Requests allowed per key in each window. */
export const DEFAULT_LIMIT = 60;
export const WINDOW_MS = 60_000;

/**
 * Fixed-window rate limiter keyed by caller (IP, user id, ...).
 * `now` is injectable so tests can control time.
 */
export function createRateLimiter({ limit = DEFAULT_LIMIT, windowMs = WINDOW_MS, now = Date.now } = {}) {
  const windows = new Map();

  return {
    limit,
    /** @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }} */
    check(key) {
      const t = now();
      let w = windows.get(key);
      if (!w || t >= w.start + windowMs) {
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= limit) return { allowed: false, remaining: 0, retryAfterMs: w.start + windowMs - t };
      w.count += 1;
      return { allowed: true, remaining: limit - w.count, retryAfterMs: 0 };
    },
  };
}
