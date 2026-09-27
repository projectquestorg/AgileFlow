/** Fixed-window rate limiter keyed by caller. `now` is injectable for tests. */
export function createRateLimiter({ limit = 5, windowMs = 60_000, now = Date.now } = {}) {
  const windows = new Map();
  return {
    check(key) {
      const t = now();
      let w = windows.get(key);
      if (!w || t >= w.start + windowMs) {
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= limit) return { allowed: false, retryAfterMs: w.start + windowMs - t };
      w.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
