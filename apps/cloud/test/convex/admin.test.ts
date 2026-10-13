// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { internal } from '../../convex/_generated/api';
import { verifySvix } from '../../convex/lib/svix';
import { seeded, setup } from './helpers';

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

describe('Convex admin domain', () => {
  it('creates projects with documents and activity, lists context, and returns needsOrganization without an org', async () => {
    const h = setup();
    const { admin, projectId, orgId } = await seeded(h);
    const me = h.data(await h.op(admin, 'admin.me'));
    expect(me.workspace.orgId).toBe(orgId);
    expect(me.projects).toMatchObject([{ id: projectId, name: 'Acme App', slug: 'acme-app', role: 'admin' }]);
    expect(me.deletedProjects).toEqual([]);
    expect(h.data(await h.op(admin, 'admin.latestSeq', { projectId })).latestSeq).toBeGreaterThanOrEqual(1);
    const doc = h.data(await h.op(admin, 'agileflow_document_get', { projectId, document: 'product' }));
    expect(doc.version).toBe(1);
    // Slugs are unique per workspace.
    expect(h.data(await h.op(admin, 'admin.createProject', { name: 'Acme App' })).slug).toBe('acme-app-2');
    expect(h.code(await h.op(admin, 'admin.createProject', { name: '  ' }))).toBe('VALIDATION_ERROR');
    // Members cannot create projects; tokens cannot either.
    expect(h.code(await h.op(h.session('user_editor', orgId, 'member'), 'admin.createProject', { name: 'X' }))).toBe('FORBIDDEN');
    expect(h.code(await h.op(h.token('user_admin', orgId), 'admin.createProject', { name: 'X' }, { write: true }))).toBe('FORBIDDEN');

    const noOrg = h.data(await h.op(h.session('user_admin', null), 'admin.me'));
    expect(noOrg).toMatchObject({ needsOrganization: true, workspace: null, projects: [] });
  });

  it('scopes context to grants and connection policy; agileflow_context warns on ambiguity', async () => {
    const h = setup();
    const { admin, projectId, orgId } = await seeded(h);
    const other = h.data(await h.op(admin, 'admin.createProject', { name: 'Beta' }));
    const editorTok = h.token('user_editor', orgId);
    const ctx = h.data(await h.op(editorTok, 'agileflow_context', {}));
    expect(ctx.projects.map((p: any) => p.id)).toEqual([projectId]);
    expect(ctx.projects[0].role).toBe('editor');
    expect(ctx.scopes).toEqual(['agileflow:read', 'user:org:read']);
    expect(ctx.statuses.story).toContain('in-review');
    const adminTok = h.token('user_admin', orgId);
    const actx = await h.op(adminTok, 'agileflow_context', {});
    expect(actx.value.warnings[0].code).toBe('PROJECT_AMBIGUOUS');
    expect(actx.value.data.projects.every((p: any) => p.role === 'editor')).toBe(true);
    expect(h.code(await h.op(editorTok, 'agileflow_context', { projectId: other.id }))).toBe('NOT_FOUND');

    // Restricting the admin's connection hides other projects.
    const conns = h.data(await h.op(admin, 'admin.connections'));
    const conn = conns.find((c: any) => c.userId === 'user_admin');
    expect(conn).toBeTruthy();
    await h.op(admin, 'admin.updateConnection', { connectionId: conn.id, allowedProjects: [other.id] });
    expect(h.data(await h.op(adminTok, 'admin.context')).projects.map((p: any) => p.id)).toEqual([other.id]);
    expect(h.code(await h.op(admin, 'admin.updateConnection', { connectionId: conn.id, allowedProjects: ['prj_nope'] }))).toBe('VALIDATION_ERROR');
    // A member cannot manage someone else's connection.
    expect(h.code(await h.op(h.session('user_editor', orgId, 'member'), 'admin.updateConnection', { connectionId: conn.id, disabled: true }))).toBe('NOT_FOUND');
    await h.op(admin, 'admin.updateConnection', { connectionId: conn.id, disabled: true });
    expect(h.code(await h.op(adminTok, 'admin.context'))).toBe('CONNECTION_DISABLED');
  });

  it('manages grants against current members only, and revoking ends access', async () => {
    const h = setup();
    const { admin, projectId, orgId } = await seeded(h);
    const members = h.data(await h.op(admin, 'admin.members', { projectId }));
    expect(members.items.map((m: any) => [m.userId, m.projectRole])).toEqual([
      ['user_admin', 'admin'],
      ['user_editor', 'editor'],
      ['user_viewer', 'viewer'],
    ]);
    expect(h.code(await h.op(admin, 'admin.setGrant', { projectId, userId: 'user_stranger', role: 'editor', requestId: h.rid() }))).toBe('VALIDATION_ERROR');
    expect(h.code(await h.op(admin, 'admin.setGrant', { projectId, userId: 'user_editor', role: 'owner', requestId: h.rid() }))).toBe('VALIDATION_ERROR');
    const editor = h.session('user_editor', orgId, 'member');
    expect(h.code(await h.op(editor, 'admin.members', { projectId }))).toBe('FORBIDDEN');
    await h.op(admin, 'admin.setGrant', { projectId, userId: 'user_editor', role: null, requestId: h.rid() });
    expect(h.code(await h.op(editor, 'agileflow_work_list', { projectId }))).toBe('NOT_FOUND');

    // Policy and pause.
    expect(h.data(await h.op(admin, 'admin.setWorkspacePolicy', { requireStartApproval: true }))).toEqual({ requireStartApproval: true });
    expect(h.code(await h.op(editor, 'admin.setWorkspacePolicy', { requireStartApproval: false }))).toBe('FORBIDDEN');
    const paused = h.data(await h.op(admin, 'admin.updateProject', { projectId, clientWritesPaused: true, name: 'Acme Two', requestId: h.rid() }));
    expect(paused).toMatchObject({ name: 'Acme Two', clientWritesPaused: true });
    const viewerTok = h.token('user_viewer', orgId, { scopes: ['user:org:read', 'agileflow:read', 'agileflow:work:write'] });
    await h.op(admin, 'admin.setGrant', { projectId, userId: 'user_viewer', role: 'editor', requestId: h.rid() });
    expect(h.code(await h.op(viewerTok, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('CLIENT_WRITES_PAUSED');
  });

  it('archive is read-only; deletion removes access, restore returns it, purge removes data after 30 days', async () => {
    const h = setup();
    const { admin, projectId, orgId } = await seeded(h);
    await h.op(admin, 'agileflow_work_create', { projectId, kind: 'story', title: 'Keep me', requestId: h.rid() });
    await h.op(admin, 'admin.archiveProject', { projectId, archived: true, requestId: h.rid() });
    expect(h.code(await h.op(admin, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('PROJECT_ARCHIVED');
    expect(h.data(await h.op(admin, 'agileflow_work_list', { projectId })).items).toHaveLength(1);
    await h.op(admin, 'admin.archiveProject', { projectId, archived: false, requestId: h.rid() });

    expect(h.code(await h.op(admin, 'admin.requestDeletion', { projectId, confirmName: 'wrong', requestId: h.rid() }))).toBe('VALIDATION_ERROR');
    const del = h.data(await h.op(admin, 'admin.requestDeletion', { projectId, confirmName: 'Acme App', requestId: h.rid() }));
    expect(new Date(del.purgeAfter).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    const agent = h.token('user_editor', orgId);
    expect(h.code(await h.op(agent, 'agileflow_work_list', { projectId }))).toBe('NOT_FOUND');
    const me = h.data(await h.op(admin, 'admin.me'));
    expect(me.projects).toHaveLength(0);
    expect(me.deletedProjects.map((p: any) => p.id)).toEqual([projectId]);

    await h.op(admin, 'admin.restoreDeleted', { projectId });
    expect(h.data(await h.op(agent, 'agileflow_work_list', { projectId })).items).toHaveLength(1);

    await h.op(admin, 'admin.requestDeletion', { projectId, confirmName: 'Acme App', requestId: h.rid() });
    expect((await h.t.mutation(internal.domain.admin.purgeExpired, {})).purged).toBe(0);
    expect((await h.t.mutation(internal.domain.admin.purgeExpired, { now: Date.now() + 31 * 86400_000 })).purged).toBe(1);
    const left = await h.t.run(async (ctx) => {
      const items = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', projectId)).collect();
      const events = await ctx.db.query('activity').withIndex('by_project_seq', (q) => q.eq('projectId', projectId)).collect();
      const prj = await ctx.db.query('projects').withIndex('by_public', (q) => q.eq('publicId', projectId)).unique();
      return items.length + events.length + (prj ? 1 : 0);
    });
    expect(left).toBe(0);
  });

  it('cleans up expired idempotency receipts', async () => {
    const h = setup();
    await h.t.run(async (ctx) => {
      await ctx.db.insert('idempotency', { principalKey: 'u', projectId: 'p', operation: 'o', requestKey: 'k', requestDigest: 'd', result: null, expiresAt: Date.now() - 1 });
    });
    expect((await h.t.mutation(internal.domain.admin.cleanupExpired, {})).receipts).toBe(1);
  });
});

describe('Clerk webhooks (Convex)', () => {
  it('verifies Svix signatures as a pure function', () => {
    const key = new Uint8Array(24).map((_, i) => i * 7);
    const secret = `whsec_${b64(key)}`;
    const body = '{"type":"x"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = b64(hmac(sha256, key, utf8ToBytes(`evt_1.${ts}.${body}`)));
    expect(verifySvix(secret, { id: 'evt_1', timestamp: ts, signature: `v1,${sig}` }, body)).toBe(true);
    expect(verifySvix(secret, { id: 'evt_1', timestamp: ts, signature: `v0,x v1,${sig}` }, body)).toBe(true);
    expect(verifySvix(secret, { id: 'evt_1', timestamp: ts, signature: 'v1,AAAA' }, body)).toBe(false);
    expect(verifySvix(secret, { id: 'evt_1', timestamp: ts, signature: `v1,${sig}` }, body + ' ')).toBe(false);
    expect(verifySvix(secret, { id: 'evt_1', timestamp: String(Number(ts) - 600), signature: `v1,${sig}` }, body)).toBe(false);
  });

  it('deduplicates, ignores stale membership events, and never grants project roles', async () => {
    const h = setup();
    const { orgId, projectId } = await seeded(h);
    const send = (id: string, event: unknown) => h.t.mutation(internal.webhooks.applyClerkEvent, { eventId: id, raw: JSON.stringify(event) });
    const removed = { type: 'organizationMembership.deleted', data: { organization: { id: orgId }, public_user_data: { user_id: 'user_editor' }, role: 'org:member', updated_at: 2000 } };
    expect((await send('evt_1', removed)).status).toBe('processed');
    expect((await send('evt_1', removed)).status).toBe('duplicate');
    await send('evt_0', { type: 'organizationMembership.created', data: { organization: { id: orgId }, public_user_data: { user_id: 'user_editor' }, role: 'org:member', updated_at: 1000 } });
    const status = await h.t.run(async (ctx) => {
      const ws = (await ctx.db.query('workspaces').withIndex('by_org', (q) => q.eq('clerkOrgId', orgId)).unique())!;
      return (await ctx.db.query('memberships').withIndex('by_ws_user', (q) => q.eq('workspaceId', ws.publicId).eq('userId', 'user_editor')).unique())?.status;
    });
    expect(status).toBe('removed');
    // The next request re-verifies upstream (still a member there).
    expect(h.code(await h.op(h.token('user_editor', orgId), 'agileflow_work_list', { projectId }))).toBe('OK');
    // A member created by webhook has no project grant.
    await send('evt_2', { type: 'organizationMembership.created', data: { organization: { id: orgId }, public_user_data: { user_id: 'user_new' }, role: 'org:member', updated_at: 3000 } });
    await h.member(orgId, 'user_new', 'member');
    expect(h.code(await h.op(h.token('user_new', orgId), 'agileflow_work_list', { projectId }))).toBe('NOT_FOUND');
    expect((await send('evt_3', { type: 'email.created', data: {} })).status).toBe('ignored');

    await send('evt_4', { type: 'user.deleted', data: { id: 'user_editor' } });
    const user = await h.t.run(async (ctx) => ctx.db.query('users').withIndex('by_user', (q) => q.eq('clerkUserId', 'user_editor')).unique());
    expect(user).toMatchObject({ status: 'deleted', displayName: 'Deleted user' });

    await send('evt_5', { type: 'organization.deleted', data: { id: orgId } });
    const prj = await h.t.run(async (ctx) => ctx.db.query('projects').withIndex('by_public', (q) => q.eq('publicId', projectId)).unique());
    expect(prj?.deletionRequestedAt).toBeTypeOf('number');
  });
});
