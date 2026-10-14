import { EventEmitter } from 'node:events';
import { many } from '../db/sql';
import type { Core } from './core';

export const MAX_ATTEMPTS = 10;

/** In-process change notifications for long-polling browsers (per project). */
export class ChangeNotifier {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(projectId: string, seq: number): void {
    this.emitter.emit(projectId, seq);
  }

  /** Resolve with the first sequence > `since` published for the project, or null after `timeoutMs`. */
  wait(projectId: string, since: number, timeoutMs: number, signal?: AbortSignal): Promise<number | null> {
    return new Promise((resolve) => {
      const done = (v: number | null) => {
        clearTimeout(timer);
        this.emitter.off(projectId, onSeq);
        signal?.removeEventListener('abort', onAbort);
        resolve(v);
      };
      const onSeq = (seq: number) => seq > since && done(seq);
      const onAbort = () => done(null);
      const timer = setTimeout(() => done(null), timeoutMs);
      this.emitter.on(projectId, onSeq);
      signal?.addEventListener('abort', onAbort);
    });
  }
}

type Handler = (payload: Record<string, unknown>, row: { workspace_id: string; project_id: string | null }) => Promise<void>;

/**
 * Delivers transactionally written outbox rows after commit. Delivery is not
 * what makes a write committed; a failed delivery retries with backoff and
 * stops after MAX_ATTEMPTS (visible as exhausted rows).
 */
export class OutboxWorker {
  private readonly handlers = new Map<string, Handler>();

  constructor(
    private readonly core: Core,
    readonly notifier = new ChangeNotifier(),
  ) {
    this.handlers.set('activity', async (p, row) => {
      if (row.project_id) this.notifier.publish(row.project_id, Number(p.seq));
    });
  }

  on(topic: string, handler: Handler): void {
    this.handlers.set(topic, handler);
  }

  /** Process one batch. Returns how many rows were delivered. */
  async runOnce(batch = 100): Promise<number> {
    return this.core.db.tx(async (q) => {
      const rows = await many<{ id: string; workspace_id: string; project_id: string | null; topic: string; payload: Record<string, unknown>; attempts: number }>(
        q,
        `SELECT id, workspace_id, project_id, topic, payload, attempts FROM outbox
          WHERE delivered_at IS NULL AND attempts < $1
            AND (attempts = 0 OR created_at + (interval '1 second' * power(2, attempts)) < now())
          ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [MAX_ATTEMPTS, batch],
      );
      let delivered = 0;
      for (const row of rows) {
        const handler = this.handlers.get(row.topic);
        try {
          if (!handler) throw new Error(`no handler for ${row.topic}`);
          await handler(row.payload, row);
          await q.query('UPDATE outbox SET delivered_at = now(), attempts = attempts + 1 WHERE id = $1', [row.id]);
          delivered++;
        } catch {
          await q.query('UPDATE outbox SET attempts = attempts + 1 WHERE id = $1', [row.id]);
        }
      }
      return delivered;
    });
  }

  /** Delivery backlog for diagnostics. */
  async stats() {
    return (await many<{ pending: number; exhausted: number }>(
      this.core.db,
      `SELECT count(*) FILTER (WHERE delivered_at IS NULL AND attempts < $1)::int AS pending,
              count(*) FILTER (WHERE delivered_at IS NULL AND attempts >= $1)::int AS exhausted FROM outbox`,
      [MAX_ATTEMPTS],
    ))[0]!;
  }

  start(intervalMs = 500): () => void {
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      this.runOnce()
        .catch((err) => console.error(JSON.stringify({ level: 'error', msg: 'outbox delivery failed', error: String(err).slice(0, 200) })))
        .finally(() => (running = false));
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
