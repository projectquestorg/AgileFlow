/**
 * Real-PostgreSQL drill: p95 latency on 10k stories, then a cold backup/restore.
 *
 *   EMBEDDED_PG_MODULE=/path/to/node_modules/embedded-postgres/dist/index.js \
 *   npx tsx apps/cloud/scripts/pg-drill.ts > pg-drill-results.json
 *
 * Uses a throwaway local Postgres (embedded-postgres binaries) and the real
 * service code over node-postgres. Prints a JSON report; exits 1 on any failure.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { devService } from '../src/bootstrap';
import { openPostgres } from '../src/db/pg';

const mod = process.env.EMBEDDED_PG_MODULE;
if (!mod) throw new Error('EMBEDDED_PG_MODULE is required');
const EmbeddedPostgres = (await import(mod)).default as any;
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'af-pg-'));
const report: Record<string, unknown> = { postgres: null, at: new Date().toISOString() };
const fail: string[] = [];

async function start(dir: string, port: number, init: boolean) {
  const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'agileflow', password: 'agileflow', persistent: true, onLog: () => {}, onError: () => {} });
  if (init) await pg.initialise();
  await pg.start();
  if (init) await pg.createDatabase('agileflow');
  return pg;
}

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1]!;

const primaryDir = path.join(base, 'primary');
let pg = await start(primaryDir, 54329, true);
let db = await openPostgres('postgres://agileflow:agileflow@127.0.0.1:54329/agileflow');
report.postgres = (await db.query<{ v: string }>('SELECT version() AS v')).rows[0]!.v;
const svc = await devService({ db });
const { issuer, directory } = svc.dev;
directory.set('org_drill', 'user_admin', { role: 'admin', user: { displayName: 'Admin' } });
const session = await issuer.session({ userId: 'user_admin', orgId: 'org_drill', orgRole: 'admin', azp: 'http://localhost:8787' });
const call = async (method: string, p: string, body?: unknown) => {
  const res = await svc.app.fetch(new Request(`http://localhost:8787/api${p}`, { method, headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return (await res.json()) as any;
};
const projectId = (await call('POST', '/projects', { name: 'Drill' })).data.id as string;
const ws = (await db.query<{ workspace_id: string }>('SELECT workspace_id FROM projects WHERE id = $1', [projectId])).rows[0]!.workspace_id;
await db.query(`INSERT INTO work_items (id, workspace_id, project_id, native_id, type, title, status, content_hash) VALUES ('wi_e', $1, $2, 'EPIC-0000000E', 'epic', 'Epic', 'active', 'h')`, [ws, projectId]);
await db.query(
  `INSERT INTO work_items (id, workspace_id, project_id, native_id, type, title, status, body, board_rank, content_hash)
   SELECT 'wi_' || g, $1, $2, 'STORY-' || lpad(g::text, 8, '0'), 'story', 'Story ' || g,
          (ARRAY['backlog','ready','in-progress','in-review','blocked','done','cancelled'])[1 + g % 7], 'Body ' || g, g, 'h'
     FROM generate_series(1, 10000) g`,
  [ws, projectId],
);
await db.query(`INSERT INTO work_relations (workspace_id, project_id, source_id, target_id, kind) SELECT $1, $2, 'STORY-' || lpad(g::text, 8, '0'), 'EPIC-0000000E', 'parent_epic' FROM generate_series(1, 10000) g`, [ws, projectId]);
await db.query(`INSERT INTO work_relations (workspace_id, project_id, source_id, target_id, kind) SELECT $1, $2, 'STORY-' || lpad(g::text, 8, '0'), 'STORY-' || lpad((g - 1)::text, 8, '0'), 'depends_on' FROM generate_series(2, 10000) g`, [ws, projectId]);
await db.query('ANALYZE');

const tool = (name: string, args: unknown) => call('POST', `/projects/${projectId}/tools/${name}`, args);
const timings: Record<string, number[]> = { list: [], readyFilter: [], board: [], detail: [], mutation: [] };
for (let i = 0; i < 40; i++) {
  const t = async (k: string, fn: () => Promise<any>) => {
    const s = performance.now();
    const r = await fn();
    timings[k]!.push(performance.now() - s);
    if (r.ok === false) fail.push(`${k}: ${r.error?.code}`);
  };
  await t('list', () => tool('agileflow_work_list', { type: 'story', limit: 50 }));
  await t('readyFilter', () => tool('agileflow_work_list', { readiness: 'ready', limit: 50 }));
  await t('board', () => tool('agileflow_board_get', {}));
  await t('detail', () => tool('agileflow_work_get', { workId: `STORY-${String(1 + i * 200).padStart(8, '0')}` }));
  await t('mutation', () => tool('agileflow_note_add', { workId: `STORY-${String(1 + i).padStart(8, '0')}`, kind: 'comment', body: `drill ${i}`, requestId: `drill-note-${i}` }));
}
const latency = Object.fromEntries(Object.entries(timings).map(([k, xs]) => [k, { p95ms: Math.round(p95(xs)), n: xs.length }]));
report.latency = { ...latency, note: 'Server-side in-process measurement on one local Postgres; external membership verification is the in-memory dev directory. Targets: reads p95 < 500 ms, mutations p95 < 750 ms.' };
for (const k of ['list', 'readyFilter', 'board', 'detail']) if (latency[k]!.p95ms >= 500) fail.push(`${k} p95 ${latency[k]!.p95ms} ms >= 500`);
if (latency.mutation!.p95ms >= 750) fail.push(`mutation p95 ${latency.mutation!.p95ms} ms >= 750`);

// ---- backup / restore drill (cold physical copy) ----
const fingerprint = async (q: typeof db) => {
  const tables = ['work_items', 'work_relations', 'notes', 'activity_events', 'revisions', 'idempotency_records', 'documents', 'project_grants', 'memberships'];
  const out: Record<string, string> = {};
  for (const t of tables) {
    const rows = (await q.query(`SELECT * FROM ${t}`)).rows.map((r) => JSON.stringify(r, Object.keys(r).sort())).sort();
    out[t] = `${rows.length}:${crypto.createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16)}`;
  }
  return out;
};
const before = await fingerprint(db);
await db.close();
await pg.stop();
const restoreDir = path.join(base, 'restored');
const t0 = performance.now();
fs.cpSync(primaryDir, restoreDir, { recursive: true });
fs.rmSync(path.join(restoreDir, 'postmaster.pid'), { force: true });
pg = await start(restoreDir, 54330, false);
db = await openPostgres('postgres://agileflow:agileflow@127.0.0.1:54330/agileflow');
const after = await fingerprint(db);
const restoredSvc = await devService({ db });
restoredSvc.dev.directory.set('org_drill', 'user_admin', { role: 'admin', user: { displayName: 'Admin' } });
const session2 = await restoredSvc.dev.issuer.session({ userId: 'user_admin', orgId: 'org_drill', orgRole: 'admin', azp: 'http://localhost:8787' });
const read = await (await restoredSvc.app.fetch(new Request(`http://localhost:8787/api/projects/${projectId}/tools/agileflow_work_get`, { method: 'POST', headers: { authorization: `Bearer ${session2}`, 'content-type': 'application/json' }, body: JSON.stringify({ workId: 'STORY-00005000' }) }))).json() as any;
// A retried pre-backup request replays its recorded result instead of executing twice.
const replay = await (await restoredSvc.app.fetch(new Request(`http://localhost:8787/api/projects/${projectId}/tools/agileflow_note_add`, { method: 'POST', headers: { authorization: `Bearer ${session2}`, 'content-type': 'application/json' }, body: JSON.stringify({ workId: 'STORY-00000001', kind: 'comment', body: 'drill 0', requestId: 'drill-note-0' }) }))).json() as any;
const mismatched = Object.keys(before).filter((k) => before[k] !== after[k]);
report.restore = {
  method: 'cold physical copy of the data directory into a new instance',
  restoreSeconds: Math.round((performance.now() - t0) / 100) / 10,
  tables: after,
  identical: mismatched.length === 0,
  readAfterRestore: read.ok === true && read.data?.readiness?.waitingOn?.length === 1,
  idempotentReplayAfterRestore: replay.replayed === true,
};
if (mismatched.length) fail.push(`restore mismatch: ${mismatched.join(', ')}`);
if (read.ok !== true) fail.push('read after restore failed');
if (replay.replayed !== true) fail.push('idempotent replay after restore failed');
await db.close();
await pg.stop();
fs.rmSync(base, { recursive: true, force: true });
report.failures = fail;
console.log(JSON.stringify(report, null, 2));
process.exitCode = fail.length ? 1 : 0;
