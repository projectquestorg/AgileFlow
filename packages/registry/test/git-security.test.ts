import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { createContext, isSafeGitRef, LockfileSchema, parseSource, ProjectConfigSchema } from '@agileflow/core';
import { createFetcher } from '@agileflow/registry';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-git-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function repoWithSkill(): string {
  const repo = tmpdir();
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: repo });
  git('init', '-q');
  fs.mkdirSync(path.join(repo, 'skills/foo'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'skills/foo/SKILL.md'), '---\nname: foo\ndescription: Foo. Use when testing.\n---\nbody\r\nwith crlf\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  return repo;
}

describe('git source hardening', () => {
  const INJECTIONS = ['--upload-pack=touch /tmp/pwned', '-c', 'HEAD~1', 'a..b', 'main@{1}', 'x y', 'ref;rm', 'a\nb'];

  it('rejects refs that git could read as options or revision expressions', () => {
    for (const ref of INJECTIONS) expect(isSafeGitRef(ref), ref).toBe(false);
    for (const ref of ['main', 'v1.2.3', 'feature/x', 'release-1.0', 'a'.repeat(40)]) expect(isSafeGitRef(ref), ref).toBe(true);
  });

  it('config and lock schemas refuse injected refs and non-commit resolved values', () => {
    const config = ProjectConfigSchema.safeParse({
      version: 1,
      skills: { foo: { source: 'git+https://example.com/r.git', ref: '--upload-pack=touch /tmp/pwned' } },
    });
    expect(config.success).toBe(false);
    const lock = LockfileSchema.safeParse({
      version: 1,
      resolved: {
        foo: { source: 'git+https://example.com/r.git', version: '1.0.0', resolved: '--upload-pack=touch /tmp/pwned', path: '.agents/skills/foo' },
      },
    });
    expect(lock.success).toBe(false);
  });

  it('never executes an injected ref, even when a caller bypasses the schemas', async () => {
    const repo = repoWithSkill();
    const home = tmpdir();
    const marker = path.join(home, 'PWNED');
    const fetcher = createFetcher({ ctx: createContext({ cwd: home, homeDir: home, cacheDir: path.join(home, 'cache'), env: {} }) });
    for (const ref of [`--upload-pack=touch ${marker}`, `-oProxyCommand=touch ${marker}`]) {
      await expect(fetcher.resolve('foo', { source: `git+file://${repo}#skills/foo`, ref }, home)).rejects.toThrow(/Invalid git ref/);
      await expect(
        fetcher.fetchLocked('foo', { source: `git+file://${repo}#skills/foo`, version: '1', resolved: ref, integrity: 'sha256-x', path: '.agents/skills/foo', activation: 'auto', ownership: 'managed' }, home),
      ).rejects.toThrow(/no valid resolved commit/);
    }
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('refuses dash-prefixed and whitespace URLs and unencrypted transports', async () => {
    expect(() => parseSource('git+--upload-pack=x')).toThrow(/Invalid git source/);
    expect(() => parseSource('git+https://host/r.git with space')).toThrow(/Invalid git source/);
    expect(() => parseSource('git+ext::sh -c touch% /tmp/x')).toThrow();
    const home = tmpdir();
    const fetcher = createFetcher({ ctx: createContext({ cwd: home, homeDir: home, cacheDir: path.join(home, 'cache'), env: {} }) });
    await expect(fetcher.resolve('foo', { source: 'git+http://example.com/r.git' }, home)).rejects.toThrow(/unencrypted git URL/);
  });

  it('checks out only the requested subpath, byte-identical regardless of autocrlf', async () => {
    const repo = repoWithSkill();
    const home = tmpdir();
    // A user-level autocrlf=true must not change the checked-out bytes (and thus the integrity).
    fs.writeFileSync(path.join(home, '.gitconfig'), '[core]\n\tautocrlf = true\n');
    const previous = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');
    const fetcher = createFetcher({ ctx: createContext({ cwd: home, homeDir: home, cacheDir: path.join(home, 'cache'), env: {} }) });
    let pkg;
    try {
      pkg = await fetcher.resolve('foo', { source: `git+file://${repo}#skills/foo` }, home);
    } finally {
      if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = previous;
    }
    expect(pkg.files.map((f) => f.path)).toEqual(['SKILL.md']);
    expect(pkg.files[0]!.content.toString()).toBe('---\nname: foo\ndescription: Foo. Use when testing.\n---\nbody\r\nwith crlf\n');
    expect(pkg.resolved).toMatch(/^[0-9a-f]{40}$/);
    const locked = YAML.stringify({ resolved: pkg.resolved });
    expect(locked).toContain(pkg.resolved!);
  });
});
