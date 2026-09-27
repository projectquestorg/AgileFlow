/** A failed operation with actionable hints for the user. */
export class OperationError extends Error {
  constructor(
    message: string,
    readonly hint?: string[],
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

export interface OperationEvent {
  level: 'info' | 'warn' | 'error';
  skill?: string;
  message: string;
}

/**
 * Start `fn` for every item with at most `limit` running at once. Returns the
 * settled promises keyed by item, so callers await each result where they
 * need it and a failure never becomes an unhandled rejection.
 */
export function startLimited<K, T>(items: K[], limit: number, fn: (item: K) => Promise<T>): Map<K, Promise<PromiseSettledResult<T>>> {
  const results = new Map<K, Promise<PromiseSettledResult<T>>>();
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  for (const item of items) {
    results.set(
      item,
      new Promise<PromiseSettledResult<T>>((resolve) => {
        const start = () => {
          active++;
          fn(item).then(
            (value) => resolve({ status: 'fulfilled', value }),
            (reason: unknown) => resolve({ status: 'rejected', reason }),
          ).finally(next);
        };
        if (active < limit) start();
        else queue.push(start);
      }),
    );
  }
  return results;
}

/** Unwrap a settled result: return the value or throw the original error. */
export function settledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'fulfilled') return result.value;
  throw result.reason;
}
