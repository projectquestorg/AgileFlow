// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../convex/lib/util';
import { seeded, setup } from './helpers';

const ALL_WRITE = ['user:org:read', 'agileflow:read', 'agileflow:notes:write', 'agileflow:work:write', 'agileflow:runs:write', 'agileflow:controls:request'];

async function world() {
  const h = setup();
  const s = await seeded(h);
  const lcTok = h.token('user_admin', s.orgId, { resource: 'local-control', scopes: ['user:org:read', 'agileflow:local:observe', 'agileflow:local:apply'] });
  const lc = (name: string, args: Record<string, unknown>, credential?: string) => h.op(lcTok, `controls.${name}`, { projectId: s.projectId, credential, ...args }, { write: true });
  const settings = async () => h.data(await h.op(s.admin, 'agileflow_settings_get', { projectId: s.projectId }));
  const setDesired = (desired: unknown) => h.op(s.admin, 'controls.setDesired', { projectId: s.projectId, desired, requestId: h.rid() });
  return { h, ...s, lcTok, lc, settings, setDesired };
}

async function enroll(w: Awaited<ReturnType<typeof world>>, capabilities = ['skills.enable', 'questions.preference']) {
  const { h, lc, admin, projectId } = w;
  const secret = `secret-${Math.random()}`;
  const start = h.data(await lc('enrollStart', { name: 'laptop', platform: 'linux-x64', version: '5.0.0', capabilities, repoIdentity: 'github.com/acme/app', checkoutPathHash: sha256Hex('/work/app'), possessionHash: sha256Hex(secret) }));
  expect(h.code(await lc('enrollRedeem', { enrollmentId: start.enrollmentId, possessionSecret: secret }))).toBe('APPROVAL_REQUIRED');
  h.data(await h.op(admin, 'controls.enrollApprove', { projectId, enrollmentId: start.enrollmentId, capabilities, requestId: h.rid() }));
  expect(h.code(await lc('enrollRedeem', { enrollmentId: start.enrollmentId, possessionSecret: 'wrong' }))).toBe('NOT_FOUND');
  const enrolled = h.data(await lc('enrollRedeem', { enrollmentId: start.enrollmentId, possessionSecret: secret }));
  expect(enrolled.credential).toMatch(/^afc_/);
  expect(h.code(await lc('enrollRedeem', { enrollmentId: start.enrollmentId, possessionSecret: secret }))).toBe('OPERATION_EXPIRED');
  return enrolled as { credential: string; companionId: string; checkoutId: string };
}

describe('convex controls: companion delivery', () => {
  it('enrolls, delivers desired settings, records truthful receipts, handles upgrades and revocation', async () => {
    const w = await world();
    const { h, admin, projectId, lc, settings, setDesired } = w;
    // Only local-control tokens may enroll.
    const mcp = h.token('user_admin', w.orgId, { scopes: ALL_WRITE });
    expect(h.code(await h.op(mcp, 'controls.enrollStart', { projectId, platform: 'linux-x64' }, { write: true }))).toBe('FORBIDDEN');
    expect(h.code(await lc('enrollStart', { name: 'x', platform: 'win32-x64', version: '5.0.0', capabilities: [], repoIdentity: 'r', checkoutPathHash: sha256Hex('a'), possessionHash: sha256Hex('b') }))).toBe('UNSUPPORTED');
    const enrolled = await enroll(w);

    expect(h.code(await lc('poll', { version: '5.0.0' }))).toBe('FORBIDDEN');
    const rev = h.data(await setDesired({ skills: { 'working-story': { enabled: false } }, questions: 'minimize' }));
    expect(rev.pendingCheckouts).toBe(1);
    expect(h.code(await setDesired({ command: 'rm -rf /' }))).toBe('VALIDATION_ERROR');
    expect(h.code(await setDesired({ skills: { s: { version: '^1.0.0' } } }))).toBe('VALIDATION_ERROR');
    expect((await settings()).checkouts[0]).toMatchObject({ desiredRevision: 1, observedRevision: 0, status: 'pending' });

    // An old companion cannot apply until upgraded.
    expect(h.data(await lc('poll', { version: '4.9.0' }, enrolled.credential))).toMatchObject({ supported: false, operations: [] });
    expect((await settings()).checkouts[0].status).toBe('unsupported');

    const poll = h.data(await lc('poll', { version: '5.0.0', inventory: { skills: { 'working-story': { enabled: true } }, env: { SECRET: 'x' } } }, enrolled.credential));
    expect(poll.operations).toHaveLength(1);
    const op = poll.operations[0];
    expect(h.code(await lc('begin', { operationId: op.id, planHash: 'sha256:nope' }, enrolled.credential))).toBe('VERSION_CONFLICT');
    expect(h.data(await lc('begin', { operationId: op.id, planHash: op.planHash }, enrolled.credential)).state).toBe('applying');
    const partial = h.data(
      await lc('receipt', { operationId: op.id, state: 'applied', results: [{ target: 'skills.working-story.enabled', outcome: 'blocked', detail: 'locally modified' }, { target: 'interaction.questionPreference', outcome: 'applied' }], reloadRequired: true }, enrolled.credential),
    );
    expect(partial).toMatchObject({ state: 'blocked', observedAdvanced: false });

    await setDesired({ questions: 'minimize' });
    const poll2 = h.data(await lc('poll', { version: '5.0.0' }, enrolled.credential));
    expect(poll2.operations).toHaveLength(1);
    await lc('begin', { operationId: poll2.operations[0].id, planHash: poll2.operations[0].planHash }, enrolled.credential);
    const applied = h.data(await lc('receipt', { operationId: poll2.operations[0].id, state: 'applied', results: [{ target: 'interaction.questionPreference', outcome: 'applied' }], observation: { questions: 'minimize' } }, enrolled.credential));
    expect(applied.observedAdvanced).toBe(true);
    const s = await settings();
    expect(s.checkouts[0]).toMatchObject({ desiredRevision: 2, observedRevision: 2, status: 'applied' });
    expect(JSON.stringify(s)).not.toContain('afc_');
    const inv = await h.t.run(async (ctx) => ctx.db.query('companions').collect());
    expect(JSON.stringify(inv)).not.toContain('SECRET');

    // A companion token reads settings with local:observe.
    expect(h.data(await h.op(w.lcTok, 'agileflow_settings_get', { projectId })).checkouts).toHaveLength(1);

    // Disconnect: queued work is cancelled; the next poll gets the specific message.
    await setDesired({ questions: 'prefer' });
    const comps = h.data(await h.op(admin, 'controls.listEnrollments', { projectId }));
    expect(comps.companions[0]).toMatchObject({ id: enrolled.companionId, supported: true, revoked: false });
    expect(h.data(await h.op(admin, 'controls.revokeCompanion', { projectId, companionId: enrolled.companionId, requestId: h.rid() })).cancelledOperations).toBe(1);
    const denied = await lc('poll', { version: '5.0.0' }, enrolled.credential);
    expect(denied).toMatchObject({ ok: false, status: 403 });
    expect(denied.error.message).toContain('disconnected in the dashboard');
  });

  it('a receipt after revocation is refused and the operation outcome becomes unknown', async () => {
    const w = await world();
    const { h, admin, projectId, lc, setDesired } = w;
    const enrolled = await enroll(w);
    await setDesired({ questions: 'prefer' });
    const op = h.data(await lc('poll', { version: '5.0.0' }, enrolled.credential)).operations[0];
    await lc('begin', { operationId: op.id, planHash: op.planHash }, enrolled.credential);
    await h.op(admin, 'controls.revokeCompanion', { projectId, companionId: enrolled.companionId, requestId: h.rid() });
    const r = await lc('receipt', { operationId: op.id, state: 'applied', results: [] }, enrolled.credential);
    expect(r).toMatchObject({ ok: false, status: 403, error: { code: 'FORBIDDEN' } });
    expect(h.data(await h.op(admin, 'agileflow_operation_get', { projectId, operationId: op.id })).state).toBe('unknown');
  });

  it('begin refuses capabilities the companion was not enrolled for and records it', async () => {
    const w = await world();
    const { h, admin, projectId, lc, setDesired } = w;
    const enrolled = await enroll(w, ['questions.preference']);
    await setDesired({ skills: { 'working-story': { version: '1.3.0' } } });
    const op = h.data(await lc('poll', { version: '5.0.0' }, enrolled.credential)).operations[0];
    expect(op.plan.steps[0]).toMatchObject({ capability: 'skills.update', target: 'skills.working-story.version', value: '1.3.0' });
    expect(h.code(await lc('begin', { operationId: op.id, planHash: op.planHash }, enrolled.credential))).toBe('UNSUPPORTED');
    expect(h.data(await h.op(admin, 'agileflow_operation_get', { projectId, operationId: op.id })).state).toBe('unsupported');
  });

  it('agents can request but never apply a settings change', async () => {
    const w = await world();
    const { h, admin, projectId, orgId } = w;
    const agent = h.token('user_editor', orgId, { scopes: ALL_WRITE });
    expect(h.code(await h.op(agent, 'controls.setDesired', { projectId, desired: { questions: 'prefer' }, requestId: h.rid() }))).toBe('FORBIDDEN');
    const req = h.data(await h.op(agent, 'agileflow_control_request', { projectId, kind: 'settings_change', proposal: { desired: { questions: 'prefer' } }, reason: 'User prefers questions', requestId: h.rid(), reviewUrlBase: 'https://app.test' }));
    expect(req.state).toBe('pending');
    expect(h.code(await h.op(agent, 'collab.approvalDecide', { projectId, approvalId: req.approvalId, decision: 'approve', requestId: h.rid() }))).toBe('FORBIDDEN');
    const decided = h.data(await h.op(admin, 'collab.approvalDecide', { projectId, approvalId: req.approvalId, decision: 'approve', requestId: h.rid() }));
    expect(decided.state).toBe('consumed');
    expect(decided.result.revision).toBe(1);
    expect(h.data(await h.op(agent, 'agileflow_operation_get', { projectId, operationId: req.approvalId })).state).toBe('consumed');
    expect(h.data(await h.op(admin, 'agileflow_settings_get', { projectId })).desired).toMatchObject({ revision: 1, settings: { questions: 'prefer' } });
  });
});
