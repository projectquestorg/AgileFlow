import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyV4Import, planV4Import, resolveWorkPaths, scanWorkspace } from '@agileflow/work';
import { describe, expect, it } from 'vitest';
import { harness, seeded } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('scale', () => {
  it('serves paginated reads over 10,000 stories within the read budget', async () => {
    const h = await harness();
    const { admin, projectId } = await seeded(h);
    const ws = (await h.svc.db.query<{ workspace_id: string }>('SELECT workspace_id FROM projects WHERE id = $1', [projectId])).rows[0]!.workspace_id;
    const epic = 'EPIC-0000000E';
    await h.svc.db.query(`INSERT INTO work_items (id, workspace_id, project_id, native_id, type, title, status, content_hash) VALUES ('wi_e', $1, $2, $3, 'epic', 'Big epic', 'active', 'h')`, [ws, projectId, epic]);
    // Bulk-load 10k stories with a dependency chain, as the native performance fixture does.
    await h.svc.db.query(
      `INSERT INTO work_items (id, workspace_id, project_id, native_id, type, title, status, body, board_rank, content_hash)
       SELECT 'wi_' || g, $1, $2, 'STORY-' || lpad(g::text, 8, '0'), 'story', 'Story ' || g,
              (ARRAY['backlog','ready','in-progress','in-review','blocked','done','cancelled'])[1 + g % 7], '', g, 'h'
         FROM generate_series(1, 10000) g`,
      [ws, projectId],
    );
    await h.svc.db.query(
      `INSERT INTO work_relations (workspace_id, project_id, source_id, target_id, kind)
       SELECT $1, $2, 'STORY-' || lpad(g::text, 8, '0'), $3, 'parent_epic' FROM generate_series(1, 10000) g`,
      [ws, projectId, epic],
    );
    await h.svc.db.query(
      `INSERT INTO work_relations (workspace_id, project_id, source_id, target_id, kind)
       SELECT $1, $2, 'STORY-' || lpad(g::text, 8, '0'), 'STORY-' || lpad((g - 1)::text, 8, '0'), 'depends_on' FROM generate_series(2, 10000) g`,
      [ws, projectId],
    );
    const time = async (fn: () => Promise<unknown>) => {
      const t = performance.now();
      await fn();
      return performance.now() - t;
    };
    const timings: Record<string, number> = {
      list: await time(() => h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_list`, { type: 'story', limit: 200 })),
      readyFilter: await time(() => h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_list`, { readiness: 'ready', limit: 50 })),
      board: await time(() => h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_board_get`, {})),
      detail: await time(() => h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: 'STORY-00005000' })),
    };
    console.log('10k-story timings (ms, in-process PGlite, single run):', JSON.stringify(Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)]))));
    // Spec target: p95 < 500 ms for ordinary paginated reads on Postgres. PGlite (WASM) is slower,
    // so this asserts a loose bound that still catches quadratic behavior.
    for (const [k, v] of Object.entries(timings)) expect(v, k).toBeLessThan(5000);
    // A dependency-cycle check on update must not recurse over the 10k chain.
    const upd = await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId: 'STORY-00000001', expectedVersion: 1, patch: { dependsOn: ['STORY-00010000'] }, requestId: h.rid() });
    expect(upd.body.error.code).toBe('DEPENDENCY_INVALID');
  }, 120_000);
});

describe('v4 compatibility', () => {
  it('migrates a v4 backlog natively, then imports it into a connected project with legacy_id preserved', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-v4-'));
    fs.cpSync(path.join(ROOT, 'fixtures/v4-project'), tmp, { recursive: true });
    const paths = resolveWorkPaths(tmp, 'docs/agile');
    const plan = await planV4Import(await scanWorkspace(paths));
    await applyV4Import(await scanWorkspace(paths), plan);
    const files: Record<string, string> = {};
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const abs = path.join(d, e.name);
        if (e.isDirectory()) walk(abs);
        else if (e.name.endsWith('.md')) files[path.relative(paths.abs, abs).split(path.sep).join('/')] = fs.readFileSync(abs, 'utf8');
      }
    };
    walk(paths.abs);
    const nativeItems = Object.keys(files).filter((f) => /^0[234]-/.test(f));
    expect(nativeItems.length).toBeGreaterThan(0);

    const h = await harness();
    const { admin, projectId } = await seeded(h);
    const preview = (await h.api(admin, 'POST', `/projects/${projectId}/import/preview`, { files, operationKey: h.rid() })).body.data;
    expect(preview.preview.blocked).toBe(false);
    await h.api(admin, 'POST', `/projects/${projectId}/import/${preview.jobId}/commit`, { requestId: h.rid() });
    const stories = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_list`, { type: 'story', limit: 200 })).body.data.items;
    expect(stories.length).toBeGreaterThan(0);
    const detail = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: stories[0].id })).body.data;
    expect(detail.legacyId).toBeTruthy();
    // And it exports back with legacy provenance in native frontmatter.
    const exp = (await h.api(admin, 'POST', `/projects/${projectId}/export`, {})).body.data;
    expect(Object.values(exp.files).some((c) => String(c).includes('legacy_id:'))).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  }, 60_000);
});
