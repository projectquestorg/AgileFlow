import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, newRequestId, type ApiWarning } from './api';
import { useApp } from './app-context';

export interface LoadState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Load data for a view. Refetches in place when the app refresh tick changes
 * (keeps the previous data visible); resets when `deps` change.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): LoadState<T> {
  const { tick } = useApp();
  const key = JSON.stringify(deps);
  const [local, setLocal] = useState(0);
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean; key: string }>({ data: undefined, error: null, loading: true, key });
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const my = ++seq.current;
    setState((s) => (s.key === key ? { ...s, loading: true } : { data: undefined, error: null, loading: true, key }));
    fnRef.current().then(
      (data) => my === seq.current && setState({ data, error: null, loading: false, key }),
      (error) => my === seq.current && setState((s) => ({ data: s.key === key ? s.data : undefined, error, loading: false, key })),
    );
  }, [key, tick, local]);

  const reload = useCallback(() => setLocal((n) => n + 1), []);
  const same = state.key === key;
  return { data: same ? state.data : undefined, error: same ? state.error : null, loading: !same || state.loading, reload };
}

export interface ActionState {
  status: 'idle' | 'pending' | 'ok' | 'error';
  error?: ApiError | Error;
  success?: string;
  warnings?: ApiWarning[];
}

/**
 * Run a mutation with a fresh requestId. A retry of a failed attempt reuses
 * the same requestId so the service treats it idempotently.
 */
export function useAction() {
  const [st, setSt] = useState<ActionState>({ status: 'idle' });
  const last = useRef<{ fn: (rid: string) => Promise<any>; rid: string; success?: string; resolve?: (v: any) => void } | null>(null);

  const exec = useCallback(async () => {
    const cur = last.current;
    if (!cur) return;
    setSt({ status: 'pending' });
    try {
      const r = await cur.fn(cur.rid);
      setSt({ status: 'ok', success: cur.success, warnings: r?.warnings });
      cur.resolve?.(r);
      return r;
    } catch (err) {
      setSt({ status: 'error', error: err as Error });
      throw err;
    }
  }, []);

  const run = useCallback(
    <R,>(fn: (requestId: string) => Promise<R>, opts: { success?: string } = {}): Promise<R> => {
      last.current = { fn, rid: newRequestId(), success: opts.success };
      return exec() as Promise<R>;
    },
    [exec],
  );

  /** Retry with the same requestId; resolves `onDone` with the result on success. */
  const retry = useCallback(
    (onDone?: (r: any) => void) => {
      if (last.current) last.current.resolve = onDone;
      exec().catch(() => {});
    },
    [exec],
  );

  const reset = useCallback(() => setSt({ status: 'idle' }), []);
  return { ...st, pending: st.status === 'pending', run, retry, reset, setState: setSt };
}
export type Action = ReturnType<typeof useAction>;

export const isRetryable = (err: unknown) => err instanceof ApiError && (err.retryable || err.code === 'NETWORK');
