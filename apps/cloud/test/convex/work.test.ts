// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest';
import { setup } from './helpers';

/** Seed a workspace + project directly (independent of the admin port). */
async function project(h: ReturnType<typeof setup>, orgId = 'org_w') {
  await h.member(orgId, 'u_admin', 'admin');
  await h.member(orgId, 'u_editor', 'member');
  await h.member(orgId, 'u_viewer', 'member');
  const admin = h.session('u_admin', orgId, 'admin');
  // First op records the workspace mirror.
  await h.op(admin, 'agileflow_work_list', { projectId: 'none' });
  const pid = 'prj_test1';
  await h.t.run(async (ctx) => {
    const ws = (await ctx.db.query('workspaces').withIndex('by_org', (q) => q.eq('clerkOrgId', orgId)).unique())!;
    const now = Date.now();
    await ctx.db.insert('projects', { publicId: pid, workspaceId: ws.publicId, name: 'W', slug: 'w', authorityMode: 'connected', nativeSchema: 1, clientWritesPaused: false, policyRevision: 1, activitySeq: 0, createdAt: now, updatedAt: now });
    await ctx.db.insert('projectGrants', { workspaceId: ws.publicId, projectId: pid, userId: 'u_editor', role: 'editor', status: 'active', updatedAt: now });
    await ctx.db.insert('projectGrants', { workspaceId: ws.publicId, projectId: pid, userId: 'u_viewer', role: 'viewer', status: 'active', updatedAt: now });
  });
  return { admin, pid, orgId };
}

const WRITE = ['user:org:read', 'agileflow:read', 'agileflow:work:write', 'agileflow:notes:write', 'agileflow:runs:write', 'agileflow:controls:request'];

describe('Convex work domain', () => {
  it('creates, reads, and lists work with native IDs, relations, readiness, and criteria', async () => {
    const h = setup();
    const { admin, pid } = await project(h);
    const epic = h.data(await h.op(admin, 'agileflow_work_create', { projectId: pid, kind: 'epic', title: 'Checkout', requestId: h.rid() }));
    expect(epic.id).toMatch(/^EPIC-[0-9A-HJKMNP-TV-Z]{8}$/);
    const story = h.data(
      await h.op(admin, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'Pay', epic: epic.id, body: '## Acceptance Criteria\n\n- [ ] a\n- [x] b\n', requestId: h.rid() }),
    );
    expect(story).toMatchObject({ epic: epic.id, criteria: { total: 2, checked: 1 }, readiness: { ready: true } });
    const got = h.data(await h.op(admin, 'agileflow_work_get', { projectId: pid, workId: story.id }));
    expect(got.content).toMatchObject({ complete: true });
    expect(got.content.body).toContain('- [x] b');
    const list = h.data(await h.op(admin, 'agileflow_work_list', { projectId: pid, type: 'story' }));
    expect(list.items.map((i: any) => i.id)).toEqual([story.id]);
    const board = h.data(await h.op(admin, 'agileflow_board_get', { projectId: pid }));
    expect(board.columns.backlog.items).toHaveLength(1);
    expect(board.epics[0].progress).toMatchObject({ total: 1, open: 1 });
  });

  it('enforces viewer, scope, pause, idempotency, versions, and relationship rules', async () => {
    const h = setup();
    const { admin, pid, orgId } = await project(h);
    const viewer = h.token('u_viewer', orgId, { scopes: WRITE });
    expect(h.code(await h.op(viewer, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('FORBIDDEN');
    const readOnly = h.token('u_editor', orgId);
    expect(h.code(await h.op(readOnly, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('SCOPE');

    const editor = h.token('u_editor', orgId, { scopes: WRITE });
    const requestId = h.rid();
    const a = await h.op(editor, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'A', requestId });
    const again = await h.op(editor, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'A', requestId });
    expect(again.value.replayed).toBe(true);
    expect(again.value.data.id).toBe(a.value.data.id);
    expect(h.code(await h.op(editor, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'B', requestId }))).toBe('IDEMPOTENCY_CONFLICT');

    const A = a.value.data.id;
    const B = h.data(await h.op(editor, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'B', dependsOn: [A], requestId: h.rid() })).id;
    expect(h.code(await h.op(editor, 'agileflow_work_update', { projectId: pid, workId: A, expectedVersion: 1, patch: { dependsOn: [B] }, requestId: h.rid() }))).toBe('DEPENDENCY_INVALID');
    expect(h.code(await h.op(editor, 'agileflow_work_update', { projectId: pid, workId: A, expectedVersion: 1, patch: { dependsOn: [A] }, requestId: h.rid() }))).toBe('DEPENDENCY_INVALID');
    expect(h.data(await h.op(editor, 'agileflow_work_update', { projectId: pid, workId: A, expectedVersion: 1, patch: { title: 'A2' }, requestId: h.rid() })).version).toBe(2);
    const stale = await h.op(editor, 'agileflow_work_update', { projectId: pid, workId: A, expectedVersion: 1, patch: { title: 'lost' }, requestId: h.rid() });
    expect(stale.error).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 2 });
    // A failed write leaves no trace (transaction rolled back): title unchanged, no extra activity.
    expect(h.data(await h.op(admin, 'agileflow_work_get', { projectId: pid, workId: A })).title).toBe('A2');

    // Cancelled dependency does not count as done.
    await h.op(editor, 'agileflow_work_transition', { projectId: pid, workId: A, expectedVersion: 2, targetStatus: 'cancelled', requestId: h.rid() });
    expect(h.data(await h.op(admin, 'agileflow_work_get', { projectId: pid, workId: B })).readiness).toMatchObject({ ready: false, waitingOn: [A] });

    // Pause blocks token work writes, not browser edits.
    await h.t.run(async (ctx) => {
      const p = (await ctx.db.query('projects').withIndex('by_public', (q) => q.eq('publicId', pid)).unique())!;
      await ctx.db.patch(p._id, { clientWritesPaused: true });
    });
    expect(h.code(await h.op(editor, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('CLIENT_WRITES_PAUSED');
    expect(h.code(await h.op(admin, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('OK');
  });

  it('isolates organizations and requires fresh membership for writes', async () => {
    const h = setup();
    const { pid } = await project(h, 'org_a');
    await h.member('org_b', 'u_admin', 'admin');
    const other = h.token('u_admin', 'org_b', { scopes: WRITE });
    expect(h.code(await h.op(other, 'agileflow_work_list', { projectId: pid }))).toBe('NOT_FOUND');
    // Removed upstream: the next write fails closed.
    await h.member('org_a', 'u_editor', null);
    const editor = h.token('u_editor', 'org_a', { scopes: WRITE });
    expect(h.code(await h.op(editor, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('FORBIDDEN');
  });

  it('chunks large bodies on UTF-8 boundaries bound to version and principal', async () => {
    const h = setup();
    const { admin, pid, orgId } = await project(h);
    const body = `${'é'.repeat(40_000)}${'x'.repeat(30_000)}\u{1F600}end`;
    const s = h.data(await h.op(admin, 'agileflow_work_create', { projectId: pid, kind: 'story', title: 'Big', body, requestId: h.rid() }));
    let page = h.data(await h.op(admin, 'agileflow_work_get', { projectId: pid, workId: s.id }));
    expect(page.content.complete).toBe(false);
    let all = page.content.body;
    const first = page.content.contentCursor;
    while (page.content.contentCursor) {
      page = h.data(await h.op(admin, 'agileflow_work_get', { projectId: pid, workId: s.id, contentCursor: page.content.contentCursor }));
      all += page.content.body;
    }
    expect(all).toBe(body);
    expect(h.code(await h.op(h.token('u_admin', orgId), 'agileflow_work_get', { projectId: pid, workId: s.id, contentCursor: first }))).toBe('VALIDATION_ERROR');
  });
});
