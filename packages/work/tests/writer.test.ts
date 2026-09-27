import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  artifactFileName,
  createArtifact,
  frontmatter,
  getArtifact,
  initWorkspace,
  inspectWorkspace,
  scanWorkspace,
  setStatus,
  slugify,
  validateWorkspace,
} from '@agileflow/work';
import { project, put } from './helpers';

describe('initWorkspace', () => {
  it('creates README, product, and roadmap only; no empty folders or .gitkeep', async () => {
    const { root, paths } = project();
    const result = await initWorkspace(paths);
    expect(result.created).toEqual(['docs/agile/README.md', 'docs/agile/00-product/product.md', 'docs/agile/01-roadmap/roadmap.md']);
    const files = fs.readdirSync(paths.abs, { recursive: true }).map(String).sort();
    expect(files).toEqual(['00-product', '00-product/product.md', '01-roadmap', '01-roadmap/roadmap.md', 'README.md']);
    expect(fs.readFileSync(path.join(root, 'docs/agile/00-product/product.md'), 'utf8')).toContain('## Definition of Done');
    expect(validateWorkspace(await scanWorkspace(paths)).issues).toEqual([]);
  });

  it('never overwrites existing files', async () => {
    const { paths } = project();
    put(paths, '00-product/product.md', '# Our product\n');
    const result = await initWorkspace(paths);
    expect(result.kept).toEqual(['docs/agile/00-product/product.md']);
    expect(fs.readFileSync(path.join(paths.abs, '00-product/product.md'), 'utf8')).toBe('# Our product\n');
  });
});

describe('inspectWorkspace', () => {
  it('adopts a compatible existing workspace and explains an incompatible one', async () => {
    const fresh = project();
    expect(await inspectWorkspace(fresh.paths)).toMatchObject({ exists: false, compatible: true });

    const good = project('healthy');
    expect(await inspectWorkspace(good.paths)).toMatchObject({
      exists: true,
      compatible: true,
      conflicts: [],
      missing: [],
      counts: { epics: 2, stories: 5, decisions: 1 },
    });

    const bad = project('healthy');
    put(bad.paths, '09-agents/status.json', '{}');
    put(bad.paths, '03-stories/in-progress/x.md', '# x');
    const inspection = await inspectWorkspace(bad.paths);
    expect(inspection.compatible).toBe(false);
    expect(inspection.conflicts).toEqual(['09-agents/ is not part of the Work workspace', expect.stringMatching(/03-stories\/in-progress\/ is a subfolder/)]);
  });

  it('metadata warnings do not block adoption; invalid artifacts do', async () => {
    const meta = project('healthy');
    put(meta.paths, '03-stories/renamed.md', '---\nschema: 1\ntype: story\nid: STORY-KKKKKKKK\ntitle: X\nstatus: backlog\nestimate: 3\n---\n# X\n');
    expect(await inspectWorkspace(meta.paths)).toMatchObject({ compatible: true, conflicts: [] });

    const invalid = project('healthy');
    put(invalid.paths, '03-stories/STORY-KKKKKKKK-x.md', '---\nschema: 1\ntype: story\nid: STORY-KKKKKKKK\ntitle: X\nstatus: grooming\n---\n');
    const result = await inspectWorkspace(invalid.paths);
    expect(result.compatible).toBe(false);
    expect(result.conflicts[0]).toMatch(/STORY-KKKKKKKK-x\.md: status:/);
  });
});

describe('createArtifact', () => {
  it('creates epics, epic-linked stories, standalone stories, and decisions with fresh ids', async () => {
    const { paths } = project();
    await initWorkspace(paths);
    let scan = await scanWorkspace(paths);
    const epic = await createArtifact(scan, { type: 'epic', title: 'Social authentication', horizon: 'now', priority: 'p1', status: 'active' });
    expect(epic).toMatchObject({ type: 'epic', status: 'active', path: `docs/agile/02-epics/${epic.id}-social-authentication.md` });
    scan = await scanWorkspace(paths);
    const linked = await createArtifact(scan, { type: 'story', title: 'Add Google sign-in', epic: epic.id.slice(5, 9) });
    const standalone = await createArtifact(scan, { type: 'story', title: 'Fix duplicate invoice email', dependsOn: [] });
    scan = await scanWorkspace(paths);
    const dependent = await createArtifact(scan, { type: 'story', title: 'Account linking', dependsOn: [linked.id] });
    const dec = await createArtifact(scan, { type: 'decision', title: 'Use Auth.js', related: [epic.id, linked.id] });
    scan = await scanWorkspace(paths);
    expect(getArtifact(scan, linked.id)).toMatchObject({ epic: epic.id, status: 'backlog', depends_on: [] });
    expect(getArtifact(scan, standalone.id)).not.toHaveProperty('epic');
    expect(getArtifact(scan, dependent.id)).toMatchObject({ depends_on: [linked.id] });
    expect(getArtifact(scan, dec.id)).toMatchObject({ status: 'proposed', related: [epic.id, linked.id] });
    expect(validateWorkspace(scan).issues).toEqual([]);
    const text = fs.readFileSync(path.join(paths.projectRoot, linked.path), 'utf8');
    expect(text).toContain('## Acceptance Criteria');
    expect(text).not.toContain('- [ ]');
  });

  it('rejects bad input without writing anything', async () => {
    const { paths } = project();
    await initWorkspace(paths);
    const scan = await scanWorkspace(paths);
    await expect(createArtifact(scan, { type: 'story', title: '  ' })).rejects.toThrow(/title is required/);
    await expect(createArtifact(scan, { type: 'story', title: 'x', epic: 'NOPE' })).rejects.toThrow(/No epic/);
    await expect(createArtifact(scan, { type: 'story', title: 'x', status: 'grooming' })).rejects.toThrow(/not a story status/);
    await expect(createArtifact(scan, { type: 'story', title: 'x', priority: 'urgent' })).rejects.toThrow(/not a valid priority/);
    await expect(createArtifact(scan, { type: 'story', title: 'x', horizon: 'now' })).rejects.toThrow(/epics only/);
    await expect(createArtifact(scan, { type: 'decision', title: 'x', priority: 'p1' })).rejects.toThrow(/epics and stories only/);
    expect(fs.existsSync(path.join(paths.abs, '03-stories'))).toBe(false);
  });

  it('names files <ID>-<slug>.md', () => {
    expect(slugify('Add Google sign-in!')).toBe('add-google-sign-in');
    expect(slugify('Élan & café: v2')).toBe('elan-cafe-v2');
    expect(slugify('a'.repeat(80))).toHaveLength(48);
    expect(artifactFileName('STORY-3Q7MX2PK', 'Add Google sign-in')).toBe('STORY-3Q7MX2PK-add-google-sign-in.md');
    expect(artifactFileName('STORY-3Q7MX2PK', '!!!')).toBe('STORY-3Q7MX2PK.md');
  });
});

describe('setStatus', () => {
  it('changes only the status line and keeps the body byte-for-byte', async () => {
    const { paths } = project('healthy');
    const file = path.join(paths.abs, '03-stories/STORY-3Q7MX2PK-google-login.md');
    const before = fs.readFileSync(file, 'utf8');
    const scan = await scanWorkspace(paths);
    const change = await setStatus(scan, getArtifact(scan, '3Q7M'), 'in-progress');
    expect(change).toMatchObject({ id: 'STORY-3Q7MX2PK', from: 'ready', to: 'in-progress', changed: true, warnings: [] });
    const after = fs.readFileSync(file, 'utf8');
    expect(after).toBe(before.replace('status: ready', 'status: in-progress'));
    expect(frontmatter.parse(after).body).toBe(frontmatter.parse(before).body);
  });

  it('allows off-path moves with warnings, rejects invalid values, and refuses to close an epic with open stories', async () => {
    const { paths } = project('healthy');
    let scan = await scanWorkspace(paths);
    const apple = await setStatus(scan, getArtifact(scan, 'H5D2'), 'in-progress');
    expect(apple.warnings[0]).toMatch(/outside the recommended flow/);
    await expect(setStatus(scan, getArtifact(scan, 'H5D2'), 'grooming')).rejects.toThrow(/not a story status/);
    await expect(setStatus(scan, getArtifact(scan, '7M4K'), 'done')).rejects.toThrow(/unfinished stories/);
    scan = await scanWorkspace(paths);
    const forced = await setStatus(scan, getArtifact(scan, '7M4K'), 'done', { force: true });
    expect(forced.warnings[0]).toMatch(/unfinished stories/);
    const same = await setStatus(await scanWorkspace(paths), getArtifact(await scanWorkspace(paths), '7M4K'), 'done');
    expect(same.changed).toBe(false);
  });
});
