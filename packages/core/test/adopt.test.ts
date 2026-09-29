import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  applyAdoption,
  createContext,
  hashTree,
  lineSimilarity,
  loadWorkspace,
  matchUpstream,
  planAdoption,
  projectScope,
  readLockfile,
  renderSkill,
  writeTree,
  type FetchedPackage,
  type ProviderAdapter,
  type Services,
  type TreeFile,
} from '@agileflow/core';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-adopt-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const file = (p: string, content: string, executable = false): TreeFile => ({ path: p, content: Buffer.from(content), executable });
const skillMd = (name: string, body: string) =>
  `---\nname: ${name}\ndescription: Demo skill ${name}. Use when testing adoption.\n---\n\n# Demo\n\n${body}\n`;
const BODY = ['1. Read the repository.', '2. Make the change.', '3. Run the tests.', '4. Summarize.'].join('\n');

function pkg(version: string, body = BODY, extra: TreeFile[] = []): FetchedPackage {
  const files = [
    file('SKILL.md', skillMd('demo', body)),
    file('agileflow.skill.yaml', `schema: 1\npackage:\n  name: '@agileflow/demo'\n  version: ${version}\n`),
    file('evals/positive.yaml', 'name: positive\n'),
    ...extra,
  ];
  return { source: '@agileflow/demo', version, files, integrity: hashTree(files) };
}

/** A provider that links every skill into `dir` (like Claude's `.claude/skills`). */
function linkAdapter(id: string, dir: string): ProviderAdapter {
  return {
    id,
    displayName: id,
    support: 'adapted',
    detect: async () => ({ detected: true, evidence: [] }),
    inspect: async () => ({ skillLocations: [], exposure: 'linked', manualInvocation: 'semantic' }),
    planProjectSkillExposure: async (_pctx, skills) =>
      skills.map((s) => ({ kind: 'link' as const, provider: id, skillId: s.id, path: path.join(dir, s.id), target: s.dir })),
    planUserSkillExposure: async () => [],
    validate: async () => [],
    removeManagedArtifacts: async () => [],
  };
}

/** A fake registry holding versions of @agileflow/demo. */
function setup(versions: FetchedPackage[], adapters: (root: string) => ProviderAdapter[] = () => []) {
  const root = tmpdir();
  const ctx = createContext({ cwd: root, homeDir: tmpdir(), cacheDir: path.join(root, '.cache'), configDir: path.join(root, '.config'), env: {} });
  fs.writeFileSync(path.join(root, 'agileflow.yaml'), 'version: 1\nskills: {}\n');
  const fetcher = {
    async resolve(_id: string, spec: { source: string; version?: string }) {
      const hit = versions.find((p) => p.version === spec.version);
      if (!hit) throw new Error(`no ${spec.source}@${spec.version}`);
      return hit;
    },
  } as unknown as Services['fetcher'];
  const services = { ctx, fetcher, adapters: adapters(root) } as Services;
  const scope = projectScope(root);
  const upstream = async (id: string) =>
    id === 'demo' ? { source: '@agileflow/demo', versions: versions.map((v) => v.version) } : null;
  return { root, services, scope, upstream };
}

const managedRender = (p: FetchedPackage) =>
  renderSkill(p.files, { id: 'demo', managed: true, activation: 'auto', interactionPreference: 'provider-default', adapters: [] });

describe('matching unmanaged skills against published versions', () => {
  it('line similarity is a multiset overlap', () => {
    expect(lineSimilarity('a\nb\nc', 'a\nb\nc')).toBe(1);
    expect(lineSimilarity('a\nb', 'c\nd')).toBe(0);
    expect(lineSimilarity('a\na\nb', 'a\nb\nc')).toBeCloseTo(2 / 3);
  });

  it('finds the exact version for the published package, its render, and a CRLF checkout', () => {
    const v1 = pkg('1.0.0');
    const v2 = pkg('1.1.0', `${BODY}\n5. Done.`);
    const variants = (p: FetchedPackage) => [{ files: managedRender(p), activation: 'auto' as const, current: true }, { files: p.files, activation: 'auto' as const, current: false }];
    expect(matchUpstream(managedRender(v1), [v2, v1], variants)).toMatchObject({ match: 'exact', version: '1.0.0', current: true });
    expect(matchUpstream(v2.files, [v2, v1], variants)).toMatchObject({ match: 'exact', version: '1.1.0', current: false });
    const crlf = managedRender(v2).map((f) => ({ ...f, content: Buffer.from(f.content.toString('utf8').replace(/\n/g, '\r\n')) }));
    expect(matchUpstream(crlf, [v2, v1], variants)).toMatchObject({ match: 'exact', version: '1.1.0' });
  });

  it('reports edited copies as modified (closest version) and unrelated skills as unknown', () => {
    const v1 = pkg('1.0.0');
    const variants = (p: FetchedPackage) => [{ files: managedRender(p), activation: 'auto' as const, current: true }];
    const edited = [file('SKILL.md', skillMd('demo', `${BODY}\n5. Also update the changelog.`))];
    expect(matchUpstream(edited, [v1], variants)).toMatchObject({ match: 'modified', version: '1.0.0' });
    const unrelated = [file('SKILL.md', '---\nname: demo\ndescription: Something else entirely. Use when x.\n---\n\nTotally different.\nNothing shared.\nAt all.\nReally.\n')];
    expect(matchUpstream(unrelated, [v1], variants).match).toBe('unknown');
    expect(matchUpstream(edited, [], variants).match).toBe('unknown');
  });
});

describe('planAdoption and applyAdoption', () => {
  it('records a byte-identical copy as managed without rewriting it, and an edited one as locally owned', async () => {
    const v1 = pkg('1.0.0');
    const { root, services, scope, upstream } = setup([v1]);
    await writeTree(path.join(scope.skillsDir, 'demo'), managedRender(v1));
    await writeTree(path.join(scope.skillsDir, 'mine'), [file('SKILL.md', skillMd('mine', 'My own process.'))]);
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, { upstream });
    expect(plan.candidates.map((c) => [c.id, c.match, c.ownership, c.rewrite, c.move])).toEqual([
      ['demo', 'exact', 'managed', false, false],
      ['mine', 'unknown', 'local', false, false],
    ]);
    const before = fs.readFileSync(path.join(scope.skillsDir, 'demo', 'SKILL.md'), 'utf8');
    const result = await applyAdoption(services, ws, plan.candidates, { backupDir: path.join(root, 'backup') });
    expect(result.failed).toEqual([]);
    expect(result.backupDir).toBeNull();
    const lock = await readLockfile(scope.lockPath);
    expect(lock!.resolved.demo).toMatchObject({ source: '@agileflow/demo', version: '1.0.0', ownership: 'managed', integrity: v1.integrity });
    expect(lock!.resolved.mine).toMatchObject({ source: '.agents/skills/mine', version: 'local', ownership: 'local' });
    const config = YAML.parse(fs.readFileSync(path.join(root, 'agileflow.yaml'), 'utf8'));
    expect(config.skills.demo).toEqual({ source: '@agileflow/demo', version: '^1.0.0' });
    expect(config.skills.mine).toEqual({ source: '.agents/skills/mine' });
    expect(fs.readFileSync(path.join(scope.skillsDir, 'demo', 'SKILL.md'), 'utf8')).toBe(before);
  });

  it('keeps local edits, notes the closest version as provenance, and never rewrites the files', async () => {
    const v1 = pkg('1.0.0');
    const { root, services, scope, upstream } = setup([v1]);
    const edited = [file('SKILL.md', skillMd('demo', `${BODY}\n5. Our extra step.`)), file('notes.md', 'mine')];
    await writeTree(path.join(scope.skillsDir, 'demo'), edited);
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, { upstream });
    expect(plan.candidates[0]).toMatchObject({ id: 'demo', match: 'modified', version: '1.0.0', ownership: 'local' });
    await applyAdoption(services, ws, plan.candidates, { backupDir: path.join(root, 'backup') });
    const config = YAML.parse(fs.readFileSync(path.join(root, 'agileflow.yaml'), 'utf8'));
    expect(config.skills.demo).toEqual({ source: '.agents/skills/demo', provenance: { forkedFrom: '@agileflow/demo@1.0.0' } });
    const disk = fs.readdirSync(path.join(scope.skillsDir, 'demo')).sort();
    expect(disk).toEqual(['SKILL.md', 'notes.md']);
    expect(fs.readFileSync(path.join(scope.skillsDir, 'demo', 'SKILL.md'), 'utf8')).toBe(edited[0]!.content.toString());
  });

  it('re-renders an exact copy of the published package (backed up) so it is managed', async () => {
    const v1 = pkg('1.0.0');
    const { root, services, scope, upstream } = setup([v1]);
    await writeTree(path.join(scope.skillsDir, 'demo'), v1.files);
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, { upstream });
    expect(plan.candidates[0]).toMatchObject({ match: 'exact', ownership: 'managed', rewrite: true });
    const result = await applyAdoption(services, ws, plan.candidates, { backupDir: path.join(root, 'backup') });
    expect(result.backupDir).toBe(path.join(root, 'backup'));
    expect(fs.existsSync(path.join(root, 'backup', 'agents', 'skills', 'demo', 'evals', 'positive.yaml'))).toBe(true);
    expect(fs.readFileSync(path.join(scope.skillsDir, 'demo', 'SKILL.md'), 'utf8')).toContain('Managed by AgileFlow');
    expect(fs.existsSync(path.join(scope.skillsDir, 'demo', 'evals'))).toBe(false);
  });

  it('moves a provider-only skill into .agents/skills with a backup, and blocks conflicting copies', async () => {
    const { root, services, scope, upstream } = setup([], (r) => [
      linkAdapter('claude', path.join(r, '.claude', 'skills')),
      linkAdapter('windsurf', path.join(r, '.windsurf', 'skills')),
    ]);
    const claude = path.join(root, '.claude', 'skills');
    const windsurf = path.join(root, '.windsurf', 'skills');
    await writeTree(path.join(claude, 'mine'), [file('SKILL.md', skillMd('mine', 'Mine.'))]);
    await writeTree(path.join(claude, 'split'), [file('SKILL.md', skillMd('split', 'Version A.'))]);
    await writeTree(path.join(windsurf, 'split'), [file('SKILL.md', skillMd('split', 'Version B.'))]);
    await writeTree(path.join(windsurf, 'mine'), [file('SKILL.md', skillMd('mine', 'Mine.'))]);
    const providerDirs = [
      { provider: 'claude', dir: claude, label: '.claude/skills', linked: true },
      { provider: 'windsurf', dir: windsurf, label: '.windsurf/skills', linked: true },
    ];
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, { upstream, providerDirs });
    const byId = Object.fromEntries(plan.candidates.map((c) => [c.id, c]));
    expect(byId.mine).toMatchObject({ location: 'provider', provider: 'claude', move: true, ownership: 'local' });
    expect(byId.mine!.replaceCopies.map((c) => c.label)).toEqual(['.windsurf/skills/mine']);
    expect(byId.split!.blocked).toMatch(/different copies/);

    const result = await applyAdoption(services, ws, plan.candidates, { backupDir: path.join(root, 'backup') });
    expect(result.adopted.map((a) => a.id)).toEqual(['mine']);
    expect(result.failed).toEqual([]);
    expect(fs.readFileSync(path.join(scope.skillsDir, 'mine', 'SKILL.md'), 'utf8')).toContain('Mine.');
    // Both provider paths are now links to the canonical copy.
    expect(fs.lstatSync(path.join(claude, 'mine')).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(windsurf, 'mine')).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(claude, 'mine', 'SKILL.md'), 'utf8')).toContain('Mine.');
    expect(fs.existsSync(path.join(root, 'backup', 'claude', 'skills', 'mine', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'backup', 'windsurf', 'skills', 'mine', 'SKILL.md'))).toBe(true);
    // Blocked skills are left exactly where they were.
    expect(fs.existsSync(path.join(claude, 'split', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(windsurf, 'split', 'SKILL.md'))).toBe(true);
  });

  it('never moves a copy out of a provider that gets no link (disabled or not detected)', async () => {
    const { root, services, scope, upstream } = setup([], (r) => [linkAdapter('claude', path.join(r, '.claude', 'skills'))]);
    const claude = path.join(root, '.claude', 'skills');
    const cursor = path.join(root, '.cursor', 'skills');
    await writeTree(path.join(cursor, 'helper'), [file('SKILL.md', skillMd('helper', 'Help.'))]);
    await writeTree(path.join(claude, 'shared'), [file('SKILL.md', skillMd('shared', 'Shared.'))]);
    await writeTree(path.join(cursor, 'shared'), [file('SKILL.md', skillMd('shared', 'Shared.'))]);
    const providerDirs = [
      { provider: 'claude', dir: claude, label: '.claude/skills', linked: true },
      { provider: 'cursor', dir: cursor, label: '.cursor/skills', linked: false },
    ];
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, { upstream, providerDirs });
    const byId = Object.fromEntries(plan.candidates.map((c) => [c.id, c]));
    expect(byId.helper!.blocked).toMatch(/cursor is disabled or not detected/);
    // The linked copy moves; the identical copy in the unlinked provider stays where it is.
    expect(byId.shared).toMatchObject({ provider: 'claude', move: true });
    expect(byId.shared!.replaceCopies).toEqual([]);
    expect(byId.shared!.keptCopies.map((c) => c.label)).toEqual(['.cursor/skills/shared']);
    const result = await applyAdoption(services, ws, plan.candidates, { backupDir: path.join(root, 'backup') });
    expect(result.adopted.map((a) => a.id)).toEqual(['shared']);
    expect(fs.readFileSync(path.join(cursor, 'helper', 'SKILL.md'), 'utf8')).toContain('Help.');
    expect(fs.lstatSync(path.join(cursor, 'shared')).isDirectory()).toBe(true);
    expect(fs.lstatSync(path.join(claude, 'shared')).isSymbolicLink()).toBe(true);
  });

  it('restores a moved provider copy when sync created no link for it', async () => {
    // The provider claims to be linked, but no adapter creates the link.
    const { root, services, scope, upstream } = setup([]);
    const claude = path.join(root, '.claude', 'skills');
    await writeTree(path.join(claude, 'mine'), [file('SKILL.md', skillMd('mine', 'Mine.'))]);
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, { upstream, providerDirs: [{ provider: 'claude', dir: claude, label: '.claude/skills', linked: true }] });
    const result = await applyAdoption(services, ws, plan.candidates, { backupDir: path.join(root, 'backup') });
    expect(result.failed[0]!.error).toMatch(/no provider link was created at \.claude\/skills\/mine; restored the original copy/);
    expect(fs.readFileSync(path.join(claude, 'mine', 'SKILL.md'), 'utf8')).toContain('Mine.');
    expect(fs.existsSync(path.join(scope.skillsDir, 'mine', 'SKILL.md'))).toBe(true);
  });

  it('leaves a provider copy whole when it cannot be moved into the backup', async () => {
    const { root, services, scope, upstream } = setup([], (r) => [linkAdapter('claude', path.join(r, '.claude', 'skills'))]);
    const claude = path.join(root, '.claude', 'skills');
    await writeTree(path.join(claude, 'mine'), [file('SKILL.md', skillMd('mine', 'Mine.')), file('refs/a.md', 'a')]);
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, { upstream, providerDirs: [{ provider: 'claude', dir: claude, label: '.claude/skills', linked: true }] });
    const locked = path.join(root, 'locked');
    fs.mkdirSync(locked);
    fs.chmodSync(locked, 0o500);
    try {
      const result = await applyAdoption(services, ws, plan.candidates, { backupDir: path.join(locked, 'backup') });
      expect(result.failed[0]!.error).toMatch(/\.claude\/skills\/mine was left in place/);
    } finally {
      fs.chmodSync(locked, 0o700);
    }
    expect(fs.readdirSync(path.join(claude, 'mine')).sort()).toEqual(['SKILL.md', 'refs']);
    expect(fs.readFileSync(path.join(claude, 'mine', 'refs', 'a.md'), 'utf8')).toBe('a');
  });

  it('treats a copy that differs only in an executable bit as different where bits are tracked', async () => {
    const v1 = pkg('1.0.0', BODY, [file('scripts/run.sh', '#!/bin/sh\necho hi\n', true)]);
    const { services, scope, upstream } = setup([v1]);
    const noExec = managedRender(v1).map((f) => ({ ...f, executable: false }));
    await writeTree(path.join(scope.skillsDir, 'demo'), noExec);
    const plan = await planAdoption(services, await loadWorkspace(scope), { upstream });
    // tmp dirs are not Git repositories, so bits are tracked on POSIX.
    if (process.platform !== 'win32') expect(plan.candidates[0]).toMatchObject({ match: 'modified', ownership: 'local' });
    expect(matchUpstream(noExec, [v1], (p) => [{ files: managedRender(p), activation: 'auto', current: true }], { execBits: false }).match).toBe('exact');
    expect(matchUpstream(noExec, [v1], (p) => [{ files: managedRender(p), activation: 'auto', current: true }], { execBits: true }).match).toBe('modified');
  });

  it('refuses to adopt a copy that changed after it was reviewed', async () => {
    const { root, services, scope, upstream } = setup([]);
    await writeTree(path.join(scope.skillsDir, 'mine'), [file('SKILL.md', skillMd('mine', 'Mine.'))]);
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, { upstream });
    fs.appendFileSync(path.join(scope.skillsDir, 'mine', 'SKILL.md'), 'edited\n');
    const result = await applyAdoption(services, ws, plan.candidates, { backupDir: path.join(root, 'backup') });
    expect(result.adopted).toEqual([]);
    expect(result.failed[0]!.error).toMatch(/changed since it was reviewed/);
    expect(await readLockfile(scope.lockPath)).toBeNull();
  });

  it('records locally owned when the registry cannot be reached, and reports ids that are not unmanaged', async () => {
    const v1 = pkg('1.0.0');
    const { services, scope } = setup([v1]);
    await writeTree(path.join(scope.skillsDir, 'demo'), managedRender(v1));
    const ws = await loadWorkspace(scope);
    const plan = await planAdoption(services, ws, {
      ids: ['demo', 'nope'],
      upstream: async () => {
        throw new Error('offline');
      },
    });
    expect(plan.notFound).toEqual(['nope']);
    expect(plan.candidates[0]).toMatchObject({ id: 'demo', upstreamChecked: false, ownership: 'local', match: 'unknown' });
    expect(plan.candidates[0]!.notes.join(' ')).toMatch(/not compared with the registry \(offline\)/);
  });

  it('blocks invalid skills', async () => {
    const { services, scope, upstream } = setup([]);
    await writeTree(path.join(scope.skillsDir, 'broken'), [file('SKILL.md', 'no frontmatter\n')]);
    const plan = await planAdoption(services, await loadWorkspace(scope), { upstream });
    expect(plan.candidates[0]!.blocked).toMatch(/SKILL.md is invalid/);
  });
});
