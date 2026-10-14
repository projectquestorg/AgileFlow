import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkScope,
  createContext,
  hashTree,
  loadWorkspace,
  lockEntryFor,
  normalizeTree,
  planUpdate,
  projectScope,
  readLockfile,
  renderedRecordOf,
  RENDERER_REVISION,
  renderSkill,
  serializeLockfile,
  syncWorkspace,
  updateWorkspace,
  writeTree,
  type FetchedPackage,
  type InteractionPreference,
  type LockEntry,
  type Services,
  type TreeFile,
} from '@agileflow/core';
import { allAdapters } from '@agileflow/providers';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-drift-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const file = (p: string, content: string): TreeFile => ({ path: p, content: Buffer.from(content), executable: false });
const sidecar = (ui: string) => `schema: 1\npackage:\n  name: "@agileflow/demo"\n  version: 1.0.0\ncapabilities:\n  userInteraction: ${ui}\n`;

function pkgFor(id: string, ui = 'optional'): FetchedPackage {
  const files = [file('SKILL.md', `---\nname: ${id}\ndescription: Demo skill. Use when testing.\n---\n\nBody.\n`), file('agileflow.skill.yaml', sidecar(ui))];
  return { source: `@agileflow/${id}`, version: '1.0.0', files, integrity: hashTree(files) };
}

const adapters = allAdapters();
const render = (id: string, pkg: FetchedPackage, preference: InteractionPreference = 'provider-default') =>
  renderSkill(pkg.files, { id, managed: true, activation: 'auto', interactionPreference: preference, adapters });
/** What a teammate's newer renderer would have written: different bytes for the same inputs. */
const newerRender = (id: string, pkg: FetchedPackage) =>
  render(id, pkg).map((f) => (f.path === 'SKILL.md' ? { ...f, content: Buffer.concat([f.content, Buffer.from('\nRendered by renderer 2.\n')]) } : f));

function setup(packages: Record<string, FetchedPackage>, preference: InteractionPreference = 'provider-default') {
  const root = tmpdir();
  const ctx = createContext({ cwd: root, homeDir: tmpdir(), cacheDir: path.join(root, '.cache'), configDir: path.join(root, '.config'), env: {} });
  const skills = Object.keys(packages)
    .map((id) => `  ${id}:\n    source: "@agileflow/${id}"\n    version: ^1.0.0\n`)
    .join('');
  fs.writeFileSync(path.join(root, 'agileflow.yaml'), `version: 1\nskills:\n${skills}interaction:\n  questionPreference: ${preference}\n`);
  const fetcher = {
    async fetchLocked(id: string) {
      return packages[id]!;
    },
    async resolve(id: string) {
      return packages[id]!;
    },
  } as unknown as Services['fetcher'];
  const services: Services = { ctx, fetcher, adapters };
  const scope = projectScope(root);
  return { root, services, scope };
}

/** Commit `files` for each skill and the lock entries, as a teammate's CLI left them. */
async function commit(scope: ReturnType<typeof projectScope>, entries: Record<string, { entry: LockEntry; files: TreeFile[] }>) {
  for (const [id, { files }] of Object.entries(entries)) await writeTree(path.join(scope.skillsDir, id), files);
  fs.writeFileSync(scope.lockPath, serializeLockfile({ version: 1, resolved: Object.fromEntries(Object.entries(entries).map(([id, e]) => [id, e.entry])) }));
}

const lockText = (scope: ReturnType<typeof projectScope>) => fs.readFileSync(scope.lockPath, 'utf8');
const skillText = (scope: ReturnType<typeof projectScope>, id: string) => fs.readFileSync(path.join(scope.skillsDir, id, 'SKILL.md'), 'utf8');

describe('recorded render: teammates on different renderers never ping-pong', () => {
  it('records the render inputs and renderer, and the lock is authoritative when they match', async () => {
    const pkg = pkgFor('demo');
    const { services, scope } = setup({ demo: pkg }, 'prefer');
    const files = render('demo', pkg, 'prefer');
    const entry = lockEntryFor('demo', pkg, files, 'auto', undefined, 'prefer');
    expect(entry).toMatchObject({ hashVersion: 2, renderer: RENDERER_REVISION, questionOverlay: 'prefer' });
    await commit(scope, { demo: { entry, files } });
    const before = lockText(scope);
    const report = await syncWorkspace(services, await loadWorkspace(scope));
    expect(report.rerendered).toEqual([]);
    expect(report.events).toEqual([]);
    expect(lockText(scope)).toBe(before);
  });

  it('a clean skill from a newer renderer is left as committed, with an info event', async () => {
    const pkg = pkgFor('demo');
    const { services, scope } = setup({ demo: pkg });
    const theirs = newerRender('demo', pkg);
    const entry = { ...lockEntryFor('demo', pkg, render('demo', pkg), 'auto', undefined, 'provider-default'), ...renderedRecordOf(theirs), renderer: RENDERER_REVISION + 1 };
    await commit(scope, { demo: { entry, files: theirs } });
    const before = lockText(scope);
    const report = await syncWorkspace(services, await loadWorkspace(scope));
    expect(report.rerendered).toEqual([]);
    expect(report.events).toEqual([
      expect.objectContaining({ level: 'info', skill: 'demo', message: expect.stringMatching(/renderer 2; this CLI uses renderer 1\. Left as committed; upgrade AgileFlow/) }),
    ]);
    expect(lockText(scope)).toBe(before);
    expect(skillText(scope, 'demo')).toContain('Rendered by renderer 2.');
    // `update` never downgrades a newer render.
    expect((await planUpdate(services, await loadWorkspace(scope))).items).toEqual([]);
  });

  it('a missing skill that this renderer cannot reproduce is restored without rewriting the lock, and check does not call it an edit', async () => {
    const pkg = pkgFor('demo');
    const { services, scope } = setup({ demo: pkg });
    const theirs = newerRender('demo', pkg);
    const entry = { ...lockEntryFor('demo', pkg, render('demo', pkg), 'auto', undefined, 'provider-default'), ...renderedRecordOf(theirs), renderer: RENDERER_REVISION + 1 };
    await commit(scope, { demo: { entry, files: theirs } });
    fs.rmSync(path.join(scope.skillsDir, 'demo'), { recursive: true });
    const before = lockText(scope);
    const report = await syncWorkspace(services, await loadWorkspace(scope));
    expect(report.materialized).toEqual(['demo']);
    expect(report.events).toEqual([expect.objectContaining({ level: 'info', message: expect.stringContaining("Restored with this CLI's renderer and agileflow.lock left unchanged") })]);
    expect(lockText(scope)).toBe(before);
    expect(skillText(scope, 'demo')).not.toContain('Rendered by renderer 2.');

    const check = await checkScope(services, scope);
    const skills = check.sections.find((s) => s.title === 'Skills')!.diagnostics;
    expect(skills.map((d) => d.message)).toContain('1 skill rendered by this CLI differ from agileflow.lock (not local edits)');
    expect(skills.map((d) => d.message)).toContain('no unexpected local modifications');
    // A second sync changes nothing either.
    await syncWorkspace(services, await loadWorkspace(scope));
    expect(lockText(scope)).toBe(before);
  });

  it('a missing legacy entry that still reproduces is restored with the lock untouched (no format upgrade)', async () => {
    const pkg = pkgFor('demo');
    const { services, scope } = setup({ demo: pkg });
    const files = render('demo', pkg);
    const legacy: LockEntry = {
      source: '@agileflow/demo',
      version: '1.0.0',
      integrity: pkg.integrity,
      path: '.agents/skills/demo',
      renderedHash: hashTree(normalizeTree(files)),
      activation: 'auto',
      ownership: 'managed',
    };
    await commit(scope, { demo: { entry: legacy, files } });
    fs.rmSync(path.join(scope.skillsDir, 'demo'), { recursive: true });
    const before = lockText(scope);
    expect(before).toMatch(/^version: 1$/m);
    const report = await syncWorkspace(services, await loadWorkspace(scope));
    expect(report.materialized).toEqual(['demo']);
    expect(report.events).toEqual([]);
    expect(lockText(scope)).toBe(before);
  });

  it('a clean legacy entry that no preference affects is not mistaken for a settings change', async () => {
    const quiet = pkgFor('quiet', 'none');
    const { services, scope } = setup({ quiet }, 'prefer');
    const files = render('quiet', quiet, 'prefer');
    const legacy: LockEntry = {
      source: '@agileflow/quiet',
      version: '1.0.0',
      integrity: quiet.integrity,
      path: '.agents/skills/quiet',
      renderedHash: hashTree(normalizeTree(files)),
      activation: 'auto',
      ownership: 'managed',
    };
    await commit(scope, { quiet: { entry: legacy, files } });
    const before = lockText(scope);
    const report = await syncWorkspace(services, await loadWorkspace(scope));
    expect(report.rerendered).toEqual([]);
    expect(report.events).toEqual([]);
    expect(lockText(scope)).toBe(before);
    expect((await planUpdate(services, await loadWorkspace(scope))).items).toEqual([]);
  });

  it('an older (unrecorded) renderer is listed by update as a re-render and adopted only there', async () => {
    const pkg = pkgFor('demo');
    const { services, scope } = setup({ demo: pkg });
    const theirs = newerRender('demo', pkg);
    const legacy: LockEntry = {
      source: '@agileflow/demo',
      version: '1.0.0',
      integrity: pkg.integrity,
      path: '.agents/skills/demo',
      renderedHash: hashTree(normalizeTree(theirs)),
      activation: 'auto',
      ownership: 'managed',
    };
    await commit(scope, { demo: { entry: legacy, files: theirs } });
    const before = lockText(scope);
    const sync = await syncWorkspace(services, await loadWorkspace(scope));
    expect(sync.events[0]).toMatchObject({ level: 'info', message: expect.stringContaining('renderer not recorded') });
    expect(lockText(scope)).toBe(before);

    const plan = await planUpdate(services, await loadWorkspace(scope));
    expect(plan.items).toEqual([expect.objectContaining({ id: 'demo', kind: 'rerender', status: 'clean', renderer: { to: RENDERER_REVISION } })]);
    const report = await updateWorkspace(services, await loadWorkspace(scope));
    expect(report.applied.map((i) => i.kind)).toEqual(['rerender']);
    const lock = await readLockfile(scope.lockPath);
    expect(lock!.version).toBe(2);
    expect(lock!.resolved.demo).toMatchObject({ renderer: RENDERER_REVISION, hashVersion: 2 });
    expect(skillText(scope, 'demo')).not.toContain('Rendered by renderer 2.');
  });

  it('a changed question preference is applied from the recorded inputs; skills it does not affect keep their entries', async () => {
    const demo = pkgFor('demo', 'optional');
    const quiet = pkgFor('quiet', 'none');
    const { root, services, scope } = setup({ demo, quiet }, 'prefer');
    const demoFiles = render('demo', demo, 'prefer');
    const quietFiles = render('quiet', quiet, 'prefer');
    await commit(scope, {
      demo: { entry: lockEntryFor('demo', demo, demoFiles, 'auto', undefined, 'prefer'), files: demoFiles },
      quiet: { entry: lockEntryFor('quiet', quiet, quietFiles, 'auto', undefined, 'prefer'), files: quietFiles },
    });
    const quietBefore = (await readLockfile(scope.lockPath))!.resolved.quiet;
    expect(quietBefore!.questionOverlay).toBeUndefined();
    fs.writeFileSync(path.join(root, 'agileflow.yaml'), fs.readFileSync(path.join(root, 'agileflow.yaml'), 'utf8').replace('prefer', 'minimize'));
    const report = await syncWorkspace(services, await loadWorkspace(scope));
    expect(report.rerendered).toEqual(['demo']);
    const lock = await readLockfile(scope.lockPath);
    expect(lock!.resolved.demo).toMatchObject({ questionOverlay: 'minimize' });
    expect(lock!.resolved.quiet).toEqual(quietBefore);
    expect(skillText(scope, 'demo')).toContain('make reasonable assumptions');
  });
});
