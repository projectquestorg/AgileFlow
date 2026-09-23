import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { copyTree, createContext, hashTree } from '@agileflow/core';
import { buildRegistry, createFetcher, decodeBundle, encodeBundle } from '@agileflow/registry';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-reg-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function setup() {
  const root = tmpdir();
  const skills = path.join(root, 'skills');
  const out = path.join(root, 'registry');
  await copyTree(path.join(REPO, 'skills'), skills);
  const res = await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out });
  expect(res.errors).toEqual([]);
  const ctx = createContext({ cwd: root, homeDir: root, cacheDir: path.join(root, 'cache'), env: { AGILEFLOW_REGISTRY: out } });
  return { root, skills, out, ctx, fetcher: createFetcher({ ctx }) };
}

function bump(skills: string, id: string, version: string, suffix: string) {
  const dir = path.join(skills, id);
  fs.appendFileSync(path.join(dir, 'SKILL.md'), suffix);
  const sidecar = YAML.parse(fs.readFileSync(path.join(dir, 'agileflow.skill.yaml'), 'utf8'));
  sidecar.package.version = version;
  fs.writeFileSync(path.join(dir, 'agileflow.skill.yaml'), YAML.stringify(sidecar));
}

describe('bundles', () => {
  it('round-trips files and exec bits', () => {
    const files = [
      { path: 'SKILL.md', content: Buffer.from('a'), executable: false },
      { path: 'scripts/x.sh', content: Buffer.from('b'), executable: true },
    ];
    const decoded = decodeBundle(encodeBundle('@a/b', '1.0.0', files));
    expect(hashTree(decoded.tree)).toBe(hashTree(files));
    const evil = JSON.stringify({ format: 'agileflow-skill-bundle', formatVersion: 1, name: 'x', version: '1', files: [{ path: '../x', mode: '644', content: '' }] });
    expect(() => decodeBundle(evil)).toThrow(/Unsafe path/);
  });
});

describe('static registry', () => {
  it('builds the official catalog deterministically with the /v1 layout', async () => {
    const { out, skills } = await setup();
    for (const rel of ['v1/skills/index.json', 'v1/skills/@agileflow/filing-pr/index.json', 'v1/skills/@agileflow/filing-pr/1.0.0.json', 'v1/packs/@agileflow/github.json', 'packages/@agileflow/filing-pr/1.0.0.json']) {
      expect(fs.existsSync(path.join(out, rel)), rel).toBe(true);
    }
    const index = JSON.parse(fs.readFileSync(path.join(out, 'v1/skills/index.json'), 'utf8'));
    expect(index.skills.map((s: { name: string }) => s.name)).toHaveLength(9);
    const again = await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out, check: true });
    expect(again.outOfDate).toEqual([]);
  });

  it('keeps old versions and refuses to republish a version with different content', async () => {
    const { out, skills } = await setup();
    bump(skills, 'filing-pr', '1.1.0', '\nnew\n');
    expect((await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out })).errors).toEqual([]);
    const doc = JSON.parse(fs.readFileSync(path.join(out, 'v1/skills/@agileflow/filing-pr/index.json'), 'utf8'));
    expect(Object.keys(doc.versions)).toEqual(['1.0.0', '1.1.0']);
    expect(doc.latest).toBe('1.1.0');
    fs.appendFileSync(path.join(skills, 'filing-pr/SKILL.md'), 'sneaky\n');
    const res = await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out });
    expect(res.errors[0]).toContain('already published with different content');
  });

  it('validates packs against published skills', async () => {
    const { root, skills } = await setup();
    const packs = path.join(root, 'packs');
    fs.mkdirSync(packs);
    fs.writeFileSync(path.join(packs, 'bad.yaml'), 'name: bad\nversion: 1\nskills:\n  - "@agileflow/nope@^1"\n');
    const res = await buildRegistry({ skillsDir: skills, packsDir: packs, outDir: path.join(root, 'r2') });
    expect(res.errors[0]).toContain('unknown skill @agileflow/nope');
  });
});

describe('fetcher', () => {
  it('resolves ranges, caches packages, and works offline for locked versions', async () => {
    const { out, skills, fetcher, ctx, root } = await setup();
    bump(skills, 'filing-pr', '1.1.0', '\nnew\n');
    await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out });
    const latest = await fetcher.resolve('filing-pr', { source: '@agileflow/filing-pr', version: '^1' }, root);
    expect(latest.version).toBe('1.1.0');
    const pinned = await fetcher.resolve('filing-pr', { source: '@agileflow/filing-pr', version: '1.0.0' }, root);
    expect(pinned.version).toBe('1.0.0');
    await expect(fetcher.resolve('filing-pr', { source: '@agileflow/filing-pr', version: '^9' }, root)).rejects.toThrow(/No version/);
    await expect(fetcher.resolve('x', { source: '@agileflow/does-not-exist' }, root)).rejects.toThrow(/not found/);

    fs.rmSync(out, { recursive: true });
    const offline = createFetcher({ ctx });
    const locked = await offline.fetchLocked(
      'filing-pr',
      { source: '@agileflow/filing-pr', version: '1.0.0', integrity: pinned.integrity, path: '.agents/skills/filing-pr', activation: 'auto', ownership: 'managed' },
      root,
    );
    expect(locked.integrity).toBe(pinned.integrity);
  });

  it('detects tampered packages', async () => {
    const { out, fetcher, root } = await setup();
    const bundlePath = path.join(out, 'packages/@agileflow/filing-pr/1.0.0.json');
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    bundle.files[0].content = Buffer.from('tampered').toString('base64');
    fs.writeFileSync(bundlePath, JSON.stringify(bundle));
    await expect(fetcher.resolve('filing-pr', { source: '@agileflow/filing-pr' }, root)).rejects.toThrow(/Integrity mismatch/);
  });

  it('finds packs and skills in the registry', async () => {
    const { fetcher } = await setup();
    expect((await fetcher.getPack('core'))!.skills).toContain('@agileflow/diagnosing-bugs@^1');
    expect(await fetcher.getPack('nope')).toBeNull();
    expect(await fetcher.hasSkill('@agileflow/diagnosing-bugs')).toBe(true);
    expect((await fetcher.listSkills()).map((s) => s.name)).toContain('@agileflow/babysitting-pr');
  });

  it('reports an unreachable remote registry clearly', async () => {
    const ctx = createContext({ cwd: tmpdir(), homeDir: tmpdir(), cacheDir: tmpdir(), env: { AGILEFLOW_REGISTRY: 'http://127.0.0.1:9/registry' } });
    await expect(createFetcher({ ctx }).listSkills()).rejects.toThrow(/Could not reach the skill registry/);
  });
});
