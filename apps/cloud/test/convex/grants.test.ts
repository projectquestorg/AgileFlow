// @vitest-environment edge-runtime
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientAllowed } from '../../convex/lib/core';
import { seeded, setup } from './helpers';

/**
 * Clerk compatibility (AGILEFLOW_CAPABILITY_SOURCE=grants): Clerk cannot issue custom OAuth scopes,
 * so token clients get capabilities only from per-connection grants a person makes in the dashboard.
 */
const CLERK_SCOPES = ['user:org:read', 'offline_access'];

describe('capability grants (Clerk mode)', () => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.AGILEFLOW_CAPABILITY_SOURCE;
    process.env.AGILEFLOW_CAPABILITY_SOURCE = 'grants';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.AGILEFLOW_CAPABILITY_SOURCE;
    else process.env.AGILEFLOW_CAPABILITY_SOURCE = previous;
  });

  async function connectionOf(h: ReturnType<typeof setup>, session: any, clientId: string) {
    const list = h.data(await h.op(session, 'admin.connections', {}));
    return list.find((c: any) => c.clientId === clientId);
  }

  it('starts every new connection read-only, including an organization admin’s', async () => {
    const h = setup();
    const { admin, projectId, orgId } = await seeded(h);
    const adminAgent = h.token('user_admin', orgId, { scopes: CLERK_SCOPES, clientId: 'dcr_admin_agent' });
    expect(h.code(await h.op(adminAgent, 'agileflow_work_list', { projectId }))).toBe('OK');
    const denied = await h.op(adminAgent, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() });
    expect(denied.error).toMatchObject({ code: 'CAPABILITY_REQUIRED', capability: 'work:write' });
    expect(denied.error.connectionId).toMatch(/^conn_/);
    const conn = await connectionOf(h, admin, 'dcr_admin_agent');
    expect(conn).toMatchObject({ grants: [], capabilitySource: 'grants', endpoint: 'mcp' });
    expect(conn.grantable).toEqual(['notes:write', 'work:write', 'runs:write', 'controls:request']);
  });

  it('lets only the connection’s own user grant; admins can revoke but never grant; revocation is immediate', async () => {
    const h = setup();
    const { admin, projectId, orgId } = await seeded(h);
    const editorAgent = h.token('user_editor', orgId, { scopes: CLERK_SCOPES, clientId: 'dcr_editor_agent' });
    await h.op(editorAgent, 'agileflow_context', {});
    const editorSession = h.session('user_editor', orgId, 'member');
    const conn = await connectionOf(h, editorSession, 'dcr_editor_agent');

    // Organization admin cannot grant on someone else's connection.
    expect(h.code(await h.op(admin, 'admin.setConnectionGrants', { connectionId: conn.id, capabilities: ['work:write'] }))).toBe('FORBIDDEN');
    // A token client cannot grant itself anything.
    expect(h.code(await h.op(editorAgent, 'admin.setConnectionGrants', { connectionId: conn.id, capabilities: ['work:write'] }))).not.toBe('OK');
    // The owner grants; the write now works.
    const granted = h.data(await h.op(editorSession, 'admin.setConnectionGrants', { connectionId: conn.id, capabilities: ['work:write', 'notes:write'] }));
    expect(granted.grants.map((g: any) => g.capability).sort()).toEqual(['notes:write', 'work:write']);
    expect(granted.grants[0].grantedBy).toBe('user_editor');
    expect(h.code(await h.op(editorAgent, 'agileflow_work_create', { projectId, kind: 'story', title: 'ok', requestId: h.rid() }))).toBe('OK');
    // Not granted: runs.
    expect((await h.op(editorAgent, 'agileflow_run_start', { projectId, name: 'r', intent: 'i', requestId: h.rid() })).error.code).toBe('CAPABILITY_REQUIRED');
    // Admin revokes; the next request fails.
    expect(h.code(await h.op(admin, 'admin.setConnectionGrants', { connectionId: conn.id, capabilities: ['notes:write'] }))).toBe('OK');
    expect((await h.op(editorAgent, 'agileflow_work_create', { projectId, kind: 'story', title: 'no', requestId: h.rid() })).error.code).toBe('CAPABILITY_REQUIRED');
    expect(h.code(await h.op(editorAgent, 'agileflow_note_add', { projectId, kind: 'comment', body: 'still allowed', requestId: h.rid() }))).toBe('OK');
  });

  it('never lets a grant exceed the user’s project role', async () => {
    const h = setup();
    const { projectId, orgId } = await seeded(h);
    const viewerAgent = h.token('user_viewer', orgId, { scopes: CLERK_SCOPES, clientId: 'dcr_viewer_agent' });
    await h.op(viewerAgent, 'agileflow_context', {});
    const viewer = h.session('user_viewer', orgId, 'member');
    const conn = await connectionOf(h, viewer, 'dcr_viewer_agent');
    expect(h.code(await h.op(viewer, 'admin.setConnectionGrants', { connectionId: conn.id, capabilities: ['work:write'] }))).toBe('OK');
    expect(h.code(await h.op(viewerAgent, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('FORBIDDEN');
  });

  it('rejects capabilities that do not belong to the endpoint, and tokens without the organization scope', async () => {
    const h = setup();
    const { projectId, orgId } = await seeded(h);
    const cli = h.token('user_editor', orgId, { resource: 'cli', scopes: CLERK_SCOPES, clientId: 'cli_first_party' });
    await h.op(cli, 'agileflow_context', {});
    const editor = h.session('user_editor', orgId, 'member');
    const conn = await connectionOf(h, editor, 'cli_first_party');
    expect(h.code(await h.op(editor, 'admin.setConnectionGrants', { connectionId: conn.id, capabilities: ['local:apply'] }))).toBe('VALIDATION_ERROR');
    const noOrgScope = h.token('user_editor', orgId, { scopes: ['offline_access'], clientId: 'cli_first_party', resource: 'cli' });
    expect(h.code(await h.op(noOrgScope, 'agileflow_work_list', { projectId }))).toBe('SCOPE');
  });

  it('gives a local-control connection observe by default and apply only after a grant', async () => {
    const h = setup();
    const { projectId, orgId } = await seeded(h);
    const lc = h.token('user_admin', orgId, { resource: 'local-control', scopes: CLERK_SCOPES, clientId: 'companion_first_party' });
    expect(h.code(await h.op(lc, 'agileflow_settings_get', { projectId }))).toBe('OK');
    expect(h.code(await h.op(lc, 'controls.begin', { projectId, credential: 'x', operationId: 'cop_x', planHash: 'h' }))).toBe('CAPABILITY_REQUIRED');
  });
});

describe('endpoint/client binding', () => {
  const ids = { cliClientId: 'cli_1', companionClientId: 'cmp_1' };
  it('accepts each first-party client only at its own endpoint', () => {
    expect(clientAllowed('cli', 'cli_1', { ...ids, status: 'unknown' })).toBe(true);
    expect(clientAllowed('cli', 'cmp_1', { ...ids, status: 'unknown' })).toBe(false);
    expect(clientAllowed('local-control', 'cmp_1', { ...ids, status: 'unknown' })).toBe(true);
    expect(clientAllowed('local-control', 'cli_1', { ...ids, status: 'unknown' })).toBe(false);
  });
  it('accepts only provider-registered dynamic clients at /mcp, never first-party or unknown ones', () => {
    expect(clientAllowed('mcp', 'dcr_x', { ...ids, status: 'dynamic' })).toBe(true);
    expect(clientAllowed('mcp', 'other_app', { ...ids, status: 'first_party' })).toBe(false);
    expect(clientAllowed('mcp', 'gone', { ...ids, status: 'unknown' })).toBe(false);
    expect(clientAllowed('mcp', 'cli_1', { ...ids, status: 'dynamic' })).toBe(false);
  });
  it('fails closed when a first-party client ID is not configured', () => {
    expect(clientAllowed('cli', 'cli_1', { status: 'unknown' })).toBe(false);
    expect(clientAllowed('local-control', '', { ...ids, status: 'unknown' })).toBe(false);
  });
});

describe('default scope mode is unchanged', () => {
  it('still uses token scopes when AGILEFLOW_CAPABILITY_SOURCE is not set', async () => {
    const h = setup();
    const { projectId, orgId } = await seeded(h);
    const readOnly = h.token('user_editor', orgId);
    expect(h.code(await h.op(readOnly, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('SCOPE');
  });
});
