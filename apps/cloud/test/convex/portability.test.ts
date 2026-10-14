// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest';
import { internal } from '../../convex/_generated/api';
import type { WirePrincipal } from '../../convex/lib/core';
import { seeded, setup } from './helpers';

const raw = import.meta.glob('../../../../fixtures/agile-app/docs/agile/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const FILES: Record<string, string> = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.replace(/^.*\/docs\/agile\//, ''), v]));

type H = ReturnType<typeof setup>;
const preview = (h: H, p: WirePrincipal, projectId: string, files: unknown) => h.t.action(internal.portabilityNode.preview, { principal: p, projectId, files, operationKey: h.rid() }) as Promise<any>;
const commit = (h: H, p: WirePrincipal, projectId: string, jobId: string, extra: Record<string, unknown> = {}) =>
  h.t.action(internal.portabilityNode.commit, { principal: p, args: { projectId, jobId, requestId: h.rid(), ...extra } }) as Promise<any>;
const exportProject = (h: H, p: WirePrincipal, projectId: string, complete = false) => h.t.action(internal.portabilityNode.exportProject, { principal: p, projectId, complete }) as Promise<any>;

describe('Convex native Work import, re-import, and export', () => {
  it('imports the agile-app fixture preserving IDs, relations, and documents; re-import is three-way', async () => {
    const h = setup();
    const { admin, projectId } = await seeded(h);
    const pv = h.data(await preview(h, admin, projectId, FILES));
    expect(pv.preview.blocked).toBe(false);
    expect(pv.preview.counts).toMatchObject({ epics: 2, stories: 2, decisions: 1, documents: 2 });
    const job = h.data(await h.op(admin, 'portability.getImport', { projectId, jobId: pv.jobId }));
    expect(job.status).toBe('previewed');
    const c = h.data(await commit(h, admin, projectId, pv.jobId));
    expect(c.created).toBe(5);
    // Retrying the commit is safe; the upload is gone from storage and the lock is released.
    expect(h.data(await commit(h, admin, projectId, pv.jobId)).created).toBe(5);
    expect(h.data(await h.op(admin, 'portability.getImport', { projectId, jobId: pv.jobId })).status).toBe('committed');
    const story = h.data(await h.op(admin, 'agileflow_work_get', { projectId, workId: 'STORY-R3N7M2QA' }));
    expect(story.id).toBe('STORY-R3N7M2QA');
    expect(story.epic).toBeTruthy();
    const product = h.data(await h.op(admin, 'agileflow_document_get', { projectId, document: 'product' }));
    expect(product.content.body).toBe(FILES['00-product/product.md']);

    // Both sides change the same story: conflict; a file-only change is an update; a missing file is only reported.
    const storyPath = Object.keys(FILES).find((f) => f.includes('STORY-R3N7M2QA'))!;
    const otherPath = Object.keys(FILES).find((f) => f.includes('STORY-M9V4C6TE'))!;
    expect(h.code(await h.op(admin, 'agileflow_work_update', { projectId, workId: 'STORY-R3N7M2QA', expectedVersion: story.version, patch: { title: 'Cloud title' }, requestId: h.rid() }))).toBe('OK');
    const edited = { ...FILES };
    edited[storyPath] = FILES[storyPath]!.replace(/^title: .*$/m, 'title: File title');
    edited[otherPath] = FILES[otherPath]! + '\nLocal addition.\n';
    delete edited['04-decisions/DEC-P3M9A6HD-role-model.md'];
    const re = h.data(await preview(h, admin, projectId, edited));
    const byId = Object.fromEntries(re.preview.changes.map((c: any) => [c.id, c.action]));
    expect(byId['STORY-R3N7M2QA']).toBe('conflict');
    expect(byId['STORY-M9V4C6TE']).toBe('update');
    expect(byId['DEC-P3M9A6HD']).toBe('possible-removal');
    expect(h.code(await commit(h, admin, projectId, re.jobId))).toBe('VERSION_CONFLICT');
    const done = h.data(await commit(h, admin, projectId, re.jobId, { resolutions: { 'STORY-R3N7M2QA': 'cloud' }, archive: ['DEC-P3M9A6HD'] }));
    expect(done).toMatchObject({ updated: 1, archived: 1 });
    // Archived, not deleted; cloud title kept; file-side change applied.
    const dec = h.data(await h.op(admin, 'agileflow_work_get', { projectId, workId: 'DEC-P3M9A6HD' }));
    expect(dec.archived).toBe(true);
    expect(h.data(await h.op(admin, 'agileflow_work_get', { projectId, workId: 'STORY-R3N7M2QA' })).title).toBe('Cloud title');
    expect(h.data(await h.op(admin, 'agileflow_work_get', { projectId, workId: 'STORY-M9V4C6TE' })).content.body).toContain('Local addition.');
    // Writes work again after activation.
    expect(h.code(await h.op(admin, 'agileflow_work_create', { projectId, kind: 'story', title: 'After', requestId: h.rid() }))).toBe('OK');
  });

  it('blocks duplicate IDs, rejects unsafe paths, and limits who can preview and commit', async () => {
    const h = setup();
    const { admin, projectId, orgId } = await seeded(h);
    const storyPath = Object.keys(FILES).find((f) => f.startsWith('03-stories/'))!;
    const dup = h.data(await preview(h, admin, projectId, { ...FILES, '03-stories/STORY-COPY-duplicate.md': FILES[storyPath]! }));
    expect(dup.preview.blocked).toBe(true);
    expect(dup.preview.issues.some((i: any) => /duplicate/.test(i.message))).toBe(true);
    expect(h.code(await commit(h, admin, projectId, dup.jobId))).toBe('VALIDATION_ERROR');
    for (const bad of ['../etc/passwd.md', '/abs.md', '02-epics/../../x.md', 'src/app.md', '02-epics\\x.md']) {
      expect(h.code(await preview(h, admin, projectId, { [bad]: 'x' })), bad).toBe('VALIDATION_ERROR');
    }
    expect(h.code(await preview(h, h.session('user_viewer', orgId, 'member'), projectId, FILES))).toBe('FORBIDDEN');
    // An editor's preview needs an admin (its owner) to commit; another user's job is not visible.
    const editor = h.session('user_editor', orgId, 'member');
    const ep = h.data(await preview(h, editor, projectId, FILES));
    expect(h.code(await commit(h, editor, projectId, ep.jobId))).toBe('FORBIDDEN');
    expect(h.code(await commit(h, admin, projectId, ep.jobId))).toBe('NOT_FOUND');
    // Token without work:write is refused by scope.
    const tok = h.token('user_editor', orgId, { resource: 'cli' });
    expect(h.code(await preview(h, tok, projectId, FILES))).toBe('SCOPE');
  });

  it('exports native files that round-trip into a new project with original-bytes fidelity', async () => {
    const h = setup();
    const { admin, projectId } = await seeded(h);
    const epic = h.data(await h.op(admin, 'agileflow_work_create', { projectId, kind: 'epic', title: 'Checkout', requestId: h.rid() }));
    const story = h.data(await h.op(admin, 'agileflow_work_create', { projectId, kind: 'story', title: 'Pay with card', epic: epic.id, body: '## Acceptance Criteria\n\n- [ ] card accepted\n', requestId: h.rid() }));
    const exported = h.data(await exportProject(h, admin, projectId, true));
    expect(exported.report.errors).toBe(0);
    const storyFile = Object.keys(exported.files).find((f) => f.startsWith('03-stories/'))!;
    expect(exported.files[storyFile]).toContain(`epic: ${epic.id}`);
    expect(exported.complete['agileflow-connected/activity.json'].length).toBeGreaterThan(0);
    expect(exported.complete['agileflow-connected/project.json'].id).toBe(projectId);

    const target = h.data(await h.op(admin, 'admin.createProject', { name: 'Acme Copy' }));
    const pv = h.data(await preview(h, admin, target.id, exported.files));
    expect(pv.preview.blocked).toBe(false);
    expect(pv.preview.counts).toMatchObject({ epics: 1, stories: 1 });
    expect(h.data(await commit(h, admin, target.id, pv.jobId)).created).toBe(2);
    const copy = h.data(await h.op(admin, 'agileflow_work_get', { projectId: target.id, workId: story.id }));
    expect(copy.epic).toBe(epic.id);
    expect(copy.content.body).toBe(h.data(await h.op(admin, 'agileflow_work_get', { projectId, workId: story.id })).content.body);
    const again = h.data(await exportProject(h, admin, target.id));
    expect(again.files[storyFile]).toBe(exported.files[storyFile]);
    expect(again.report.fidelity[storyFile]).toBe('original');
  });

  it('blocks other writes while an activation is in progress and resumes an interrupted commit', async () => {
    const h = setup();
    const { admin, projectId } = await seeded(h);
    const pv = h.data(await preview(h, admin, projectId, FILES));
    // Simulate an activation that stopped after begin.
    await h.t.run(async (ctx) => {
      const job = (await ctx.db.query('jobs').withIndex('by_public', (q) => q.eq('publicId', pv.jobId)).unique())!;
      await ctx.db.patch(job._id, { status: 'activating', result: { resolutions: {}, archive: [], requestId: 'req-interrupted', requestDigest: 'x' } });
      const prj = (await ctx.db.query('projects').withIndex('by_public', (q) => q.eq('publicId', projectId)).unique())!;
      await ctx.db.patch(prj._id, { importing: true });
    });
    expect(h.code(await h.op(admin, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('VERSION_CONFLICT');
    expect(h.data(await commit(h, admin, projectId, pv.jobId)).created).toBe(5);
    expect(h.code(await h.op(admin, 'agileflow_work_create', { projectId, kind: 'story', title: 'x', requestId: h.rid() }))).toBe('OK');
  });
});
