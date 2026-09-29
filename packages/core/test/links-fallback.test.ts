import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyChanges,
  classifyEntry,
  MIRROR_MARKER,
  readMirrorMarker,
  readTree,
  hashTree,
  writeTree,
  type LinkDeps,
  type PlannedChange,
  type TreeFile,
} from '@agileflow/core';
import { claudeAdapter } from '@agileflow/providers';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-links-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const file = (p: string, content: string, executable = false): TreeFile => ({ path: p, content: Buffer.from(content), executable });
const SKILL = '---\nname: demo\ndescription: Demo skill. Use when testing.\n---\n\nBody.\nMore.\n';

async function project() {
  const root = tmpdir();
  const canonical = path.join(root, '.agents/skills/demo');
  await writeTree(canonical, [file('SKILL.md', SKILL), file('references/a.md', '# A\n')]);
  const entry = path.join(root, '.claude/skills/demo');
  const change: PlannedChange = { kind: 'link', provider: 'claude', skillId: 'demo', path: entry, target: canonical };
  return { root, canonical, entry, change };
}

const eperm = (syscall: string) => Object.assign(new Error(`EPERM: operation not permitted, ${syscall}`), { code: 'EPERM' });

/** A `symlink` that records every attempt and fails the listed link types. */
function recordingSymlink(fail: Array<'dir' | 'junction'>) {
  const calls: Array<{ type: 'dir' | 'junction'; target: string }> = [];
  const deps: Partial<LinkDeps> = {
    async symlink(target, linkPath, type) {
      calls.push({ type, target });
      if (fail.includes(type)) throw eperm('symlink');
      // Off Windows a junction cannot be made; an absolute symlink is its equivalent.
      await fs.promises.symlink(target, linkPath, process.platform === 'win32' ? type : 'dir');
    },
  };
  return { calls, deps };
}

describe('link fallback: symlink -> junction -> mirror', () => {
  it('Windows without symlink privilege: EPERM on symlink falls back to a junction with an absolute target', async () => {
    const { root, canonical, entry, change } = await project();
    const { calls, deps } = recordingSymlink(['dir']);
    const [result] = await applyChanges([change], { root, env: {}, platform: 'win32', deps });
    expect(calls.map((c) => c.type)).toEqual(['dir', 'junction']);
    expect(calls[1]!.target).toBe(path.resolve(canonical));
    expect(result).toMatchObject({ outcome: 'done', linkType: 'junction' });
    expect(path.isAbsolute(fs.readlinkSync(entry))).toBe(true);
    expect(await classifyEntry(entry, canonical, { platform: 'win32' })).toEqual({ state: 'linked', linkType: 'junction' });
  });

  it('when junctions fail too, writes a marked mirror', async () => {
    const { root, canonical, entry, change } = await project();
    const { calls, deps } = recordingSymlink(['dir', 'junction']);
    const [result] = await applyChanges([change], { root, env: {}, platform: 'win32', deps });
    expect(calls.map((c) => c.type)).toEqual(['dir', 'junction']);
    expect(result).toMatchObject({ outcome: 'done', linkType: 'mirror' });
    expect(fs.lstatSync(entry).isDirectory()).toBe(true);
    expect(await readMirrorMarker(entry)).toMatchObject({ generatedBy: 'agileflow', provider: 'claude', source: '.agents/skills/demo', hashVersion: 2 });
    expect(await classifyEntry(entry, canonical)).toMatchObject({ state: 'mirror', modified: false });
  });

  it('POSIX tries symlink then mirror (no junctions), and never falls back over something that appeared', async () => {
    const { root, change } = await project();
    const { calls, deps } = recordingSymlink(['dir']);
    const [result] = await applyChanges([change], { root, env: {}, platform: 'linux', deps });
    expect(calls.map((c) => c.type)).toEqual(['dir']);
    expect(result!.linkType).toBe('mirror');

    const again = await project();
    const exists: Partial<LinkDeps> = {
      async symlink() {
        throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      },
    };
    const [blocked] = await applyChanges([again.change], { root: again.root, env: {}, platform: 'win32', deps: exists });
    expect(blocked).toMatchObject({ outcome: 'failed' });
    expect(fs.existsSync(again.entry)).toBe(false);
  });

  it('a junction left by a moved project is ours: sync plans a relink and applying it repairs the link', async () => {
    const { root, canonical, entry } = await project();
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    // Absolute target inside the project's old location, which no longer exists.
    fs.symlinkSync(path.join(tmpdir(), 'moved-away', '.agents', 'skills', 'demo'), entry, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await classifyEntry(entry, canonical)).toEqual({ state: 'dangling-ours', stale: true });
    const pctx = { ctx: { cwd: root, homeDir: tmpdir(), configDir: root, cacheDir: root, env: {}, platform: process.platform }, scope: { kind: 'project', root, skillsDir: path.join(root, '.agents/skills') }, settings: undefined } as never;
    const plan = await claudeAdapter.planProjectSkillExposure(pctx, [{ id: 'demo', dir: canonical, activation: 'auto' }]);
    expect(plan).toEqual([expect.objectContaining({ kind: 'link', path: entry })]);
    const [result] = await applyChanges(plan, { root, env: {}, platform: process.platform });
    expect(result).toMatchObject({ outcome: 'done', linkType: expect.stringMatching(/^(symlink|junction)$/) });
    expect((await classifyEntry(entry, canonical)).state).toBe('linked');
  });
});

describe('mirrors across line-ending checkouts', () => {
  async function mirrored() {
    const p = await project();
    await applyChanges([p.change], { root: p.root, env: { AGILEFLOW_LINK_MODE: 'mirror' }, platform: 'win32' });
    return p;
  }
  const toCrlf = (dir: string) => {
    for (const rel of ['SKILL.md', 'references/a.md']) {
      const f = path.join(dir, rel);
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n/g, '\r\n'));
    }
  };

  it('a committed mirror checked out with CRLF is neither edited nor out of date', async () => {
    const { root, canonical, entry } = await mirrored();
    toCrlf(entry);
    toCrlf(canonical);
    expect(await classifyEntry(entry, canonical)).toMatchObject({ state: 'mirror', modified: false });
    const pctx = { ctx: { cwd: root, homeDir: tmpdir(), configDir: root, cacheDir: root, env: {}, platform: process.platform }, scope: { kind: 'project', root, skillsDir: path.join(root, '.agents/skills') }, settings: undefined } as never;
    expect(await claudeAdapter.planProjectSkillExposure(pctx, [{ id: 'demo', dir: canonical, activation: 'auto' }])).toEqual([]);
  });

  it('a partial CRLF edit of a mirror counts as a direct edit', async () => {
    const { canonical, entry } = await mirrored();
    const f = path.join(entry, 'SKILL.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Body.\n', 'Body.\r\n'));
    expect(await classifyEntry(entry, canonical)).toMatchObject({ state: 'mirror', modified: true });
  });

  it('markers from older CLIs (exact hash, no hashVersion) still match after a CRLF checkout', async () => {
    const { canonical, entry } = await mirrored();
    const marker = JSON.parse(fs.readFileSync(path.join(entry, MIRROR_MARKER), 'utf8'));
    delete marker.hashVersion;
    marker.hash = hashTree(await readTree(entry, { exclude: (rel) => rel === MIRROR_MARKER }));
    fs.writeFileSync(path.join(entry, MIRROR_MARKER), JSON.stringify(marker));
    expect(await classifyEntry(entry, canonical)).toMatchObject({ state: 'mirror', modified: false });
    toCrlf(entry);
    expect(await classifyEntry(entry, canonical)).toMatchObject({ state: 'mirror', modified: false });
  });
});

describe('removal re-checks ownership', () => {
  it('removes only what is still AgileFlow\'s when the change is applied', async () => {
    const { root, canonical, entry, change } = await project();
    await applyChanges([change], { root, env: {}, platform: process.platform });
    const remove: PlannedChange = { kind: 'remove', provider: 'claude', skillId: 'demo', path: entry, reason: 'AgileFlow link' };
    // Planned while it was our link; the user replaced it with their own skill since.
    fs.unlinkSync(entry);
    await writeTree(entry, [file('SKILL.md', SKILL.replace('Body.', 'Mine.'))]);
    const [skipped] = await applyChanges([remove], { root, env: {}, platform: process.platform });
    expect(skipped).toMatchObject({ outcome: 'skipped', message: expect.stringContaining('changed since AgileFlow planned to remove it') });
    expect(fs.readFileSync(path.join(entry, 'SKILL.md'), 'utf8')).toContain('Mine.');

    // A mirror edited after planning stays too; an unedited one and our link go.
    fs.rmSync(entry, { recursive: true });
    await applyChanges([change], { root, env: { AGILEFLOW_LINK_MODE: 'mirror' }, platform: 'win32' });
    fs.appendFileSync(path.join(entry, 'SKILL.md'), 'edit\n');
    expect((await applyChanges([remove], { root, env: {}, platform: process.platform }))[0]!.outcome).toBe('skipped');
    fs.rmSync(entry, { recursive: true });
    await applyChanges([change], { root, env: {}, platform: process.platform });
    expect((await applyChanges([remove], { root, env: {}, platform: process.platform }))[0]!.outcome).toBe('done');
    expect(fs.existsSync(entry)).toBe(false);
    expect(fs.existsSync(path.join(canonical, 'SKILL.md'))).toBe(true);
  });
});
