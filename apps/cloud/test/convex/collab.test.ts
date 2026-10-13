// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest';
import { seeded, setup } from './helpers';

const ALL_WRITE = ['user:org:read', 'agileflow:read', 'agileflow:notes:write', 'agileflow:work:write', 'agileflow:runs:write', 'agileflow:controls:request'];

async function world() {
  const h = setup();
  const s = await seeded(h);
  const { projectId, admin, orgId } = s;
  const mk = async (body: Record<string, unknown>) => h.data(await h.op(admin, 'agileflow_work_create', { projectId, requestId: h.rid(), ...body }));
  const agent = (userId = 'user_editor', clientId?: string) => h.token(userId, orgId, { scopes: ALL_WRITE, clientId });
  return { h, ...s, mk, agent };
}

describe('convex collab: idempotency and approvals', () => {
  it('replays a retried note and refuses a reused key with different content', async () => {
    const { h, projectId, agent } = await world();
    const a = agent();
    const requestId = h.rid();
    const first = await h.op(a, 'agileflow_note_add', { projectId, kind: 'comment', body: 'once', requestId });
    const again = await h.op(a, 'agileflow_note_add', { projectId, kind: 'comment', body: 'once', requestId });
    expect(again.value.replayed).toBe(true);
    expect(again.value.data.id).toBe(first.value.data.id);
    expect(h.data(await h.op(a, 'agileflow_note_list', { projectId })).items).toHaveLength(1);
    expect(h.code(await h.op(a, 'agileflow_note_add', { projectId, kind: 'comment', body: 'different', requestId }))).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('requires an approved, single-use lifecycle override to finish an epic with open stories', async () => {
    const { h, admin, projectId, orgId, mk, agent } = await world();
    await h.op(admin, 'admin.setWorkspacePolicy', { allowLifecycleOverride: true });
    const epic = await mk({ kind: 'epic', title: 'Big', status: 'active' });
    await mk({ kind: 'story', title: 'Open child', epic: epic.id });
    const a = agent();
    const tr = (extra: Record<string, unknown>) => h.op(a, 'agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 1, targetStatus: 'done', requestId: h.rid(), ...extra });
    expect(h.code(await tr({}))).toBe('OVERRIDE_REQUIRED');
    expect(h.code(await tr({ override: true }))).toBe('APPROVAL_REQUIRED');
    const req = h.data(
      await h.op(a, 'agileflow_control_request', { projectId, kind: 'lifecycle_override', proposal: { workId: epic.id, expectedVersion: 1, targetStatus: 'done' }, reason: 'Moves to next epic', requestId: h.rid(), reviewUrlBase: 'https://app.test' }),
    );
    expect(req.state).toBe('pending');
    expect(req.reviewUrl).toBe(`https://app.test/#/p/${projectId}/approvals/${req.approvalId}`);
    expect(h.code(await tr({ override: true, overrideApprovalId: req.approvalId }))).toBe('APPROVAL_REQUIRED');
    const editorSession = h.session('user_editor', orgId, 'member');
    expect(h.code(await h.op(editorSession, 'collab.approvalDecide', { projectId, approvalId: req.approvalId, decision: 'approve', requestId: h.rid() }))).toBe('FORBIDDEN');
    expect(h.data(await h.op(admin, 'collab.approvalDecide', { projectId, approvalId: req.approvalId, decision: 'approve', requestId: h.rid() })).state).toBe('approved');
    const done = await tr({ override: true, overrideApprovalId: req.approvalId });
    expect(done.ok).toBe(true);
    expect(done.value.warnings.map((w: any) => w.code)).toContain('LIFECYCLE_OVERRIDE');
    expect(h.data(await h.op(a, 'agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 2, targetStatus: 'active', requestId: h.rid() })).status).toBe('active');
    expect(h.code(await h.op(a, 'agileflow_work_transition', { projectId, workId: epic.id, expectedVersion: 3, targetStatus: 'done', override: true, overrideApprovalId: req.approvalId, requestId: h.rid() }))).toBe(
      'APPROVAL_REQUIRED',
    );
    expect(h.data(await h.op(a, 'agileflow_operation_get', { projectId, operationId: req.approvalId })).state).toBe('consumed');
  });

  it('control requests need the proposed operation scope too', async () => {
    const { h, projectId, orgId } = await world();
    const limited = h.token('user_editor', orgId, { scopes: ['user:org:read', 'agileflow:read', 'agileflow:controls:request'] });
    const r = await h.op(limited, 'agileflow_control_request', { projectId, kind: 'execution_start', proposal: { intent: 'x' }, reason: 'r', requestId: h.rid(), reviewUrlBase: 'https://app.test' });
    expect(r.scope).toEqual(['agileflow:runs:write']);
  });
});

describe('convex collab: runs, claims, cancellation', () => {
  it('lets one concurrent claimant win, releases on finish, and never marks the story done', async () => {
    const { h, admin, projectId, orgId, mk, agent } = await world();
    await h.member(orgId, 'user_editor2', 'member');
    await h.op(admin, 'admin.setGrant', { projectId, userId: 'user_editor2', role: 'editor', requestId: h.rid() });
    const story = await mk({ kind: 'story', title: 'Contended', body: '## Acceptance Criteria\n\n- [ ] works\n' });
    const a1 = agent('user_editor', 'agent-one');
    const a2 = agent('user_editor2', 'agent-two');
    const r1 = h.data(await h.op(a1, 'agileflow_run_start', { projectId, workIds: [story.id], name: 'one', intent: 'implement', requestId: h.rid() }));
    const r2 = h.data(await h.op(a2, 'agileflow_run_start', { projectId, workIds: [story.id], name: 'two', intent: 'implement', requestId: h.rid() }));
    const [c1, c2] = await Promise.all([
      h.op(a1, 'agileflow_claim_acquire', { projectId, storyId: story.id, runId: r1.id, requestId: h.rid() }),
      h.op(a2, 'agileflow_claim_acquire', { projectId, storyId: story.id, runId: r2.id, requestId: h.rid() }),
    ]);
    const winners = [c1, c2].filter((c) => c.ok);
    expect(winners).toHaveLength(1);
    expect(h.code([c1, c2].find((c) => !c.ok))).toBe('CLAIM_CONFLICT');
    expect(h.code(await h.op(a2, 'agileflow_claim_acquire', { projectId, storyId: story.id, runId: r1.id, requestId: h.rid() }))).toBe('NOT_FOUND');
    const [wa, wr, oa, or] = c1.ok ? [a1, r1, a2, r2] : [a2, r2, a1, r1];
    const claim = h.data(winners[0]);
    expect(h.code(await h.op(wa, 'agileflow_claim_renew', { projectId, claimId: claim.id, expectedVersion: 1, requestId: h.rid() }))).toBe('RATE_LIMITED');
    expect(h.data(await h.op(admin, 'collab.claims', { projectId })).items.map((c: any) => c.id)).toEqual([claim.id]);
    expect(h.code(await h.op(wa, 'agileflow_run_report', { projectId, runId: wr.id, expectedVersion: 1, state: 'completed', requestId: h.rid() }))).toBe('VALIDATION_ERROR');
    const rep = h.data(await h.op(wa, 'agileflow_run_report', { projectId, runId: wr.id, expectedVersion: 1, state: 'running', summary: 'tests', evidence: [{ kind: 'pr', url: 'https://github.com/acme/app/pull/1', provenance: 'verified' }], requestId: h.rid() }));
    expect(rep.run.evidence[0].provenance).toBe('reported');
    const fin = h.data(await h.op(wa, 'agileflow_run_finish', { projectId, runId: wr.id, expectedVersion: 2, outcome: 'completed', summary: 'Done', requestId: h.rid() }));
    expect(fin.releasedClaims).toEqual([claim.id]);
    const after = h.data(await h.op(admin, 'agileflow_work_get', { projectId, workId: story.id }));
    expect(after.status).toBe('backlog');
    expect(after.criteria.checked).toBe(0);
    expect(h.data(await h.op(oa, 'agileflow_claim_acquire', { projectId, storyId: story.id, runId: or.id, requestId: h.rid() })).generation).toBe(2);
    const runs = h.data(await h.op(admin, 'agileflow_run_list', { projectId, limit: 1 }));
    expect(runs.items).toHaveLength(1);
    expect(runs.hasMore).toBe(true);
    const runs2 = h.data(await h.op(admin, 'agileflow_run_list', { projectId, limit: 1, cursor: runs.nextCursor }));
    expect(runs2.items[0].id).not.toBe(runs.items[0].id);
  });

  it('force-releases a claim through an approved claim_override', async () => {
    const { h, admin, projectId, mk, agent } = await world();
    const story = await mk({ kind: 'story', title: 'Stuck' });
    const a = agent();
    const run = h.data(await h.op(a, 'agileflow_run_start', { projectId, name: 'r', intent: 'i', requestId: h.rid() }));
    const claim = h.data(await h.op(a, 'agileflow_claim_acquire', { projectId, storyId: story.id, runId: run.id, requestId: h.rid() }));
    const req = h.data(await h.op(a, 'agileflow_control_request', { projectId, kind: 'claim_override', proposal: { claimId: claim.id, generation: 1, version: 1 }, reason: 'stale holder', requestId: h.rid(), reviewUrlBase: 'https://app.test' }));
    const decided = h.data(await h.op(admin, 'collab.approvalDecide', { projectId, approvalId: req.approvalId, decision: 'approve', requestId: h.rid() }));
    expect(decided.state).toBe('consumed');
    expect(h.data(await h.op(admin, 'collab.claims', { projectId })).items).toHaveLength(0);
    expect(h.data(await h.op(admin, 'collab.approvals', { projectId, state: 'consumed' })).items).toHaveLength(1);
  });

  it('shows cancellation as requested until the agent acknowledges it', async () => {
    const { h, admin, projectId, agent } = await world();
    const a = agent();
    const run = h.data(await h.op(a, 'agileflow_run_start', { projectId, name: 'long job', intent: 'refactor', requestId: h.rid() }));
    expect(h.code(await h.op(a, 'collab.runCancel', { projectId, runId: run.id, requestId: h.rid() }))).toBe('FORBIDDEN');
    const cancelled = h.data(await h.op(admin, 'collab.runCancel', { projectId, runId: run.id, requestId: h.rid() }));
    expect(cancelled.cancellation).toMatchObject({ acknowledgedAt: null });
    expect(cancelled.state).toBe('planning');
    expect(h.code(await h.op(a, 'agileflow_run_report', { projectId, runId: run.id, expectedVersion: 1, summary: 'still going', requestId: h.rid() }))).toBe('VERSION_CONFLICT');
    const rep = h.data(await h.op(a, 'agileflow_run_report', { projectId, runId: run.id, expectedVersion: 2, summary: 'still going', requestId: h.rid() }));
    expect(rep.pendingActions).toEqual([expect.objectContaining({ kind: 'cancel' })]);
    const fin = h.data(await h.op(a, 'agileflow_run_finish', { projectId, runId: run.id, expectedVersion: 3, outcome: 'cancelled', summary: 'Stopped', requestId: h.rid() }));
    expect(fin.run.cancellation.acknowledgedAt).not.toBeNull();
  });

  it('requires a consumed execution_start approval when the workspace demands it', async () => {
    const { h, admin, projectId, orgId, mk, agent } = await world();
    await h.op(admin, 'admin.setWorkspacePolicy', { requireStartApproval: true });
    const story = await mk({ kind: 'story', title: 'Gated' });
    const a = agent();
    const start = { projectId, workIds: [story.id], name: 'gated', intent: 'Implement the gated story' };
    expect(h.code(await h.op(a, 'agileflow_run_start', { ...start, requestId: h.rid() }))).toBe('APPROVAL_REQUIRED');
    const req = h.data(await h.op(a, 'agileflow_control_request', { projectId, kind: 'execution_start', proposal: { workIds: [story.id], intent: start.intent }, reason: 'asked', requestId: h.rid(), reviewUrlBase: 'https://app.test' }));
    expect(h.data(await h.op(h.session('user_editor', orgId, 'member'), 'collab.approvalDecide', { projectId, approvalId: req.approvalId, decision: 'approve', requestId: h.rid() })).state).toBe('approved');
    expect(h.code(await h.op(a, 'agileflow_run_start', { ...start, intent: 'Something else', approvalId: req.approvalId, requestId: h.rid() }))).toBe('APPROVAL_REQUIRED');
    expect((await h.op(a, 'agileflow_run_start', { ...start, approvalId: req.approvalId, requestId: h.rid() })).ok).toBe(true);
    expect(h.code(await h.op(a, 'agileflow_run_start', { ...start, approvalId: req.approvalId, requestId: h.rid() }))).toBe('APPROVAL_REQUIRED');
  });
});

describe('convex collab: dashboard controls', () => {
  it('pause blocks token work writes but allows notes and runs; dashboard editing continues', async () => {
    const { h, admin, projectId, orgId, mk } = await world();
    const story = await mk({ kind: 'story', title: 'Paused' });
    await h.op(admin, 'admin.updateProject', { projectId, clientWritesPaused: true, requestId: h.rid() });
    const a = h.token('user_admin', orgId, { scopes: ALL_WRITE });
    expect(h.code(await h.op(a, 'agileflow_work_update', { projectId, workId: story.id, expectedVersion: 1, patch: { title: 'x' }, requestId: h.rid() }))).toBe('CLIENT_WRITES_PAUSED');
    const cli = h.token('user_admin', orgId, { resource: 'cli', scopes: ALL_WRITE });
    expect(h.code(await h.op(cli, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('CLIENT_WRITES_PAUSED');
    expect((await h.op(cli, 'agileflow_note_add', { projectId, kind: 'blocker', body: 'paused', requestId: h.rid() })).ok).toBe(true);
    expect((await h.op(a, 'agileflow_run_start', { projectId, name: 'r', intent: 'i', requestId: h.rid() })).ok).toBe(true);
    expect((await h.op(admin, 'agileflow_work_update', { projectId, workId: story.id, expectedVersion: 1, patch: { title: 'Browser edit' }, requestId: h.rid() })).ok).toBe(true);
  });

  it('a disabled connection is denied even with a valid token', async () => {
    const { h, admin, projectId, agent } = await world();
    const a = agent();
    expect((await h.op(a, 'agileflow_note_add', { projectId, kind: 'comment', body: 'hi', requestId: h.rid() })).ok).toBe(true);
    const conns = h.data(await h.op(admin, 'admin.connections', {}));
    await h.op(admin, 'admin.updateConnection', { connectionId: (conns.items ?? conns)[0].id, disabled: true });
    expect(h.code(await h.op(a, 'agileflow_note_add', { projectId, kind: 'comment', body: 'hi', requestId: h.rid() }))).toBe('CONNECTION_DISABLED');
    expect(h.code(await h.op(a, 'agileflow_note_list', { projectId }))).toBe('CONNECTION_DISABLED');
  });
});

describe('convex collab: notes', () => {
  it('promotes a decision proposal, edits only your own notes, and redacts through history', async () => {
    const { h, admin, projectId, orgId, agent } = await world();
    const a = agent();
    const proposal = h.data(await h.op(a, 'agileflow_note_add', { projectId, kind: 'decision-proposal', body: 'Use Convex for the work store.', requestId: h.rid() }));
    const rid = h.rid();
    const promoted = h.data(await h.op(admin, 'collab.notePromote', { projectId, noteId: proposal.id, title: 'Use Convex', requestId: rid }));
    expect(promoted.decisionId).toMatch(/^DEC-/);
    // A retry replays instead of failing on the already-promoted note.
    expect(h.data(await h.op(admin, 'collab.notePromote', { projectId, noteId: proposal.id, title: 'Use Convex', requestId: rid })).decisionId).toBe(promoted.decisionId);
    const dec = h.data(await h.op(admin, 'agileflow_work_get', { projectId, workId: promoted.decisionId }));
    expect(dec).toMatchObject({ type: 'decision', status: 'proposed' });
    expect(dec.content.body).toContain(proposal.id);
    expect(h.code(await h.op(admin, 'collab.notePromote', { projectId, noteId: proposal.id, title: 'Again', requestId: h.rid() }))).toBe('VALIDATION_ERROR');
    // A failed promotion (bad title) creates no decision.
    const p2 = h.data(await h.op(a, 'agileflow_note_add', { projectId, kind: 'decision-proposal', body: 'Other', requestId: h.rid() }));
    expect(h.code(await h.op(admin, 'collab.notePromote', { projectId, noteId: p2.id, title: '', requestId: h.rid() }))).toBe('VALIDATION_ERROR');
    expect(h.data(await h.op(admin, 'agileflow_work_list', { projectId, type: 'decision' })).items).toHaveLength(1);

    const mine = h.data(await h.op(admin, 'agileflow_note_add', { projectId, kind: 'comment', body: 'token sk_live_abc123 oops', requestId: h.rid() }));
    const editor = h.session('user_editor', orgId, 'member');
    expect(h.code(await h.op(editor, 'collab.noteEdit', { projectId, noteId: mine.id, body: 'hijack', expectedVersion: 1, requestId: h.rid() }))).toBe('FORBIDDEN');
    expect(h.code(await h.op(a, 'collab.noteEdit', { projectId, noteId: mine.id, body: 'x', expectedVersion: 1, requestId: h.rid() }))).toBe('FORBIDDEN');
    expect(h.data(await h.op(admin, 'collab.noteEdit', { projectId, noteId: mine.id, body: 'token sk_live_abc123 still', expectedVersion: 1, requestId: h.rid() })).version).toBe(2);
    expect(h.code(await h.op(editor, 'collab.noteRedact', { projectId, noteId: mine.id, reason: 'secret', requestId: h.rid() }))).toBe('FORBIDDEN');
    expect(h.data(await h.op(admin, 'collab.noteRedact', { projectId, noteId: mine.id, reason: 'Contained a secret', requestId: h.rid() })).redacted).toBe(true);

    const listed = h.data(await h.op(admin, 'agileflow_note_list', { projectId })).items.find((n: any) => n.id === mine.id);
    expect(listed).toMatchObject({ body: '[redacted]', redacted: true });
    const stored = await h.t.run(async (ctx) => ({
      revs: await ctx.db.query('revisions').withIndex('by_object', (q) => q.eq('projectId', projectId).eq('objectType', 'note').eq('objectId', mine.id)).collect(),
      note: await ctx.db.query('notes').withIndex('by_public', (q) => q.eq('publicId', mine.id)).unique(),
    }));
    expect(stored.revs).toHaveLength(2);
    expect(JSON.stringify(stored)).not.toContain('sk_live_abc123');
    const act = h.data(await h.op(admin, 'agileflow_activity_list', { projectId, operation: 'note.redacted' })).items;
    expect(act).toHaveLength(1);
  });

  it('paginates notes and activity with signed cursors', async () => {
    const { h, projectId, agent } = await world();
    const a = agent();
    for (let i = 0; i < 5; i++) await h.op(a, 'agileflow_note_add', { projectId, kind: 'progress', body: `n${i}`, requestId: h.rid() });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const r = h.data(await h.op(a, 'agileflow_note_list', { projectId, limit: 2, cursor }));
      seen.push(...r.items.map((n: any) => n.body));
      cursor = r.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
    expect(h.code(await h.op(a, 'agileflow_note_list', { projectId, cursor: 'abc.def' }))).toBe('VALIDATION_ERROR');
    const act = h.data(await h.op(a, 'agileflow_activity_list', { projectId, operation: 'note.', limit: 3 }));
    expect(act.items).toHaveLength(3);
    const act2 = h.data(await h.op(a, 'agileflow_activity_list', { projectId, operation: 'note.', limit: 3, cursor: act.nextCursor }));
    expect(act2.items).toHaveLength(2);
    expect(act2.items[0].seq).toBeGreaterThan(act.items[2].seq);
  });
});
