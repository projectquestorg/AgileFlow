import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { createSandbox, exists, isSymlink, read, type Sandbox } from '../helpers';

let sb: Sandbox;
afterEach(() => sb?.cleanup());

function writeSkill(dir: string, name: string, body = 'Do the thing.', extra: Record<string, string> = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Test skill ${name}. Use when testing.\n---\n${body}\n`);
  for (const [rel, content] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
}

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd }).toString().trim();
}

describe('path sources', () => {
  it('materializes a local path skill as managed and picks up source changes via update', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    writeSkill(path.join(sb.project, 'my-skills/release-notes'), 'release-notes', 'v1 body');
    await sb.af(['init', '--skills', '']);
    const res = await sb.af(['add', './my-skills/release-notes', '--yes']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Installing external skill:');
    expect(read(path.join(sb.project, '.agents/skills/release-notes/SKILL.md'))).toContain('Managed by AgileFlow');
    const lock = YAML.parse(read(path.join(sb.project, 'agileflow.lock')));
    expect(lock.resolved['release-notes']).toMatchObject({ source: './my-skills/release-notes', version: 'local', ownership: 'managed' });

    writeSkill(path.join(sb.project, 'my-skills/release-notes'), 'release-notes', 'v2 body');
    const sync = await sb.af(['sync']);
    expect(sync.code).toBe(1);
    expect(sync.stderr).toContain('local source changed since it was locked');
    expect((await sb.af(['update', '--yes'])).code).toBe(0);
    expect(read(path.join(sb.project, '.agents/skills/release-notes/SKILL.md'))).toContain('v2 body');
  });

  it('registers a skill already in .agents/skills as locally owned without copying', async () => {
    sb = await createSandbox({ fixture: 'existing-agents-skills' });
    await sb.af(['init', '--skills', '']);
    const res = await sb.af(['add', './.agents/skills/my-team-release', '--yes']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Registered locally owned: my-team-release');
    expect(read(path.join(sb.project, '.agents/skills/my-team-release/SKILL.md'))).not.toContain('Managed by AgileFlow');
    const lock = YAML.parse(read(path.join(sb.project, 'agileflow.lock')));
    expect(lock.resolved['my-team-release']).toMatchObject({ version: 'local', ownership: 'local' });
    expect((await sb.af(['check'])).code).toBe(0);
  });

  it('shows scripts before installing third-party content', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    writeSkill(path.join(sb.root, 'third/deployer'), 'deployer', 'Run scripts/deploy.sh', {
      'scripts/deploy.sh': '#!/bin/sh\necho deploy\n',
      'references/notes.md': 'notes',
    });
    fs.chmodSync(path.join(sb.root, 'third/deployer/scripts/deploy.sh'), 0o755);
    await sb.af(['init', '--skills', '']);
    const res = await sb.af(['add', path.join(sb.root, 'third/deployer'), '--yes']);
    expect(res.stdout).toContain('Installing external skill:');
    expect(res.stdout).toContain('1 executable script');
    expect(res.stdout).toContain('Scripts:\n  scripts/deploy.sh');
    expect(res.stdout).toContain('Review source before installing untrusted skills.');
    const installed = path.join(sb.project, '.agents/skills/deployer/scripts/deploy.sh');
    expect(fs.statSync(installed).mode & 0o111).not.toBe(0);
  });
});

describe('git sources', () => {
  it('adds from a git repository subpath, locks the commit, and updates to new commits', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const repo = path.join(sb.root, 'skills-repo');
    writeSkill(path.join(repo, 'skills/foo'), 'foo', 'foo v1');
    writeSkill(path.join(repo, 'skills/bar'), 'bar', 'bar v1');
    git(repo, 'init', '-q');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'one');
    const first = git(repo, 'rev-parse', 'HEAD');
    await sb.af(['init', '--skills', '']);

    const multi = await sb.af(['add', `git+file://${repo}`, '--yes']);
    expect(multi.code).toBe(1);
    expect(multi.stderr).toContain('contains 2 skills; choose with --skill');
    const res = await sb.af(['add', `git+file://${repo}`, '--skill', 'foo', '--yes']);
    expect(res.code).toBe(0);
    const lock = YAML.parse(read(path.join(sb.project, 'agileflow.lock')));
    expect(lock.resolved.foo).toMatchObject({ source: `git+file://${repo}#skills/foo`, resolved: first });
    expect(read(path.join(sb.project, '.agents/skills/foo/SKILL.md'))).toContain('foo v1');

    writeSkill(path.join(repo, 'skills/foo'), 'foo', 'foo v2');
    git(repo, 'commit', '-qam', 'two');
    // sync reproduces the locked commit, even offline from the git cache.
    fs.rmSync(path.join(sb.project, '.agents/skills/foo'), { recursive: true });
    fs.renameSync(repo, `${repo}-moved`);
    expect((await sb.af(['sync'])).code).toBe(0);
    expect(read(path.join(sb.project, '.agents/skills/foo/SKILL.md'))).toContain('foo v1');
    fs.renameSync(`${repo}-moved`, repo);

    expect((await sb.af(['update', '--yes'])).code).toBe(0);
    expect(read(path.join(sb.project, '.agents/skills/foo/SKILL.md'))).toContain('foo v2');
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.lock'))).resolved.foo.resolved).toBe(git(repo, 'rev-parse', 'HEAD'));
  });
});

describe('personal (global) skills', () => {
  it('installs into ~/.agents/skills, links ~/.claude/skills, and explains project overrides', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    const res = await sb.af(['add', 'filing-pr', '--global', '--yes']);
    expect(res.code).toBe(0);
    expect(exists(path.join(sb.home, '.agents/skills/filing-pr/SKILL.md'))).toBe(true);
    expect(isSymlink(path.join(sb.home, '.claude/skills/filing-pr'))).toBe(true);
    const cfg = YAML.parse(read(path.join(sb.home, '.config/agileflow/config.yaml')));
    expect(cfg.globalSkills['filing-pr'].source).toBe('@agileflow/filing-pr');
    expect(exists(path.join(sb.home, '.config/agileflow/agileflow.lock'))).toBe(true);
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);

    await sb.af(['init', '--skills', 'filing-pr']);
    const check = await sb.af(['check']);
    expect(check.stdout).toContain('filing-pr has a project override of your global skill');
    const list = await sb.af(['list']);
    expect(list.stdout).toContain('Project skills');
    expect(list.stdout).toContain('Personal skills');

    expect((await sb.af(['remove', 'filing-pr', '--global'])).code).toBe(0);
    expect(exists(path.join(sb.home, '.agents/skills/filing-pr'))).toBe(false);
    expect(exists(path.join(sb.home, '.claude/skills/filing-pr'))).toBe(false);
    expect(exists(path.join(sb.project, '.agents/skills/filing-pr/SKILL.md'))).toBe(true);
  });
});

describe('untrusted skill names', () => {
  it('rejects a SKILL.md name that would escape .agents/skills', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const dir = path.join(sb.root, 'evil');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: ../../../escaped\ndescription: x. Use when y.\n---\nbody\n');
    await sb.af(['init', '--skills', '']);
    const res = await sb.af(['add', dir, '--yes']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Invalid skill name');
    expect(exists(path.join(sb.root, 'escaped'))).toBe(false);
    expect(exists(path.join(sb.project, 'escaped'))).toBe(false);
  });
});

describe('registry over HTTP', () => {
  async function serve(root: string | null): Promise<{ url: string; close: () => Promise<void> }> {
    const http = await import('node:http');
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/^\/registry\//, '');
      const file = root ? path.join(root, rel) : null;
      if (!file || rel.includes('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404;
        res.end('404: Not Found');
        return;
      }
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end(fs.readFileSync(file));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    return { url: `http://127.0.0.1:${port}/registry`, close: () => new Promise((r) => server.close(() => r())) };
  }

  it('installs and updates from a registry served like raw.githubusercontent.com (after merge)', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const server = await serve(sb.registry);
    try {
      const env = { AGILEFLOW_REGISTRY: server.url };
      expect((await sb.af(['init', '--yes'], { env })).code).toBe(0);
      expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toBe(true);
      await sb.publish('diagnosing-bugs', '1.1.0', (t) => `${t}\nhttp update\n`);
      expect((await sb.af(['update', '--yes'], { env })).code).toBe(0);
      expect(read(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toContain('http update');
      expect((await sb.af(['check'], { env })).code).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('reports a missing registry clearly and writes nothing (before merge)', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const server = await serve(null);
    try {
      const res = await sb.af(['init', '--yes'], { env: { AGILEFLOW_REGISTRY: server.url } });
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('No AgileFlow skill registry found at');
      expect(res.stderr).toContain('AGILEFLOW_REGISTRY');
      expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);
      expect(exists(path.join(sb.project, '.agents'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('uses the official GitHub-hosted registry by default (no development path)', async () => {
    const { DEFAULT_REGISTRY, resolveRegistryLocation } = await import('@agileflow/registry');
    const { createContext } = await import('@agileflow/core');
    expect(DEFAULT_REGISTRY).toBe('https://raw.githubusercontent.com/projectquestorg/AgileFlow/main/registry');
    expect(resolveRegistryLocation({ ctx: createContext({ env: {} }) })).toBe(DEFAULT_REGISTRY);
    expect(resolveRegistryLocation({ ctx: createContext({ cwd: '/p', env: {} }), registry: './reg', registryBase: '/p' })).toBe('/p/reg');
  });
});
