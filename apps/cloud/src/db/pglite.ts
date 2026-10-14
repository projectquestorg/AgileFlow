import type { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable } from './sql';

/** In-process Postgres. `dataDir` undefined keeps everything in memory. */
export async function openPglite(dataDir?: string): Promise<Db> {
  // Imported lazily so bundles for hosted Postgres never load the WASM build.
  const { PGlite: Lite } = await import('@electric-sql/pglite');
  const pg = new Lite(dataDir);
  await pg.waitReady;
  const wrap = (q: { query: PGlite['query'] }): Queryable => ({
    query: async (text, params) => ({ rows: (await q.query(text, params as unknown[])).rows as never[] }),
  });
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}
