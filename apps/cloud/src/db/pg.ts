import pg from 'pg';
import type { Db, Queryable } from './sql';

/** node-postgres pool for production deployments (DATABASE_URL). */
export async function openPostgres(connectionString: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString, max: Number(process.env.AGILEFLOW_DB_POOL ?? 10) });
  const wrap = (c: pg.Pool | pg.PoolClient): Queryable => ({
    query: async (text, params) => ({ rows: (await c.query(text, params as unknown[])).rows }),
  });
  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
