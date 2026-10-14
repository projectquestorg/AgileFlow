import { describe, expect, it } from 'vitest';
import { ALL_WRITE, BASE, harness, seeded } from './helpers';

describe('first slice: org, project, epic/story, authed agent, note, denial, export round trip', () => {
  it('runs the journey across dashboard, MCP, and the connected CLI', async () => {
    const h = await harness();
    const { admin, projectId, orgId } = await seeded(h);

    // Human creates an epic and a story in the dashboard (same tool registry).
    const epic = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_create`, { kind: 'epic', title: 'Checkout', requestId: h.rid() })).body;
    expect(epic.ok).toBe(true);
    expect(epic.data.id).toMatch(/^EPIC-[0-9A-HJKMNP-TV-Z]{8}$/);
    const story = (
      await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_create`, {
        kind: 'story',
        title: 'Pay with card',
        epic: epic.data.id,
        body: '## Acceptance Criteria\n\n- [ ] card accepted\n- [ ] receipt emailed\n',
        requestId: h.rid(),
      })
    ).body;
    expect(story.data.epic).toBe(epic.data.id);
    expect(story.data.criteria).toEqual({ total: 2, checked: 0 });
    expect(story.data.readiness.ready).toBe(true);

    // An agent connects with the default read-only grant through a real MCP client.
    const readOnly = await h.token({ userId: 'user_editor', orgId, resource: 'mcp' });
    const agent = await h.mcp(readOnly);
    const tools = await agent.client.listTools();
    expect(tools.tools).toHaveLength(22);
    const ctx = await agent.call('agileflow_context', {});
    expect(ctx.data.projects.map((p: any) => p.id)).toEqual([projectId]);
    const got = await agent.call('agileflow_work_get', { projectId, workId: story.data.id });
    expect(got.data.content.complete).toBe(true);
    expect(got.data.content.body).toContain('card accepted');

    // Read-only token: a write is refused at the HTTP boundary with insufficient_scope.
    const denied = await h.rawMcp(readOnly, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agileflow_note_add', arguments: { projectId, kind: 'progress', body: 'x', requestId: h.rid() } } });
    expect(denied.status).toBe(403);
    expect(denied.headers.get('www-authenticate')).toContain('error="insufficient_scope"');
    expect(denied.headers.get('www-authenticate')).toContain('agileflow:notes:write');
    expect(denied.headers.get('www-authenticate')).toContain(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`);

    // Explicit write step-up: the agent adds a note; the dashboard sees it with server-derived authorship.
    const writer = await h.mcp(await h.token({ userId: 'user_editor', orgId, resource: 'mcp', scopes: ALL_WRITE }));
    const note = await writer.call('agileflow_note_add', { projectId, workId: story.data.id, kind: 'progress', body: 'Started on the card form.', requestId: h.rid() });
    expect(note.ok).toBe(true);
    const notes = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_note_list`, { workId: story.data.id })).body;
    expect(notes.data.items).toHaveLength(1);
    expect(notes.data.items[0].author).toMatchObject({ kind: 'agent', userId: 'user_editor', name: 'Eddie Editor' });

    // Permission denial: the viewer cannot write through any surface, even with every scope.
    const viewerMcp = await h.mcp(await h.token({ userId: 'user_viewer', orgId, resource: 'mcp', scopes: ALL_WRITE }));
    const viewerWrite = await viewerMcp.call('agileflow_work_create', { projectId, kind: 'story', title: 'nope', requestId: h.rid() });
    expect(viewerWrite.ok).toBe(false);
    expect(viewerWrite.error.code).toBe('FORBIDDEN');
    const viewerSession = await h.session('user_viewer', orgId, 'member');
    const viewerDash = await h.api(viewerSession, 'POST', `/projects/${projectId}/tools/agileflow_work_create`, { kind: 'story', title: 'nope', requestId: h.rid() });
    expect(viewerDash.body.error.code).toBe('FORBIDDEN');

    // Round-trip export: native files import into a fresh project with IDs and relations preserved.
    const exported = (await h.api(admin, 'POST', `/projects/${projectId}/export`, { complete: true })).body.data;
    expect(exported.report.errors).toBe(0);
    const storyFile = Object.keys(exported.files).find((f) => f.startsWith('03-stories/'))!;
    expect(exported.files[storyFile]).toContain(`epic: ${epic.data.id}`);
    expect(exported.complete['agileflow-connected/notes.json']).toHaveLength(1);
    const target = (await h.api(admin, 'POST', '/projects', { name: 'Acme Copy' })).body.data;
    const preview = (await h.api(admin, 'POST', `/projects/${target.id}/import/preview`, { files: exported.files, operationKey: h.rid() })).body.data;
    expect(preview.preview.blocked).toBe(false);
    expect(preview.preview.counts).toMatchObject({ epics: 1, stories: 1 });
    const committed = (await h.api(admin, 'POST', `/projects/${target.id}/import/${preview.jobId}/commit`, { requestId: h.rid() })).body;
    expect(committed.data.created).toBe(2);
    const copy = (await h.api(admin, 'POST', `/projects/${target.id}/tools/agileflow_work_get`, { workId: story.data.id })).body.data;
    expect(copy.epic).toBe(epic.data.id);
    expect(copy.content.body).toBe(got.data.content.body);
    // Unchanged items now export their original bytes exactly.
    const again = (await h.api(admin, 'POST', `/projects/${target.id}/export`, {})).body.data;
    expect(again.files[storyFile]).toBe(exported.files[storyFile]);
    expect(again.report.fidelity[storyFile]).toBe('original');
  });
});

describe('token verification boundary', () => {
  it('rejects wrong audience, issuer, type, missing org, session tokens, and anonymous calls', async () => {
    const h = await harness();
    const { orgId } = await seeded(h);
    const list = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

    const anon = await h.rawMcp(null, list);
    expect(anon.status).toBe(401);
    expect(anon.headers.get('www-authenticate')).toContain('resource_metadata=');

    const cases: Array<[string, string]> = [
      ['cli audience at /mcp', await h.token({ userId: 'user_admin', orgId, resource: 'cli' })],
      ['local-control audience at /mcp', await h.token({ userId: 'user_admin', orgId, resource: 'local-control' })],
      ['missing audience', await h.token({ userId: 'user_admin', orgId, audience: 'https://other.example/mcp' })],
      ['wrong issuer', await h.token({ userId: 'user_admin', orgId, issuer: 'https://evil.example' })],
      ['wrong token type', await h.token({ userId: 'user_admin', orgId, typ: 'JWT' })],
      ['missing organization', await h.token({ userId: 'user_admin' })],
      ['expired', await h.token({ userId: 'user_admin', orgId, ttlSec: -120 })],
      ['session token', await h.session('user_admin', orgId)],
      ['tampered signature', (await h.token({ userId: 'user_admin', orgId })).replace(/.{4}$/, 'AAAA')],
    ];
    for (const [label, tok] of cases) {
      const r = await h.rawMcp(tok, list);
      expect(r.status, label).toBe(401);
      expect(r.headers.get('www-authenticate'), label).toContain('error="invalid_token"');
    }

    // An access token cannot open a dashboard session, and an invalid bearer never falls back to a cookie.
    const at = await h.token({ userId: 'user_admin', orgId, resource: 'mcp' });
    expect((await h.api(at, 'GET', '/me')).status).toBe(401);
    const good = await h.session('user_admin', orgId);
    const res = await h.fetchApp(`${BASE}/api/me`, { headers: { authorization: 'Bearer not-a-jwt', cookie: `__session=${good}` } });
    expect(res.status).toBe(401);
    const cookieOnly = await h.fetchApp(`${BASE}/api/me`, { headers: { cookie: `__session=${good}` } });
    expect(cookieOnly.status).toBe(200);
  });

  it('binds requests to the verified organization, never a tool argument', async () => {
    const h = await harness();
    const a = await seeded(h, 'org_a');
    h.member('org_b', 'user_admin', 'admin');
    const tokenB = await h.token({ userId: 'user_admin', orgId: 'org_b', resource: 'mcp' });
    const agent = await h.mcp(tokenB);
    const r = await agent.call('agileflow_work_list', { projectId: a.projectId });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('NOT_FOUND');
    // A per-tab session for org B cannot read org A's project either.
    const sessionB = await h.session('user_admin', 'org_b');
    expect((await h.api(sessionB, 'POST', `/projects/${a.projectId}/tools/agileflow_work_list`, {})).body.error.code).toBe('NOT_FOUND');
  });

  it('publishes protected-resource metadata with the minimum default scopes', async () => {
    const h = await harness();
    for (const kind of ['mcp', 'cli', 'local-control']) {
      const meta = (await (await h.fetchApp(`${BASE}/.well-known/oauth-protected-resource/${kind}`)).json()) as any;
      expect(meta.resource).toBe(`${BASE}/${kind}`);
      expect(meta.authorization_servers).toEqual([`${BASE}/dev`]);
      // Clients may request everything in scopes_supported (observed with Claude Code), so only the minimum is listed.
      expect(meta.scopes_supported).toEqual(kind === 'local-control' ? ['user:org:read', 'agileflow:local:observe'] : ['user:org:read', 'agileflow:read']);
    }
    expect((await h.fetchApp(`${BASE}/.well-known/oauth-authorization-server/dev`)).status).toBe(200);
    const disc = (await (await h.fetchApp(`${BASE}/.well-known/agileflow.json`)).json()) as any;
    expect(disc.defaultScopes.mcp).toEqual(['user:org:read', 'agileflow:read']);
  });
});
