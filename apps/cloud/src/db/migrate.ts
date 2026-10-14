import { MIGRATIONS } from './migrations.generated';
import type { Db } from './sql';

/** Arbitrary constant for pg_advisory_xact_lock: one migrator at a time across instances. */
const MIGRATION_LOCK = 4_242_001;

/**
 * Apply every migration not yet recorded, each in its own transaction. Safe to
 * call on every cold start: concurrent instances serialize on an advisory lock
 * and re-check what is already applied inside it.
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied: string[] = [];
  for (const { name, sql } of MIGRATIONS) {
    const ran = await db.tx(async (q) => {
      await q.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
      if ((await q.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])).rows.length) return false;
      for (const stmt of splitStatements(sql)) await q.query(stmt);
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      return true;
    });
    if (ran) applied.push(name);
  }
  return applied;
}

/** Split on top-level semicolons (migrations contain no functions or quoted semicolons). */
function splitStatements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
