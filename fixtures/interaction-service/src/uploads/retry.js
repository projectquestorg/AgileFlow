const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Errors worth retrying: network failures and 5xx responses. */
export function isRetryable(err) {
  return err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || (err.status >= 500 && err.status < 600);
}

/**
 * The retry policy for uploads: up to 3 attempts with exponential backoff
 * (200ms, 400ms), retrying only retryable errors.
 */
export async function withRetry(fn, { attempts = 3, baseDelayMs = 200, wait = sleep } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isRetryable(err)) throw err;
      await wait(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
