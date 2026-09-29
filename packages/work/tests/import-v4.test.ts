import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyV4Import,
  frontmatter,
  importedId,
  mapV4EpicStatus,
  mapV4Priority,
  mapV4StoryStatus,
  planV4Import,
  scanWorkspace,
  validateWorkspace,
  type WorkPaths,
} from '@agileflow/work';
import { project, put } from './helpers';

/** A v4 backlog in the shapes real v4 projects have (frontmatter, bold fields, status.json, top-level entries). */
function writeV4(root: string): Record<string, string> {
  const files: Record<string, string> = {
    'docs/09-agents/status.json': JSON.stringify(
      {
        updated: '2026-01-01T00:00:00.000Z',
        epics: {
          'EP-0001': { title: 'Agent experts', status: 'complete', owner: 'AG-DEVOPS', goal: 'Agents that learn.' },
          'EP-0002': { title: 'Session harness', status: 'active', priority: 'high' },
        },
        stories: {
          'US-0001': {
            title: 'Expert directory',
            epic: 'EP-0001',
            status: 'done',
            priority: 'P1',
            owner: 'AG-DEVOPS',
            estimate: '2h',
            acceptance_criteria: ['Directory exists', 'Templates exist'],
            summary: 'Created the directory.',
          },
          'US-0002': { title: 'Pilot validation', epic: 'EP-0001', status: 'deferred', priority: 'medium', ac: ['Pilot runs'] },
          'US-0003': { title: 'Session state', epic: 'EP-0002', status: 'in_progress', depends_on: ['US-0001', 'US-9999'] },
          'US-0007': { title: 'Odd status', status: 'grooming' },
        },
        // v4 sometimes duplicated stories at the top level.
        'US-0004': { title: 'Top-level story', epic: 'EP-0002', status: 'completed', priority: 'P0', blocked_by: ['US-0003'] },
      },
      null,
      2,
    ),
    'docs/05-epics/README.md': '# Epics\n',
    'docs/05-epics/EP-0002.md': '---\nepic_id: EP-0002\ntitle: Session harness (file title)\nowner: AG-API\nstatus: active\n---\n\n# EP-0002: Session harness\n\n## Goal\nKeep sessions.\n',
    'docs/05-epics/ep-0003-old-format.md': '# EP-0003: Old format epic\n\n**Status**: Planned\n**Owner**: AG-UI\n\n---\n\n## Goal\nOld.\n',
    'docs/06-stories/US-0003.md': '---\nstory_id: US-0003\nepic: EP-0002\nestimate: 1d\n---\n\n# US-0003: Session state\n\n## Acceptance Criteria\n- [x] Schema\n- [ ] Migration\n',
    'docs/06-stories/EP-0002/US-0005-folder-epic.md': '---\nstory_id: US-0005\npriority: High\n---\n\n# US-0005: Folder epic\n\nBody text.\n',
    'docs/06-stories/US-0006-bold.md': '# US-0006: Fix #12 login\n\n**Epic**: [EP-0003](../05-epics/ep-0003-old-format.md)\n**Status**: ready\n**Priority**: Low\n\n## Acceptance Criteria\n- [ ] Works\n',
    'docs/06-stories/README.md': '# Stories\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return files;
}

function workspace(paths: WorkPaths) {
  fs.mkdirSync(paths.abs, { recursive: true });
}

describe('v4 status and priority mapping', () => {
  it('maps real-world v4 values onto the Work lifecycle', () => {
    expect(['done', 'complete', 'Completed'].map((s) => mapV4StoryStatus(s).status)).toEqual(['done', 'done', 'done']);
    expect(mapV4StoryStatus('in_progress').status).toBe('in-progress');
    expect(mapV4StoryStatus('deferred').status).toBe('backlog');
    expect(mapV4StoryStatus('ready').status).toBe('ready');
    expect(mapV4StoryStatus('cancelled').status).toBe('cancelled');
    expect(mapV4StoryStatus('grooming')).toEqual({ status: 'backlog', known: false });
    expect(mapV4EpicStatus('complete').status).toBe('done');
    expect(mapV4EpicStatus('planned').status).toBe('proposed');
    expect(mapV4EpicStatus('in_progress').status).toBe('active');
    expect(['P0', 'high', 'medium', 'Low', 'High (foundation)', 'someday', undefined].map(mapV4Priority)).toEqual(['p0', 'p1', 'p2', 'p3', 'p1', undefined, undefined]);
  });
});

describe('planV4Import / applyV4Import', () => {
  it('converts epics and stories with new IDs, links, statuses, criteria, and legacy_id', async () => {
    const { root, paths } = project();
    workspace(paths);
    writeV4(root);
    const plan = await planV4Import(await scanWorkspace(paths), { prefer: 'json' });
    expect(plan.found).toBe(true);
    expect(plan.sources).toEqual(['docs/09-agents/status.json', 'docs/05-epics', 'docs/06-stories']);
    const epics = Object.fromEntries(plan.epics.map((e) => [e.legacyId, e]));
    const stories = Object.fromEntries(plan.stories.map((s) => [s.legacyId, s]));
    expect(Object.keys(epics)).toEqual(['EP-0001', 'EP-0002', 'EP-0003']);
    expect(Object.keys(stories)).toEqual(['US-0001', 'US-0002', 'US-0003', 'US-0004', 'US-0005', 'US-0006', 'US-0007']);

    // EP-0001 is complete in v4 but US-0002 (deferred -> backlog) is open: imported as active.
    expect(epics['EP-0001']).toMatchObject({ status: 'active', legacyStatus: 'complete', title: 'Agent experts' });
    expect(plan.notes).toContain('EP-0001 is complete in v4 but has 1 open story (US-0002); imported as active');
    expect(epics['EP-0002']).toMatchObject({ status: 'active', priority: 'p1', title: 'Session harness', sources: ['docs/09-agents/status.json', 'docs/05-epics/EP-0002.md'] });
    expect(plan.notes).toContain('EP-0002: status.json and Markdown disagree on title ("Session harness" vs "Session harness (file title)"); using status.json (--prefer json)');
    expect(epics['EP-0003']).toMatchObject({ status: 'proposed', title: 'Old format epic' });

    expect(stories['US-0001']).toMatchObject({ status: 'done', priority: 'p1', epic: epics['EP-0001']!.id, dependsOn: [] });
    expect(stories['US-0003']).toMatchObject({ status: 'in-progress', epic: epics['EP-0002']!.id, dependsOn: [stories['US-0001']!.id] });
    expect(plan.notes).toContain('US-0003: dependency US-9999 was not found in the v4 backlog; dropped');
    expect(stories['US-0004']).toMatchObject({ status: 'done', priority: 'p0', dependsOn: [stories['US-0003']!.id] });
    expect(stories['US-0005']).toMatchObject({ status: 'backlog', priority: 'p1', epic: epics['EP-0002']!.id, title: 'Folder epic' });
    expect(stories['US-0006']).toMatchObject({ status: 'ready', priority: 'p3', epic: epics['EP-0003']!.id, title: 'Fix #12 login' });
    expect(stories['US-0007']).toMatchObject({ status: 'backlog' });
    expect(plan.notes).toContain('US-0007: unknown v4 status "grooming"; imported as backlog');

    // Generated body from status.json (checked because the story is done); file bodies kept as written.
    const us1 = frontmatter.parse(stories['US-0001']!.content);
    expect(us1.data).toEqual({
      schema: 1,
      type: 'story',
      id: stories['US-0001']!.id,
      title: 'Expert directory',
      status: 'done',
      priority: 'p1',
      epic: epics['EP-0001']!.id,
      depends_on: [],
      legacy_id: 'US-0001',
      legacy_source: ['docs/09-agents/status.json'],
    });
    expect(us1.body).toBe('\n# Expert directory\n\n## Acceptance Criteria\n\n- [x] Directory exists\n- [x] Templates exist\n\n## Notes\n\nCreated the directory.\n');
    expect(frontmatter.parse(stories['US-0003']!.content).body).toBe('\n# US-0003: Session state\n\n## Acceptance Criteria\n- [x] Schema\n- [ ] Migration\n');
    expect(stories['US-0006']!.content).toContain('title: "Fix #12 login"');
    // The stale v4 `**Status**:` line is removed from imported bodies (other lines stay).
    expect(frontmatter.parse(stories['US-0006']!.content).body).toBe('\n# US-0006: Fix #12 login\n\n**Epic**: [EP-0003](../05-epics/ep-0003-old-format.md)\n**Priority**: Low\n\n## Acceptance Criteria\n- [ ] Works\n');
    expect(frontmatter.parse(stories['US-0006']!.content).data!.legacy_source).toEqual(['docs/06-stories/US-0006-bold.md']);
    expect(plan.notes).toContain('removed 2 v4 `**Status**:` lines from imported bodies; the frontmatter status is authoritative (the v4 files keep theirs)');
    // Remaps are listed (deferred -> backlog, complete -> done, ...); identical values are not.
    expect(plan.remaps).toContainEqual({ type: 'story', field: 'status', from: 'deferred', to: 'backlog', items: ['US-0002'] });
    expect(plan.remaps).toContainEqual({ type: 'story', field: 'priority', from: 'medium', to: 'p2', items: ['US-0002'] });
    expect(plan.remaps.some((r) => r.from === 'done' || r.from === 'P1')).toBe(false);
  });

  it('IDs are derived from legacy IDs: the preview shows exactly what an import writes', async () => {
    const { root, paths } = project();
    workspace(paths);
    writeV4(root);
    const a = await planV4Import(await scanWorkspace(paths), { prefer: 'json' });
    const b = await planV4Import(await scanWorkspace(paths), { prefer: 'json' });
    expect(b.stories.map((s) => s.id)).toEqual(a.stories.map((s) => s.id));
    expect(b.epics.map((e) => e.id)).toEqual(a.epics.map((e) => e.id));
    expect(importedId('story', 'US-0001', new Set())).toBe(a.stories[0]!.id);
    // A clash with an ID already in use moves to the next derivation.
    const clash = importedId('story', 'US-0001', new Set([a.stories[0]!.id]));
    expect(clash).toMatch(/^STORY-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(clash).not.toBe(a.stories[0]!.id);
    await applyV4Import(await scanWorkspace(paths), a);
    const scan = await scanWorkspace(paths);
    expect(scan.stories.map((s) => s.id).sort()).toEqual(a.stories.map((s) => s.id).sort());
  });

  it('holds back items whose status.json and Markdown disagree unless a side is preferred', async () => {
    const { root, paths } = project();
    workspace(paths);
    const files: Record<string, string> = {
      'docs/09-agents/status.json': JSON.stringify({
        epics: { 'EP-0001': { title: 'Billing', status: 'active' } },
        stories: {
          'US-0001': { title: 'Invoices', epic: 'EP-0001', status: 'done', priority: 'P1' },
          'US-0002': { title: 'Refunds', epic: 'EP-0001', status: 'ready', depends_on: ['US-0001'] },
        },
      }),
      'docs/06-stories/US-0001.md': '---\nstory_id: US-0001\nstatus: in-progress\npriority: P3\nepic: EP-0009\n---\n\n# US-0001: Invoice emails\n',
      'docs/06-stories/US-0002.md': '# US-0002: Refunds\n\n**Status**: todo\n',
    };
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    }
    const plan = await planV4Import(await scanWorkspace(paths));
    expect(plan.stories.map((s) => s.legacyId)).toEqual(['US-0002']);
    expect(plan.conflicts).toEqual([
      {
        type: 'story',
        legacyId: 'US-0001',
        id: importedId('story', 'US-0001', new Set()),
        sources: ['docs/09-agents/status.json', 'docs/06-stories/US-0001.md'],
        fields: [
          { field: 'title', json: 'Invoices', markdown: 'Invoice emails' },
          { field: 'status', json: 'done', markdown: 'in-progress' },
          { field: 'priority', json: 'P1', markdown: 'P3' },
          { field: 'epic', json: 'EP-0001', markdown: 'EP-0009' },
        ],
        reasons: [],
      },
    ]);
    // `todo` (Markdown) and `ready` (status.json) mean the same: not a conflict. The reference to the held-back story is kept.
    expect(plan.stories[0]!.dependsOn).toEqual([plan.conflicts[0]!.id]);
    expect(plan.notes).toContain('US-0002: its dependency US-0001 is held back by a conflict; the link resolves once US-0001 is imported');

    const md = await planV4Import(await scanWorkspace(paths), { prefer: 'markdown' });
    expect(md.conflicts).toEqual([]);
    expect(md.stories[0]).toMatchObject({ legacyId: 'US-0001', title: 'Invoice emails', status: 'in-progress', priority: 'p3' });
    expect(md.notes).toContain('US-0001: epic EP-0009 was not found in the v4 backlog; imported as a standalone story');
    const json = await planV4Import(await scanWorkspace(paths), { prefer: 'json' });
    expect(json.stories[0]).toMatchObject({ legacyId: 'US-0001', title: 'Invoices', status: 'done', priority: 'p1', legacyEpic: 'EP-0001' });
  });

  it('flags duplicate legacy IDs and duplicate v4 files instead of guessing, and strips escape sequences', async () => {
    const { root, paths } = project();
    workspace(paths);
    const files: Record<string, string> = {
      'docs/06-stories/US-0001-a.md': '# US-0001: \u001b[31mRed\u001b[0m title\n\nBody \u001b[1mbold\u001b[0m\u0007\n',
      'docs/06-stories/US-0002-a.md': '# US-0002: First\n',
      'docs/06-stories/old/US-0002-b.md': '# US-0002: Second\n',
      'docs/06-stories/US-0003.md': '---\nstory_id: US-0003\ndepends_on: [US-0004]\n---\n\n# US-0003: Needs 4\n',
      'docs/06-stories/US-0004.md': '# US-0004: Four\n',
    };
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    }
    // Two Work items already claim US-0004.
    for (const id of ['STORY-AAAAAAA1', 'STORY-AAAAAAA2']) {
      fs.mkdirSync(path.join(paths.abs, '03-stories'), { recursive: true });
      fs.writeFileSync(path.join(paths.abs, '03-stories', `${id}.md`), `---\nschema: 1\ntype: story\nid: ${id}\ntitle: Four\nstatus: backlog\nlegacy_id: US-0004\n---\n`);
    }
    const plan = await planV4Import(await scanWorkspace(paths));
    expect(plan.duplicates).toEqual([
      { legacyId: 'US-0004', ids: ['STORY-AAAAAAA1', 'STORY-AAAAAAA2'], paths: ['docs/agile/03-stories/STORY-AAAAAAA1.md', 'docs/agile/03-stories/STORY-AAAAAAA2.md'] },
    ]);
    expect(plan.conflicts.map((c) => [c.legacyId, c.reasons])).toEqual([
      ['US-0002', ['2 Markdown files claim US-0002: docs/06-stories/US-0002-a.md, docs/06-stories/old/US-0002-b.md']],
      ['US-0003', ['it depends on US-0004, the legacy_id of more than one Work item']],
    ]);
    const us1 = plan.stories.find((s) => s.legacyId === 'US-0001')!;
    expect(us1.title).toBe('Red title');
    expect(frontmatter.parse(us1.content).body).toBe('\n# US-0001: Red title\n\nBody bold\n');
    // --prefer never resolves ambiguity.
    expect((await planV4Import(await scanWorkspace(paths), { prefer: 'json' })).conflicts).toHaveLength(2);
  });

  it('writes valid Work items, never touches the v4 files, and is idempotent', async () => {
    const { root, paths } = project();
    workspace(paths);
    const v4 = writeV4(root);
    const plan = await planV4Import(await scanWorkspace(paths), { prefer: 'json' });
    const result = await applyV4Import(await scanWorkspace(paths), plan);
    expect(result.created).toHaveLength(10);
    for (const [rel, content] of Object.entries(v4)) expect(fs.readFileSync(path.join(root, rel), 'utf8')).toBe(content);

    const scan = await scanWorkspace(paths);
    expect(scan.epics).toHaveLength(3);
    expect(scan.stories).toHaveLength(7);
    const v = validateWorkspace(scan);
    expect(v.issues.filter((i) => i.level === 'error')).toEqual([]);

    const again = await planV4Import(scan);
    expect(again.epics).toEqual([]);
    expect(again.stories).toEqual([]);
    expect(again.skipped).toHaveLength(10);
    // Nothing is flagged again for items that are already imported.
    expect(again.conflicts).toEqual([]);
    expect(again.notes).toEqual([]);
    expect(again.skipped[0]).toEqual({ legacyId: 'EP-0001', type: 'epic', existing: scan.epics.find((e) => e.legacy_id === 'EP-0001')!.id });

    // A story added to v4 later links to the epic imported earlier.
    fs.writeFileSync(path.join(root, 'docs/06-stories/US-0008.md'), '---\nstory_id: US-0008\nepic: EP-0002\nstatus: ready\ndepends_on: [US-0003]\n---\n\n# US-0008: Later\n');
    const later = await planV4Import(scan);
    expect(later.stories.map((s) => s.legacyId)).toEqual(['US-0008']);
    expect(later.stories[0]).toMatchObject({
      epic: scan.epics.find((e) => e.legacy_id === 'EP-0002')!.id,
      dependsOn: [scan.stories.find((s) => s.legacy_id === 'US-0003')!.id],
    });
  });

  it('reports when there is no v4 backlog, and rejects a broken status.json without writing', async () => {
    const { root, paths } = project();
    workspace(paths);
    expect((await planV4Import(await scanWorkspace(paths))).found).toBe(false);
    fs.mkdirSync(path.join(root, 'docs/09-agents'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/09-agents/status.json'), '{ nope');
    await expect(planV4Import(await scanWorkspace(paths))).rejects.toThrow(/status.json is not valid JSON/);
  });
});

describe('import edge cases from the audit', () => {
  it('an epic link that names a story is dropped with a note; the item stays valid and reruns are clean', async () => {
    const { root, paths } = project();
    workspace(paths);
    fs.mkdirSync(path.join(root, 'docs/09-agents'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs/09-agents/status.json'),
      JSON.stringify({ stories: { 'US-0001': { title: 'One', status: 'ready' }, 'US-0002': { title: 'Two', status: 'ready', epic: 'US-0001' } } }),
    );
    const plan = await planV4Import(await scanWorkspace(paths));
    expect(plan.notes).toContain('US-0002: its epic "US-0001" is not a v4 epic ID (EP-...); link dropped, imported as a standalone story');
    expect(plan.stories.find((s) => s.legacyId === 'US-0002')!.epic).toBeUndefined();
    await applyV4Import(await scanWorkspace(paths), plan);
    const scan = await scanWorkspace(paths);
    expect(scan.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(scan.stories).toHaveLength(2);
    const again = await planV4Import(scan);
    expect(again.stories).toEqual([]);
    expect(again.skipped).toHaveLength(2);
  });

  it('holds back an item whose new ID is already used by an invalid file, instead of stopping on it', async () => {
    const { root, paths } = project();
    workspace(paths);
    fs.mkdirSync(path.join(root, 'docs/09-agents'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs/09-agents/status.json'),
      JSON.stringify({ stories: { 'US-0001': { title: 'One', status: 'ready' }, 'US-0002': { title: 'Two', status: 'ready' } } }),
    );
    const id = importedId('story', 'US-0001', new Set());
    put(paths, `03-stories/${id}-one.md`, '---\nschema: 1\ntype: story\nid: nonsense\n---\n');
    const plan = await planV4Import(await scanWorkspace(paths));
    expect(plan.stories.map((s) => s.legacyId)).toEqual(['US-0002']);
    expect(plan.conflicts).toEqual([
      expect.objectContaining({
        legacyId: 'US-0001',
        reasons: [`docs/agile/03-stories/${id}-one.md already uses its new ID ${id} but is not a valid work item (see \`agileflow check\`); fix or remove it, then import again`],
      }),
    ]);
    expect((await applyV4Import(await scanWorkspace(paths), plan)).created).toHaveLength(1);
  });
});
