import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS } from '../src/domain/outbox';
import { ALL_WRITE, harness, seeded } from './helpers';

describe('outbox delivery and change feed', () => {
  it('wakes a long-polling browser after commit and retries failed deliveries until exhausted', async () => {
    const h = await harness();
    const { admin, projectId, orgId } = await seeded(h);
    const seq = (await h.api(admin, 'GET', `/projects/${projectId}/changes`)).body.data.latestSeq;
    const waiting = h.api(admin, 'GET', `/projects/${projectId}/changes?since=${seq}&wait=10`);
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE }));
    await agent.call('agileflow_note_add', { projectId, kind: 'progress', body: 'hello', requestId: h.rid() });
    const t = Date.now();
    expect(await h.svc.services.outbox.runOnce()).toBeGreaterThan(0);
    const woke = await waiting;
    expect(woke.body.data.latestSeq).toBeGreaterThan(seq);
    expect(Date.now() - t).toBeLessThan(2000);
    // Nothing pending after delivery.
    expect((await h.svc.services.outbox.stats()).pending).toBe(0);

    // A failing handler retries with backoff and is eventually reported as exhausted.
    h.svc.services.outbox.on('activity', async () => {
      throw new Error('downstream unavailable');
    });
    await agent.call('agileflow_note_add', { projectId, kind: 'progress', body: 'again', requestId: h.rid() });
    expect(await h.svc.services.outbox.runOnce()).toBe(0);
    expect((await h.svc.services.outbox.stats()).pending).toBeGreaterThan(0);
    await h.svc.db.query(`UPDATE outbox SET attempts = $1 WHERE delivered_at IS NULL`, [MAX_ATTEMPTS]);
    expect((await h.svc.services.outbox.stats())).toMatchObject({ pending: 0, exhausted: 1 });

    // A revoked user stops receiving changes.
    await h.api(admin, 'PUT', `/projects/${projectId}/grants/user_viewer`, { role: null, requestId: h.rid() });
    const viewer = await h.session('user_viewer', orgId, 'member');
    expect((await h.api(viewer, 'GET', `/projects/${projectId}/changes`)).body.error.code).toBe('NOT_FOUND');
  });
});

describe('archive, deletion, restore, purge', () => {
  it('archive makes the project read-only; deletion removes access, restore returns it, purge removes data after 30 days', async () => {
    const h = await harness();
    const { admin, projectId, orgId } = await seeded(h);
    await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_create`, { kind: 'story', title: 'Keep me', requestId: h.rid() });
    await h.api(admin, 'POST', `/projects/${projectId}/archive`, { archived: true, requestId: h.rid() });
    expect((await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_create`, { kind: 'story', title: 'x', requestId: h.rid() })).body.error.code).toBe('PROJECT_ARCHIVED');
    expect((await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_list`, {})).body.data.items).toHaveLength(1);
    await h.api(admin, 'POST', `/projects/${projectId}/archive`, { archived: false, requestId: h.rid() });

    expect((await h.api(admin, 'POST', `/projects/${projectId}/delete`, { confirmName: 'wrong', requestId: h.rid() })).body.error.code).toBe('VALIDATION_ERROR');
    const del = (await h.api(admin, 'POST', `/projects/${projectId}/delete`, { confirmName: 'Acme App', requestId: h.rid() })).body.data;
    expect(new Date(del.purgeAfter).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId }));
    expect((await agent.call('agileflow_work_list', { projectId })).error.code).toBe('NOT_FOUND');
    const me = (await h.api(admin, 'GET', '/me')).body.data;
    expect(me.projects).toHaveLength(0);
    expect(me.deletedProjects.map((p: any) => p.id)).toEqual([projectId]);

    await h.api(admin, 'POST', `/projects/${projectId}/restore`, {});
    expect((await agent.call('agileflow_work_list', { projectId })).data.items).toHaveLength(1);

    await h.api(admin, 'POST', `/projects/${projectId}/delete`, { confirmName: 'Acme App', requestId: h.rid() });
    expect(await h.svc.services.admin.purgeExpired()).toBe(0);
    await h.svc.db.query(`UPDATE projects SET deletion_requested_at = now() - interval '31 days' WHERE id = $1`, [projectId]);
    expect(await h.svc.services.admin.purgeExpired()).toBe(1);
    const left = await h.svc.db.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM work_items WHERE project_id = $1) + (SELECT count(*) FROM activity_events WHERE project_id = $1) + (SELECT count(*) FROM projects WHERE id = $1) AS n`,
      [projectId],
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
  });
});

describe('notes: promotion, own-note edits, redaction', () => {
  it('promotes a decision proposal, edits only your own notes, and redacts through history and export', async () => {
    const h = await harness();
    const { admin, projectId, orgId } = await seeded(h);
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE }));
    const proposal = (await agent.call('agileflow_note_add', { projectId, kind: 'decision-proposal', body: 'Use Postgres for the work store.', requestId: h.rid() })).data;
    const promoted = (await h.api(admin, 'POST', `/projects/${projectId}/notes/${proposal.id}/promote`, { title: 'Use Postgres', requestId: h.rid() })).body.data;
    expect(promoted.decisionId).toMatch(/^DEC-/);
    const dec = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: promoted.decisionId })).body.data;
    expect(dec).toMatchObject({ type: 'decision', status: 'proposed' });
    expect(dec.content.body).toContain(proposal.id);
    expect((await h.api(admin, 'POST', `/projects/${projectId}/notes/${proposal.id}/promote`, { title: 'Again', requestId: h.rid() })).body.error.code).toBe('VALIDATION_ERROR');

    // Agents append corrections; people edit only their own notes.
    const mine = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_note_add`, { kind: 'comment', body: 'token sk_live_abc123 oops', requestId: h.rid() })).body.data;
    const editor = await h.session('user_editor', orgId, 'member');
    expect((await h.api(editor, 'POST', `/projects/${projectId}/notes/${mine.id}/edit`, { body: 'hijack', expectedVersion: 1, requestId: h.rid() })).body.error.code).toBe('FORBIDDEN');
    expect((await h.api(admin, 'POST', `/projects/${projectId}/notes/${mine.id}/edit`, { body: 'token sk_live_abc123 still here', expectedVersion: 1, requestId: h.rid() })).body.data.version).toBe(2);
    expect((await h.api(editor, 'POST', `/projects/${projectId}/notes/${mine.id}/redact`, { reason: 'secret', requestId: h.rid() })).body.error.code).toBe('FORBIDDEN');
    await h.api(admin, 'POST', `/projects/${projectId}/notes/${mine.id}/redact`, { reason: 'Contained a secret', requestId: h.rid() });

    const listed = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_note_list`, {})).body.data.items.find((n: any) => n.id === mine.id);
    expect(listed).toMatchObject({ body: '[redacted]', redacted: true });
    const revs = await h.svc.db.query<{ snapshot: unknown }>(`SELECT snapshot FROM revisions WHERE object_type = 'note' AND object_id = $1`, [mine.id]);
    expect(JSON.stringify(revs.rows)).not.toContain('sk_live_abc123');
    const exp = (await h.api(admin, 'POST', `/projects/${projectId}/export`, { complete: true })).body.data;
    expect(JSON.stringify(exp.complete)).not.toContain('sk_live_abc123');
    // A minimal redaction event remains.
    const act = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_activity_list`, { operation: 'note.redacted' })).body.data.items;
    expect(act).toHaveLength(1);
  });
});
