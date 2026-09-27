import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { copyTree, createContext, hashTree } from '@agileflow/core';
import http from 'node:http';
import { buildRegistry, createFetcher, decodeBundle, encodeBundle, OFFICIAL_PINS, RegistryClient } from '@agileflow/registry';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
/** Current published version of the skill these tests exercise. */
const VC = YAML.parse(fs.readFileSync(path.join(REPO, 'skills/verifying-changes/agileflow.skill.yaml'), 'utf8')).package.version as string;
const SKILL_COUNT = fs.readdirSync(path.join(REPO, 'skills')).filter((d) => !d.startsWith('.')).length;
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
    for (const rel of ['v1/skills/index.json', 'v1/skills/@agileflow/verifying-changes/index.json', `v1/skills/@agileflow/verifying-changes/${VC}.json`, 'v1/packs/@agileflow/github.json', `packages/@agileflow/verifying-changes/${VC}.json`]) {
      expect(fs.existsSync(path.join(out, rel)), rel).toBe(true);
    }
    const index = JSON.parse(fs.readFileSync(path.join(out, 'v1/skills/index.json'), 'utf8'));
    expect(index.skills.map((s: { name: string }) => s.name)).toHaveLength(SKILL_COUNT);
    const again = await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out, check: true });
    expect(again.outOfDate).toEqual([]);
  });

  it('keeps old versions and refuses to republish a version with different content', async () => {
    const { out, skills } = await setup();
    bump(skills, 'verifying-changes', '1.1.0', '\nnew\n');
    expect((await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out })).errors).toEqual([]);
    const doc = JSON.parse(fs.readFileSync(path.join(out, 'v1/skills/@agileflow/verifying-changes/index.json'), 'utf8'));
    expect(Object.keys(doc.versions)).toEqual([VC, '1.1.0']);
    expect(doc.latest).toBe('1.1.0');
    fs.appendFileSync(path.join(skills, 'verifying-changes/SKILL.md'), 'sneaky\n');
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

describe('append-only history', () => {
  it('detects edits to previously published versions and removed history', async () => {
    const { out, skills } = await setup();
    bump(skills, 'verifying-changes', '1.1.0', '\nnew\n');
    expect((await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out })).errors).toEqual([]);
    const old = path.join(out, `packages/@agileflow/verifying-changes/${VC}.json`);
    const original = fs.readFileSync(old, 'utf8');
    const bundle = JSON.parse(original);
    bundle.files[0].content = Buffer.from('tampered').toString('base64');
    fs.writeFileSync(old, JSON.stringify(bundle));
    const check = await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out, check: true });
    expect(check.errors.join('\n')).toContain(`@agileflow/verifying-changes@${VC}: bundle does not match its published integrity`);
    fs.writeFileSync(old, original);
    fs.rmSync(path.join(out, 'v1/skills/@agileflow/verifying-changes'), { recursive: true });
    const removed = await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out, check: true });
    expect(removed.errors.join('\n')).toMatch(/in the registry manifest but its version was removed/);
  });

  it('refuses hidden files and non-canonical versions in packages', async () => {
    const { root, skills } = await setup();
    fs.writeFileSync(path.join(skills, 'verifying-changes/.env'), 'SECRET=1\n');
    const res = await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: path.join(root, 'r3') });
    expect(res.errors.join('\n')).toContain('verifying-changes: .env: hidden files are not published');
    fs.rmSync(path.join(skills, 'verifying-changes/.env'));
    bump(skills, 'verifying-changes', 'v2.0.0', '');
    const res2 = await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: path.join(root, 'r4') });
    expect(res2.errors.join('\n')).toContain('must be canonical semver');
  });

  it('writes a manifest of every published version and a matching pins module', async () => {
    const { out, skills, root } = await setup();
    const pins = path.join(root, 'pins.ts');
    await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out, pinsFile: pins });
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'v1/manifest.json'), 'utf8'));
    expect(Object.keys(manifest.packages)).toHaveLength(SKILL_COUNT);
    expect(fs.readFileSync(pins, 'utf8')).toContain(manifest.packages['@agileflow/verifying-changes'][VC]);
  });
});

describe('fetcher', () => {
  it('resolves ranges, caches packages, and works offline for locked versions', async () => {
    const { out, skills, fetcher, ctx, root } = await setup();
    bump(skills, 'verifying-changes', '1.1.0', '\nnew\n');
    await buildRegistry({ skillsDir: skills, packsDir: path.join(REPO, 'packs'), outDir: out });
    const latest = await fetcher.resolve('verifying-changes', { source: '@agileflow/verifying-changes', version: '^1' }, root);
    expect(latest.version).toBe('1.1.0');
    const pinned = await fetcher.resolve('verifying-changes', { source: '@agileflow/verifying-changes', version: VC }, root);
    expect(pinned.version).toBe(VC);
    await expect(fetcher.resolve('verifying-changes', { source: '@agileflow/verifying-changes', version: '^9' }, root)).rejects.toThrow(/No version/);
    await expect(fetcher.resolve('x', { source: '@agileflow/does-not-exist' }, root)).rejects.toThrow(/not found/);

    fs.rmSync(out, { recursive: true });
    const offline = createFetcher({ ctx });
    const locked = await offline.fetchLocked(
      'verifying-changes',
      { source: '@agileflow/verifying-changes', version: VC, integrity: pinned.integrity, path: '.agents/skills/verifying-changes', activation: 'auto', ownership: 'managed' },
      root,
    );
    expect(locked.integrity).toBe(pinned.integrity);
  });

  it('detects tampered packages', async () => {
    const { out, fetcher, root } = await setup();
    const bundlePath = path.join(out, `packages/@agileflow/verifying-changes/${VC}.json`);
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    bundle.files[0].content = Buffer.from('tampered').toString('base64');
    fs.writeFileSync(bundlePath, JSON.stringify(bundle));
    await expect(fetcher.resolve('verifying-changes', { source: '@agileflow/verifying-changes' }, root)).rejects.toThrow(/Integrity mismatch/);
  });

  it('finds packs and skills in the registry', async () => {
    const { fetcher } = await setup();
    expect((await fetcher.getPack('core'))!.skills).toContain('@agileflow/diagnosing-bugs@^1');
    expect(await fetcher.getPack('nope')).toBeNull();
    expect(await fetcher.hasSkill('@agileflow/diagnosing-bugs')).toBe(true);
    expect((await fetcher.listSkills()).map((s) => s.name)).toContain('@agileflow/babysitting-pr');
  });

  it('refuses plain-http registries except on loopback or when explicitly allowed', async () => {
    const mk = (env: Record<string, string>) => createContext({ cwd: tmpdir(), homeDir: tmpdir(), cacheDir: tmpdir(), env });
    expect(() => createFetcher({ ctx: mk({ AGILEFLOW_REGISTRY: 'http://registry.example.com/r' }) })).toThrow(/Refusing plain-http registry/);
    expect(() => createFetcher({ ctx: mk({ AGILEFLOW_REGISTRY: 'http://localhost:8080/r' }) })).not.toThrow();
    expect(() =>
      createFetcher({ ctx: mk({ AGILEFLOW_REGISTRY: 'http://registry.example.com/r', AGILEFLOW_ALLOW_INSECURE: '1' }) }),
    ).not.toThrow();
  });

  it('validates registry documents and cross-checks names and versions', async () => {
    const { out, fetcher, root } = await setup();
    const indexPath = path.join(out, 'v1/skills/@agileflow/verifying-changes/index.json');
    const doc = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    // A version key pointing at another version's metadata is refused (not silently installed).
    doc.versions['9.9.9'] = doc.versions[VC];
    fs.writeFileSync(indexPath, JSON.stringify(doc));
    await expect(fetcher.resolve('verifying-changes', { source: '@agileflow/verifying-changes' }, root)).rejects.toThrow(/lists @agileflow\/verifying-changes@.* under version 9\.9\.9/);
    fs.writeFileSync(indexPath, JSON.stringify({ schema: 1, name: '@agileflow/verifying-changes' }));
    const fresh = createFetcher({ ctx: createContext({ cwd: root, homeDir: root, cacheDir: path.join(root, 'c2'), env: { AGILEFLOW_REGISTRY: out } }) });
    await expect(fresh.resolve('verifying-changes', { source: '@agileflow/verifying-changes' }, root)).rejects.toThrow(/malformed document .*index\.json/);
  });

  it('never follows bundle URLs outside the registry', async () => {
    const { out, root } = await setup();
    const metaPath = path.join(out, `v1/skills/@agileflow/verifying-changes/${VC}.json`);
    const indexPath = path.join(out, 'v1/skills/@agileflow/verifying-changes/index.json');
    for (const url of ['file:///etc/passwd', '../../../etc/passwd', 'https://evil.example.com/x.json']) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      meta.url = url;
      index.versions[VC].url = url;
      fs.writeFileSync(metaPath, JSON.stringify(meta));
      fs.writeFileSync(indexPath, JSON.stringify(index));
      const f = createFetcher({ ctx: createContext({ cwd: root, homeDir: root, cacheDir: path.join(root, `c-${url.length}`), env: { AGILEFLOW_REGISTRY: out } }) });
      await expect(f.resolve('verifying-changes', { source: '@agileflow/verifying-changes' }, root)).rejects.toThrow(/Registry bundle URL/);
    }
  });

  it('refuses official content that differs from the integrity pinned in the CLI', async () => {
    const { out, root } = await setup();
    const ctx = createContext({ cwd: root, homeDir: root, cacheDir: path.join(root, 'pins-cache'), env: { AGILEFLOW_REGISTRY: out } });
    const client = new RegistryClient(out, ctx, { pins: { '@agileflow/verifying-changes': { [VC]: 'sha256-AAAA' } } });
    const meta = (await client.getVersion('@agileflow/verifying-changes', VC))!;
    await expect(client.download(meta)).rejects.toThrow(/pinned in this AgileFlow release/);
    expect(client.isPinned('@agileflow/verifying-changes', VC)).toBe(true);
    // The shipped pins cover every published official version.
    expect(OFFICIAL_PINS['@agileflow/verifying-changes']?.[VC]).toBe(meta.integrity);
  });

  it('caches catalog documents so search works offline', async () => {
    const root = tmpdir();
    const registryDir = path.join(root, 'registry');
    await copyTree(path.join(REPO, 'registry'), registryDir);
    const server = http.createServer((req, res) => {
      const file = path.join(registryDir, decodeURIComponent((req.url ?? '/').replace(/^\/registry\//, '')));
      if (!fs.existsSync(file)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.end(fs.readFileSync(file));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/registry`;
    try {
      const online = createFetcher({ ctx: createContext({ cwd: root, homeDir: root, cacheDir: path.join(root, 'cache'), env: { AGILEFLOW_REGISTRY: url } }) });
      expect((await online.listSkills()).length).toBe(SKILL_COUNT);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    const offline = createFetcher({
      ctx: createContext({ cwd: root, homeDir: root, cacheDir: path.join(root, 'cache'), env: { AGILEFLOW_REGISTRY: url, AGILEFLOW_OFFLINE: '1' } }),
    });
    expect((await offline.listSkills()).length).toBe(SKILL_COUNT);
    await expect(offline.resolve('verifying-changes', { source: '@agileflow/verifying-changes', version: VC }, root)).rejects.toThrow(/Offline/);
  });

  it('reports an unreachable remote registry clearly', async () => {
    const ctx = createContext({ cwd: tmpdir(), homeDir: tmpdir(), cacheDir: tmpdir(), env: { AGILEFLOW_REGISTRY: 'http://127.0.0.1:9/registry' } });
    await expect(createFetcher({ ctx }).listSkills()).rejects.toThrow(/Could not reach the skill registry/);
  });
});

describe('official catalog content', () => {
  it('has no high or medium findings from the content scanner', async () => {
    const { readTree, scanSkill } = await import('@agileflow/core');
    const findings: string[] = [];
    for (const id of fs.readdirSync(path.join(REPO, 'skills')).filter((d) => !d.startsWith('.'))) {
      for (const f of scanSkill(await readTree(path.join(REPO, 'skills', id)))) {
        if (f.severity !== 'low') findings.push(`${id}: [${f.severity}] ${f.rule} ${f.file}:${f.line ?? ''} ${f.excerpt ?? ''}`);
      }
    }
    expect(findings).toEqual([]);
  });
});

describe('reproducible builds', () => {
  it('two builds into fresh directories are byte-identical', async () => {
    const root = tmpdir();
    const read = (dir: string) => {
      const out: Record<string, string> = {};
      const walk = (abs: string, rel: string) => {
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(path.join(abs, e.name), r);
          else out[r] = fs.readFileSync(path.join(abs, e.name), 'utf8');
        }
      };
      walk(dir, '');
      return out;
    };
    for (const name of ['a', 'b']) {
      const res = await buildRegistry({ skillsDir: path.join(REPO, 'skills'), packsDir: path.join(REPO, 'packs'), outDir: path.join(root, name), pinsFile: path.join(root, `${name}.ts`) });
      expect(res.errors).toEqual([]);
    }
    expect(read(path.join(root, 'a'))).toEqual(read(path.join(root, 'b')));
    expect(fs.readFileSync(path.join(root, 'a.ts'), 'utf8')).toBe(fs.readFileSync(path.join(root, 'b.ts'), 'utf8'));
  });
});
