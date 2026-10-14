import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ALL_WRITE, BASE, harness, seeded } from './helpers';

async function setup() {
  const h = await harness();
  const s = await seeded(h);
  const mk = async (body: Record<string, unknown>) => (await h.api(s.admin, 'POST', `/projects/${s.projectId}/tools/agileflow_work_create`, { requestId: h.rid(), ...body })).body.data;
  return { h, ...s, mk };
}

describe('concurrency, idempotency, and versions', () => {
  it('replays a retried mutation and refuses a reused key with different content', async () => {
    const { h, admin, projectId } = await setup();
    const requestId = h.rid();
    const a = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_create`, { kind: 'story', title: 'Once', requestId })).body;
    const b = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_create`, { kind: 'story', title: 'Once', requestId })).body;
    expect(b.replayed).toBe(true);
    expect(b.data.id).toBe(a.data.id);
    const list = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_list`, { type: 'story' })).body;
    expect(list.data.items).toHaveLength(1);
    const c = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_create`, { kind: 'story', title: 'Different', requestId })).body;
    expect(c.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects stale edits with the current version and requires the prior body hash', async () => {
    const { h, admin, projectId, mk } = await setup();
    const story = await mk({ kind: 'story', title: 'Edit me' });
    const ok = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId: story.id, expectedVersion: 1, patch: { title: 'Edited' }, requestId: h.rid() })).body;
    expect(ok.data.version).toBe(2);
    const stale = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId: story.id, expectedVersion: 1, patch: { title: 'Lost update' }, requestId: h.rid() })).body;
    expect(stale.error).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 2, retryable: true });
    const noHash = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId: story.id, expectedVersion: 2, patch: { body: 'new' }, requestId: h.rid() })).body;
    expect(noHash.error.code).toBe('CONTENT_INCOMPLETE');
    const status = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId: story.id, expectedVersion: 2, patch: { status: 'done' }, requestId: h.rid() })).body;
    expect(status.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates relationships: self, missing, wrong type, and new cycles', async () => {
    const { h, admin, projectId, mk } = await setup();
    const a = await mk({ kind: 'story', title: 'A' });
    const b = await mk({ kind: 'story', title: 'B', dependsOn: [a.id] });
    const epic = await mk({ kind: 'epic', title: 'E' });
    const upd = (workId: string, version: number, patch: unknown) => h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId, expectedVersion: version, patch, requestId: h.rid() });
    expect((await upd(a.id, 1, { dependsOn: [a.id] })).body.error.code).toBe('DEPENDENCY_INVALID');
    expect((await upd(a.id, 1, { dependsOn: ['STORY-ZZZZZZZZ'] })).body.error.code).toBe('DEPENDENCY_INVALID');
    expect((await upd(a.id, 1, { dependsOn: [epic.id] })).body.error.code).toBe('DEPENDENCY_INVALID');
    const cyc = (await upd(a.id, 1, { dependsOn: [b.id] })).body;
    expect(cyc.error.code).toBe('DEPENDENCY_INVALID');
    expect(cyc.error.message).toContain('cycle');
    // Readiness: cancelled dependency does not count as done.
    expect((await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: b.id })).body.data.readiness.ready).toBe(false);
    await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_transition`, { workId: a.id, expectedVersion: 1, targetStatus: 'cancelled', requestId: h.rid() });
    const bb = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: b.id })).body.data;
    expect(bb.readiness).toMatchObject({ ready: false, waitingOn: [a.id] });
  });

  it('keeps native lifecycle warnings and requires an approved override to finish an epic with open stories', async () => {
    const { h, admin, projectId, orgId, mk } = await setup();
    await h.api(admin, 'PUT', '/workspace/policy', { allowLifecycleOverride: true });
    const epic = await mk({ kind: 'epic', title: 'Big', status: 'active' });
    await mk({ kind: 'story', title: 'Open child', epic: epic.id });
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE }));
    const blocked = await agent.call('agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 1, targetStatus: 'done', requestId: h.rid() });
    expect(blocked.error.code).toBe('OVERRIDE_REQUIRED');
    const noApproval = await agent.call('agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 1, targetStatus: 'done', override: true, requestId: h.rid() });
    expect(noApproval.error.code).toBe('APPROVAL_REQUIRED');
    const req = await agent.call('agileflow_control_request', { projectId, kind: 'lifecycle_override', proposal: { workId: epic.id, expectedVersion: 1, targetStatus: 'done' }, reason: 'Remaining story moves to the next epic', requestId: h.rid() });
    expect(req.data.state).toBe('pending');
    expect(req.data.reviewUrl).toContain(`/approvals/${req.data.approvalId}`);
    const early = await agent.call('agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 1, targetStatus: 'done', override: true, overrideApprovalId: req.data.approvalId, requestId: h.rid() });
    expect(early.error.code).toBe('APPROVAL_REQUIRED');
    // The editor's own session cannot decide an override; an admin can.
    const editorSession = await h.session('user_editor', orgId, 'member');
    expect((await h.api(editorSession, 'POST', `/projects/${projectId}/approvals/${req.data.approvalId}/decide`, { decision: 'approve', requestId: h.rid() })).body.error.code).toBe('FORBIDDEN');
    expect((await h.api(admin, 'POST', `/projects/${projectId}/approvals/${req.data.approvalId}/decide`, { decision: 'approve', requestId: h.rid() })).body.data.state).toBe('approved');
    const done = await agent.call('agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 1, targetStatus: 'done', override: true, overrideApprovalId: req.data.approvalId, requestId: h.rid() });
    expect(done.ok).toBe(true);
    expect(done.warnings.map((w: any) => w.code)).toContain('LIFECYCLE_OVERRIDE');
    // Single use.
    const reuse = await agent.call('agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 2, targetStatus: 'active', requestId: h.rid() });
    expect(reuse.ok).toBe(true);
    const again = await agent.call('agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 3, targetStatus: 'done', override: true, overrideApprovalId: req.data.approvalId, requestId: h.rid() });
    expect(again.error.code).toBe('APPROVAL_REQUIRED');
    // Export keeps the native validation error rather than relabeling it.
    const exp = (await h.api(admin, 'POST', `/projects/${projectId}/export`, {})).body.data;
    expect(exp.report.errors).toBe(0);
  });
});

describe('runs, claims, and cooperative cancellation', () => {
  it('lets one claimant win, releases on finish, and never marks the story done', async () => {
    const { h, admin, projectId, orgId, mk } = await setup();
    h.member(orgId, 'user_editor2', 'member');
    await h.api(admin, 'PUT', `/projects/${projectId}/grants/user_editor2`, { role: 'editor', requestId: h.rid() });
    const story = await mk({ kind: 'story', title: 'Contended', body: '## Acceptance Criteria\n\n- [ ] works\n' });
    const a1 = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE, clientId: 'agent-one' }));
    const a2 = await h.mcp(await h.token({ userId: 'user_editor2', orgId, scopes: ALL_WRITE, clientId: 'agent-two' }));
    const r1 = (await a1.call('agileflow_run_start', { projectId, workIds: [story.id], name: 'one', intent: 'implement', requestId: h.rid() })).data;
    const r2 = (await a2.call('agileflow_run_start', { projectId, workIds: [story.id], name: 'two', intent: 'implement', requestId: h.rid() })).data;
    const [c1, c2] = await Promise.all([
      a1.call('agileflow_claim_acquire', { projectId, storyId: story.id, runId: r1.id, requestId: h.rid() }),
      a2.call('agileflow_claim_acquire', { projectId, storyId: story.id, runId: r2.id, requestId: h.rid() }),
    ]);
    const winners = [c1, c2].filter((c) => c.ok);
    expect(winners).toHaveLength(1);
    const loser = [c1, c2].find((c) => !c.ok)!;
    expect(loser.error.code).toBe('CLAIM_CONFLICT');
    // A run cannot use another connection's run.
    const foreign = await a2.call('agileflow_claim_acquire', { projectId, storyId: story.id, runId: r1.id, requestId: h.rid() });
    expect(foreign.error.code).toBe('NOT_FOUND');
    const winnerAgent = c1.ok ? a1 : a2;
    const winnerRun = c1.ok ? r1 : r2;
    const renew = await winnerAgent.call('agileflow_claim_renew', { projectId, claimId: winners[0].data.id, expectedVersion: 1, requestId: h.rid() });
    expect(renew.error.code).toBe('RATE_LIMITED');
    // Terminal states only through run_finish.
    expect((await winnerAgent.call('agileflow_run_report', { projectId, runId: winnerRun.id, expectedVersion: 1, state: 'completed', requestId: h.rid() })).ok).toBe(false);
    const rep = await winnerAgent.call('agileflow_run_report', { projectId, runId: winnerRun.id, expectedVersion: 1, state: 'running', summary: 'tests written', evidence: [{ kind: 'pr', url: 'https://github.com/acme/app/pull/1' }], requestId: h.rid() });
    expect(rep.data.run.evidence[0].provenance).toBe('reported');
    const fin = await winnerAgent.call('agileflow_run_finish', { projectId, runId: winnerRun.id, expectedVersion: 2, outcome: 'completed', summary: 'Done; ready for review', requestId: h.rid() });
    expect(fin.data.releasedClaims).toEqual([winners[0].data.id]);
    const after = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: story.id })).body.data;
    expect(after.status).toBe('backlog');
    expect(after.criteria.checked).toBe(0);
    // Now the other agent can claim.
    const otherAgent = c1.ok ? a2 : a1;
    const otherRun = c1.ok ? r2 : r1;
    expect((await otherAgent.call('agileflow_claim_acquire', { projectId, storyId: story.id, runId: otherRun.id, requestId: h.rid() })).data.generation).toBe(2);
  });

  it('shows cancellation as requested until the agent acknowledges it', async () => {
    const { h, admin, projectId, orgId } = await setup();
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE }));
    const run = (await agent.call('agileflow_run_start', { projectId, name: 'long job', intent: 'refactor', requestId: h.rid() })).data;
    const cancelled = (await h.api(admin, 'POST', `/projects/${projectId}/runs/${run.id}/cancel`, { requestId: h.rid() })).body.data;
    expect(cancelled.cancellation).toMatchObject({ acknowledgedAt: null });
    expect(cancelled.state).toBe('planning');
    const stale = await agent.call('agileflow_run_report', { projectId, runId: run.id, expectedVersion: 1, summary: 'still going', requestId: h.rid() });
    expect(stale.error.code).toBe('VERSION_CONFLICT');
    const rep = await agent.call('agileflow_run_report', { projectId, runId: run.id, expectedVersion: 2, summary: 'still going', requestId: h.rid() });
    expect(rep.data.pendingActions).toEqual([expect.objectContaining({ kind: 'cancel' })]);
    const fin = await agent.call('agileflow_run_finish', { projectId, runId: run.id, expectedVersion: 3, outcome: 'cancelled', summary: 'Stopped on request', requestId: h.rid() });
    expect(fin.data.run.cancellation.acknowledgedAt).not.toBeNull();
  });

  it('requires a consumed execution_start approval when the workspace demands it', async () => {
    const { h, admin, projectId, orgId, mk } = await setup();
    await h.api(admin, 'PUT', '/workspace/policy', { requireStartApproval: true });
    const story = await mk({ kind: 'story', title: 'Gated' });
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE }));
    const start = { projectId, workIds: [story.id], name: 'gated', intent: 'Implement the gated story' };
    expect((await agent.call('agileflow_run_start', { ...start, requestId: h.rid() })).error.code).toBe('APPROVAL_REQUIRED');
    const req = (await agent.call('agileflow_control_request', { projectId, kind: 'execution_start', proposal: { workIds: [story.id], intent: start.intent }, reason: 'User asked me to implement it', requestId: h.rid() })).data;
    const editorSession = await h.session('user_editor', orgId, 'member');
    await h.api(editorSession, 'POST', `/projects/${projectId}/approvals/${req.approvalId}/decide`, { decision: 'approve', requestId: h.rid() });
    // A different intent cannot use this approval.
    expect((await agent.call('agileflow_run_start', { ...start, intent: 'Something else', approvalId: req.approvalId, requestId: h.rid() })).error.code).toBe('APPROVAL_REQUIRED');
    const run = await agent.call('agileflow_run_start', { ...start, approvalId: req.approvalId, requestId: h.rid() });
    expect(run.ok).toBe(true);
    expect((await agent.call('agileflow_run_start', { ...start, approvalId: req.approvalId, requestId: h.rid() })).error.code).toBe('APPROVAL_REQUIRED');
  });
});

describe('dashboard controls are enforced on every surface', () => {
  it('pause blocks MCP and CLI work writes (any output mode) but allows notes and runs; browser editing continues', async () => {
    const { h, admin, projectId, orgId, mk } = await setup();
    const story = await mk({ kind: 'story', title: 'Paused' });
    await h.api(admin, 'PATCH', `/projects/${projectId}`, { clientWritesPaused: true, requestId: h.rid() });
    const agent = await h.mcp(await h.token({ userId: 'user_admin', orgId, scopes: ALL_WRITE }));
    expect((await agent.call('agileflow_work_update', { projectId, workId: story.id, expectedVersion: 1, patch: { title: 'x' }, requestId: h.rid() })).error.code).toBe('CLIENT_WRITES_PAUSED');
    const cliToken = await h.token({ userId: 'user_admin', orgId, resource: 'cli', scopes: ALL_WRITE });
    expect((await h.cliTool(cliToken, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() })).body.error.code).toBe('CLIENT_WRITES_PAUSED');
    expect((await h.cliTool(cliToken, 'agileflow_note_add', { projectId, kind: 'blocker', body: 'paused, waiting', requestId: h.rid() })).body.ok).toBe(true);
    expect((await agent.call('agileflow_run_start', { projectId, name: 'r', intent: 'i', requestId: h.rid() })).ok).toBe(true);
    expect((await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId: story.id, expectedVersion: 1, patch: { title: 'Browser edit' }, requestId: h.rid() })).body.ok).toBe(true);
  });

  it('disabling a connection denies its next request even with a valid token; restricting hides projects', async () => {
    const { h, admin, projectId, orgId } = await setup();
    const tok = await h.token({ userId: 'user_admin', orgId });
    const agent = await h.mcp(tok);
    await agent.call('agileflow_context', {});
    const conns = (await h.api(admin, 'GET', '/connections')).body.data;
    expect(conns).toHaveLength(1);
    const restricted = (await h.api(admin, 'PATCH', `/connections/${conns[0].id}`, { allowedProjects: [] })).body.data;
    expect(restricted.allowedProjects).toEqual([]);
    expect((await agent.call('agileflow_work_list', { projectId })).error.code).toBe('NOT_FOUND');
    expect((await agent.call('agileflow_context', {})).data.projects).toEqual([]);
    await h.api(admin, 'PATCH', `/connections/${conns[0].id}`, { allowedProjects: null, disabled: true });
    const r = await h.rawMcp(tok, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agileflow_context', arguments: {} } });
    expect(JSON.stringify(r.body)).toContain('CONNECTION_DISABLED');
    // A fresh token for the same tuple does not re-enable it.
    const fresh = await h.mcp(await h.token({ userId: 'user_admin', orgId }));
    expect((await fresh.call('agileflow_context', {})).error.code).toBe('CONNECTION_DISABLED');
  });

  it('removed membership loses access on the next mutation, and reads within the cache bound only', async () => {
    let now = Date.now();
    const h = await harness({ now: () => new Date(now) });
    const { projectId, orgId } = await seeded(h);
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE }));
    expect((await agent.call('agileflow_work_list', { projectId })).ok).toBe(true);
    h.member(orgId, 'user_editor', 'member');
    h.svc.dev.directory.set(orgId, 'user_editor', null);
    expect((await agent.call('agileflow_note_add', { projectId, kind: 'comment', body: 'hi', requestId: h.rid() })).error.code).toBe('FORBIDDEN');
    now += 61_000;
    expect((await agent.call('agileflow_work_list', { projectId })).error.code).toBe('FORBIDDEN');
  });

  it('fails closed when membership cannot be verified for a mutation', async () => {
    const { h, projectId, orgId } = await setup();
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE }));
    h.svc.dev.directory.unavailable = true;
    expect((await agent.call('agileflow_note_add', { projectId, kind: 'comment', body: 'hi', requestId: h.rid() })).error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('long content and cursors', () => {
  it('chunks bodies over 64 KiB on UTF-8 boundaries and refuses mixed versions or foreign cursors', async () => {
    const { h, admin, projectId, orgId, mk } = await setup();
    const body = `${'é'.repeat(40_000)}${'x'.repeat(30_000)}\u{1F600}end`;
    const story = await mk({ kind: 'story', title: 'Big', body });
    let page = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: story.id })).body.data;
    expect(page.content.complete).toBe(false);
    let assembled = page.content.body;
    const first = page.content.contentCursor;
    while (page.content.contentCursor) {
      page = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: story.id, contentCursor: page.content.contentCursor })).body.data;
      assembled += page.content.body;
    }
    expect(assembled).toBe(body);
    // Another principal cannot reuse the cursor.
    const agent = await h.mcp(await h.token({ userId: 'user_admin', orgId }));
    expect((await agent.call('agileflow_work_get', { projectId, workId: story.id, contentCursor: first })).error.code).toBe('VALIDATION_ERROR');
    // A version change invalidates outstanding chunks.
    await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId: story.id, expectedVersion: 1, priorContentHash: story.contentHash, patch: { body: 'short' }, requestId: h.rid() });
    expect((await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: story.id, contentCursor: first })).body.error.code).toBe('VERSION_CONFLICT');
  });

  it('paginates lists completely with signed cursors', async () => {
    const { h, admin, projectId, mk } = await setup();
    for (let i = 0; i < 7; i++) await mk({ kind: 'story', title: `S${i}` });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const r = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_list`, { type: 'story', limit: 3, cursor })).body.data;
      seen.push(...r.items.map((i: any) => i.id));
      cursor = r.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen).size).toBe(7);
    const tampered = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_list`, { type: 'story', cursor: 'abc.def' })).body;
    expect(tampered.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('local companion delivery', () => {
  it('enrolls with single-use possession proof, delivers desired settings, and records truthful receipts', async () => {
    const { h, admin, projectId, orgId } = await setup();
    const lcToken = await h.token({ userId: 'user_admin', orgId, resource: 'local-control', scopes: ['user:org:read', 'agileflow:local:observe', 'agileflow:local:apply'] });
    const lc = async (path: string, body: unknown, credential?: string) => {
      const res = await h.fetchApp(`${BASE}/local-control/v1/projects/${projectId}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${lcToken}`, 'content-type': 'application/json', ...(credential ? { 'x-agileflow-companion': credential } : {}) },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as any };
    };
    // An MCP token is not accepted at the local-control API.
    const mcpTok = await h.token({ userId: 'user_admin', orgId, resource: 'mcp', scopes: ALL_WRITE });
    expect((await h.fetchApp(`${BASE}/local-control/v1/projects/${projectId}/poll`, { method: 'POST', headers: { authorization: `Bearer ${mcpTok}` }, body: '{}' })).status).toBe(401);

    const secret = crypto.randomBytes(32).toString('base64url');
    const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
    const start = (
      await lc('/enroll/start', { name: 'laptop', platform: 'linux-x64', version: '5.0.0', capabilities: ['skills.enable', 'questions.preference'], repoIdentity: 'github.com/acme/app', checkoutPathHash: sha('/work/app'), possessionHash: sha(secret) })
    ).body.data;
    expect((await lc('/enroll/redeem', { enrollmentId: start.enrollmentId, possessionSecret: secret })).body.error.code).toBe('APPROVAL_REQUIRED');
    await h.api(admin, 'POST', `/projects/${projectId}/enrollments/${start.enrollmentId}/approve`, { capabilities: ['skills.enable', 'questions.preference'], requestId: h.rid() });
    expect((await lc('/enroll/redeem', { enrollmentId: start.enrollmentId, possessionSecret: 'wrong' })).body.error.code).toBe('NOT_FOUND');
    const enrolled = (await lc('/enroll/redeem', { enrollmentId: start.enrollmentId, possessionSecret: secret })).body.data;
    expect(enrolled.credential).toMatch(/^afc_/);
    expect((await lc('/enroll/redeem', { enrollmentId: start.enrollmentId, possessionSecret: secret })).body.error.code).toBe('OPERATION_EXPIRED');

    expect((await lc('/poll', { version: '5.0.0' })).body.error.code).toBe('FORBIDDEN');
    const rev = (await h.api(admin, 'PUT', `/projects/${projectId}/settings`, { desired: { skills: { 'working-story': { enabled: false } }, questions: 'minimize' }, requestId: h.rid() })).body.data;
    expect(rev.pendingCheckouts).toBe(1);
    const unsafe = await h.api(admin, 'PUT', `/projects/${projectId}/settings`, { desired: { command: 'rm -rf /' }, requestId: h.rid() });
    expect(unsafe.body.error.code).toBe('VALIDATION_ERROR');

    let settings = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_settings_get`, {})).body.data;
    expect(settings.checkouts[0]).toMatchObject({ desiredRevision: 1, observedRevision: 0, status: 'pending' });

    // An old companion cannot apply until upgraded.
    const old = (await lc('/poll', { version: '4.9.0' }, enrolled.credential)).body.data;
    expect(old).toMatchObject({ supported: false, operations: [] });
    settings = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_settings_get`, {})).body.data;
    expect(settings.checkouts[0].status).toBe('unsupported');

    const poll = (await lc('/poll', { version: '5.0.0', inventory: { skills: { 'working-story': { enabled: true } }, env: { SECRET: 'x' } } }, enrolled.credential)).body.data;
    expect(poll.operations).toHaveLength(1);
    const op = poll.operations[0];
    await lc(`/operations/${op.id}/begin`, { planHash: op.planHash }, enrolled.credential);
    // Partial application is reported as blocked and does not advance the observed revision.
    const partial = (await lc(`/operations/${op.id}/receipt`, { state: 'applied', results: [{ target: 'skills.working-story.enabled', outcome: 'blocked', detail: 'locally modified' }, { target: 'interaction.questionPreference', outcome: 'applied' }], reloadRequired: true }, enrolled.credential)).body.data;
    expect(partial).toMatchObject({ state: 'blocked', observedAdvanced: false });

    // A new reviewed revision supersedes; full application advances observed.
    await h.api(admin, 'PUT', `/projects/${projectId}/settings`, { desired: { questions: 'minimize' }, requestId: h.rid() });
    const poll2 = (await lc('/poll', { version: '5.0.0' }, enrolled.credential)).body.data;
    expect(poll2.operations).toHaveLength(1);
    await lc(`/operations/${poll2.operations[0].id}/begin`, { planHash: poll2.operations[0].planHash }, enrolled.credential);
    const applied = (await lc(`/operations/${poll2.operations[0].id}/receipt`, { state: 'applied', results: [{ target: 'interaction.questionPreference', outcome: 'applied' }], observation: { questions: 'minimize' } }, enrolled.credential)).body.data;
    expect(applied.observedAdvanced).toBe(true);
    settings = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_settings_get`, {})).body.data;
    expect(settings.checkouts[0]).toMatchObject({ desiredRevision: 2, observedRevision: 2, status: 'applied' });
    expect(JSON.stringify(settings)).not.toContain('afc_');
    expect(JSON.stringify(settings)).not.toContain('SECRET');

    // Disconnect: next poll fails; queued work is cancelled.
    await h.api(admin, 'PUT', `/projects/${projectId}/settings`, { desired: { questions: 'prefer' }, requestId: h.rid() });
    const comps = (await h.api(admin, 'GET', `/projects/${projectId}/companions`)).body.data;
    const revoked = (await h.api(admin, 'POST', `/projects/${projectId}/companions/${comps.companions[0].id}/revoke`, { requestId: h.rid() })).body.data;
    expect(revoked.cancelledOperations).toBe(1);
    expect((await lc('/poll', { version: '5.0.0' }, enrolled.credential)).status).toBe(403);
  });

  it('agents can request but never apply a settings change', async () => {
    const { h, admin, projectId, orgId } = await setup();
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId, scopes: ALL_WRITE }));
    const req = await agent.call('agileflow_control_request', { projectId, kind: 'settings_change', proposal: { desired: { questions: 'prefer' } }, reason: 'User prefers questions', requestId: h.rid() });
    expect(req.data.state).toBe('pending');
    const decided = (await h.api(admin, 'POST', `/projects/${projectId}/approvals/${req.data.approvalId}/decide`, { decision: 'approve', requestId: h.rid() })).body.data;
    expect(decided.state).toBe('consumed');
    expect(decided.result.revision).toBe(1);
    const op = await agent.call('agileflow_operation_get', { projectId, operationId: req.data.approvalId });
    expect(op.data.state).toBe('consumed');
  });
});

describe('Clerk webhooks', () => {
  it('verifies signatures, deduplicates, and ignores stale membership events', async () => {
    const secretBytes = crypto.randomBytes(24);
    const secret = `whsec_${secretBytes.toString('base64')}`;
    const h = await harness({ webhookSecret: secret });
    const { orgId, projectId } = await seeded(h);
    const send = async (id: string, event: unknown, sign = true) => {
      const body = JSON.stringify(event);
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');
      const res = await h.fetchApp(`${BASE}/webhooks/clerk`, { method: 'POST', headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sign ? `v1,${sig}` : 'v1,AAAA' }, body });
      return { status: res.status, body: (await res.json()) as any };
    };
    const removed = { type: 'organizationMembership.deleted', data: { organization: { id: orgId }, public_user_data: { user_id: 'user_editor' }, role: 'org:member', updated_at: 2000 } };
    expect((await send('evt_bad', removed, false)).status).toBe(400);
    expect((await send('evt_1', removed)).body.status).toBe('processed');
    expect((await send('evt_1', removed)).body.status).toBe('duplicate');
    // An older "created" event delivered late must not resurrect the membership mirror.
    await send('evt_0', { type: 'organizationMembership.created', data: { organization: { id: orgId }, public_user_data: { user_id: 'user_editor' }, role: 'org:member', updated_at: 1000 } });
    const row = (await h.svc.db.query<{ status: string }>(`SELECT m.status FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE w.clerk_org_id = $1 AND m.user_id = 'user_editor'`, [orgId])).rows[0];
    expect(row?.status).toBe('removed');
    // Webhook payloads cannot grant project roles; and the next request re-verifies upstream.
    const agent = await h.mcp(await h.token({ userId: 'user_editor', orgId }));
    expect((await agent.call('agileflow_work_list', { projectId })).ok).toBe(true);
  });
});
