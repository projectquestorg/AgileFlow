import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createContext, projectScope, writeTree } from '@agileflow/core';
import {
  allAdapters,
  claudeAdapter,
  findExecutable,
  geminiAdapter,
  readTomlValue,
  removeTomlValue,
  setTomlValue,
} from '@agileflow/providers';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-prov-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('TOML patching', () => {
  it('sets a key inside an existing table without touching anything else', () => {
    const src = '# c\nmodel = "x"\n\n[features] # trailing\n# note\nweb = true\n\n[other]\nk = 1\n';
    const { text, createdTable } = setTomlValue(src, 'features', 'flag', true);
    expect(createdTable).toBe(false);
    expect(text).toBe('# c\nmodel = "x"\n\n[features] # trailing\nflag = true\n# note\nweb = true\n\n[other]\nk = 1\n');
    expect(removeTomlValue(text, 'features', 'flag', false)).toBe(src);
  });

  it('replaces an existing value and keeps its comment', () => {
    const src = '[features]\nflag = false # mine\n';
    expect(setTomlValue(src, 'features', 'flag', true).text).toBe('[features]\nflag = true # mine\n');
  });

  it('creates and later removes a table it created', () => {
    const src = 'model = "x"\n';
    const { text, createdTable } = setTomlValue(src, 'features', 'flag', true);
    expect(createdTable).toBe(true);
    expect(text).toBe('model = "x"\n\n[features]\nflag = true\n');
    expect(removeTomlValue(text, 'features', 'flag', true)).toBe(src);
    expect(removeTomlValue(setTomlValue('', 'features', 'flag', true).text, 'features', 'flag', true)).toBe('');
  });

  it('handles dotted keys, refuses inline tables, and reports state', () => {
    expect(setTomlValue('features.flag = false\n', 'features', 'flag', true).text).toBe('features.flag = true\n');
    expect(() => setTomlValue('features = { flag = false }\n', 'features', 'flag', true)).toThrow(/inline table/);
    expect(readTomlValue('[features]\nflag = true\n', 'features', 'flag')).toEqual({ existed: true, value: true });
    expect(readTomlValue('', 'features', 'flag')).toEqual({ existed: false });
    expect(() => setTomlValue('this is = = not toml', 'features', 'flag', true)).toThrow();
  });
});

describe('detection', () => {
  it('finds executables on PATH without spawning and reports evidence', async () => {
    const bin = tmpdir();
    const home = tmpdir();
    const root = tmpdir();
    fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\n');
    fs.chmodSync(path.join(bin, 'codex'), 0o755);
    expect(await findExecutable('codex', { PATH: bin }, 'linux')).toBe(path.join(bin, 'codex'));
    const ctx = createContext({ cwd: root, homeDir: home, env: { PATH: bin } });
    const pctx = (id: string) => ({ ctx, scope: projectScope(root), settings: undefined, id });
    const results = Object.fromEntries(
      await Promise.all(allAdapters().map(async (a) => [a.id, await a.detect(pctx(a.id))] as const)),
    );
    expect(results.codex!.detected).toBe(true);
    expect(results.codex!.evidence).toEqual(['`codex` on PATH']);
    expect(results.claude!.detected).toBe(false);
    fs.mkdirSync(path.join(home, '.gemini'));
    expect((await geminiAdapter.detect(pctx('gemini'))).evidence).toEqual(['~/.gemini exists']);
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '');
    expect((await claudeAdapter.detect(pctx('claude'))).evidence).toEqual(['CLAUDE.md in project']);
  });

  it('reports support levels and exposure honestly', async () => {
    const ctx = createContext({ cwd: '/', homeDir: tmpdir(), env: { PATH: '' } });
    const scope = projectScope(tmpdir());
    const support = Object.fromEntries(allAdapters().map((a) => [a.id, a.support]));
    expect(support).toEqual({ codex: 'native', claude: 'adapted', cursor: 'native', opencode: 'native', gemini: 'native' });
    const caps = await geminiAdapter.inspect({ ctx, scope, settings: undefined });
    expect(caps).toMatchObject({ exposure: 'native', manualInvocation: 'semantic', skillLocations: ['.agents/skills'] });
    expect((await claudeAdapter.inspect({ ctx, scope, settings: undefined })).exposure).toBe('linked');
  });
});

describe('Claude adapter planning', () => {
  it('only plans removal for the skills it is told about', async () => {
    const root = tmpdir();
    const ctx = createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } });
    const scope = projectScope(root);
    await writeTree(path.join(root, '.agents/skills/mine'), [{ path: 'SKILL.md', content: Buffer.from('x'), executable: false }]);
    fs.mkdirSync(path.join(root, '.claude/skills'), { recursive: true });
    fs.symlinkSync('../../.agents/skills/mine', path.join(root, '.claude/skills/mine'));
    const pctx = { ctx, scope, settings: undefined };
    expect(await claudeAdapter.removeManagedArtifacts(pctx)).toEqual([]);
    expect(await claudeAdapter.removeManagedArtifacts(pctx, ['other'])).toEqual([]);
    const plan = await claudeAdapter.removeManagedArtifacts(pctx, ['mine']);
    expect(plan).toMatchObject([{ kind: 'remove', skillId: 'mine' }]);
  });
});

describe('Gemini folder trust', () => {
  it('hints until the project folder (or a parent) is trusted, and not when trust is disabled', async () => {
    const { geminiTrustHint } = await import('../src/gemini');
    const home = tmpdir();
    const root = path.join(tmpdir(), 'repo');
    fs.mkdirSync(root);
    const pctx = { ctx: createContext({ cwd: root, homeDir: home, env: {} }), scope: projectScope(root), settings: undefined };
    expect(geminiTrustHint(pctx)?.message).toContain('trusted folders');
    fs.mkdirSync(path.join(home, '.gemini'));
    fs.writeFileSync(path.join(home, '.gemini/trustedFolders.json'), JSON.stringify({ [path.dirname(root)]: 'TRUST_FOLDER' }));
    expect(geminiTrustHint(pctx)).toBeNull();
    fs.writeFileSync(path.join(home, '.gemini/trustedFolders.json'), JSON.stringify({ [root]: 'DO_NOT_TRUST' }));
    expect(geminiTrustHint(pctx)).not.toBeNull();
    fs.writeFileSync(path.join(home, '.gemini/settings.json'), JSON.stringify({ security: { folderTrust: { enabled: false } } }));
    expect(geminiTrustHint(pctx)).toBeNull();
  });
});
