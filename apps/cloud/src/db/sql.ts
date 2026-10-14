/** Minimal database surface shared by PGlite (tests, local dev) and node-postgres (production). */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  /** Run `fn` in one transaction; a thrown error rolls everything back. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function one<T>(q: Queryable, text: string, params?: unknown[]): Promise<T | undefined> {
  return (await q.query<T>(text, params)).rows[0];
}

export async function many<T>(q: Queryable, text: string, params?: unknown[]): Promise<T[]> {
  return (await q.query<T>(text, params)).rows;
}
