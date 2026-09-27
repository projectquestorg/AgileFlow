import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { parse } from 'smol-toml';
import { createContext, globalStatePath, projectScope, type Context } from '@agileflow/core';
import { codexAdapter, codexConfigPath, configureStructuredQuestions, readStructuredQuestions } from '@agileflow/providers';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-codex-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) {
    fs.chmodSync(d, 0o755);
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function setup(env: Record<string, string> = {}): { ctx: Context; home: string } {
  const home = tmpdir();
  const ctx = createContext({ cwd: home, homeDir: home, configDir: path.join(home, '.config/agileflow'), env: { PATH: '', ...env } });
  return { ctx, home };
}

function patches(ctx: Context): unknown[] {
  try {
    return YAML.parse(fs.readFileSync(globalStatePath(ctx), 'utf8')).providerPatches?.codex ?? [];
  } catch {
    return [];
  }
}

const mode = (p: string) => fs.statSync(p).mode & 0o777;

describe('Codex config writes', () => {
  it('keeps a 0600 config at 0600 through enable and disable', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '[mcp_servers.x]\nenv = { TOKEN = "secret" }\n', { mode: 0o600 });
    fs.chmodSync(file, 0o600);
    await configureStructuredQuestions(ctx, true);
    expect(mode(file)).toBe(0o600);
    expect(await readStructuredQuestions(ctx)).toBe(true);
    await configureStructuredQuestions(ctx, false);
    expect(mode(file)).toBe(0o600);
    expect(fs.readFileSync(file, 'utf8')).toBe('[mcp_servers.x]\nenv = { TOKEN = "secret" }\n');
  });

  it('writes through a symlinked config.toml (dotfile managers) instead of replacing the link', async () => {
    const { ctx, home } = setup();
    const file = codexConfigPath(ctx);
    const real = path.join(home, 'dotfiles', 'codex', 'config.toml');
    fs.mkdirSync(path.dirname(real), { recursive: true });
    fs.writeFileSync(real, 'model = "x"\n', { mode: 0o600 });
    fs.chmodSync(real, 0o600);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.symlinkSync(path.relative(path.dirname(file), real), file);

    await configureStructuredQuestions(ctx, true);
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(real, 'utf8')).toContain('default_mode_request_user_input = true');
    expect(mode(real)).toBe(0o600);

    await configureStructuredQuestions(ctx, false);
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(real, 'utf8')).toBe('model = "x"\n');
  });

  it('uses $CODEX_HOME for config.toml and detection, like Codex', async () => {
    const codexHome = path.join(tmpdir(), 'codex-home');
    const { ctx, home } = setup({ CODEX_HOME: codexHome });
    expect(codexConfigPath(ctx)).toBe(path.join(codexHome, 'config.toml'));
    fs.mkdirSync(codexHome, { recursive: true });
    const detection = await codexAdapter.detect({ ctx, scope: projectScope(tmpdir()), settings: undefined });
    expect(detection.evidence).toEqual(['$CODEX_HOME exists']);
    await configureStructuredQuestions(ctx, true);
    expect(fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8')).toContain('default_mode_request_user_input = true');
    expect(fs.existsSync(path.join(home, '.codex'))).toBe(false);
  });

  it('never produces a duplicate [features] table for root dotted keys (Codex would not start)', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const original = 'features.web_search_request = true\n';
    fs.writeFileSync(file, original);
    await configureStructuredQuestions(ctx, true);
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toContain('[features]');
    expect((parse(text) as { features: Record<string, unknown> }).features).toEqual({
      web_search_request: true,
      default_mode_request_user_input: true,
    });
    await configureStructuredQuestions(ctx, false);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });

  it('disable leaves a value the user changed after enable, and drops the stale record', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'model = "x"\n');
    await configureStructuredQuestions(ctx, true);
    expect(patches(ctx)).toHaveLength(1);
    const edited = fs.readFileSync(file, 'utf8').replace('default_mode_request_user_input = true', 'default_mode_request_user_input = false');
    fs.writeFileSync(file, edited);

    const preview = await configureStructuredQuestions(ctx, false, { dryRun: true });
    expect(preview).toMatchObject({ changed: false, before: false, after: false });
    expect(preview.note).toMatch(/changed since AgileFlow set it/);
    expect(patches(ctx)).toHaveLength(1); // dry run changes nothing

    const result = await configureStructuredQuestions(ctx, false);
    expect(result.changed).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(edited);
    expect(patches(ctx)).toHaveLength(0);
  });

  it('refuses a config that is not valid TOML with the file and a fix, and writes nothing', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const broken = '[features]\nweb = true\n[features]\nother = 1\n';
    fs.writeFileSync(file, broken);
    await expect(configureStructuredQuestions(ctx, true)).rejects.toThrow(
      new RegExp(`Cannot change ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: not valid TOML \\(line 3.*Nothing was written`),
    );
    expect(fs.readFileSync(file, 'utf8')).toBe(broken);
    expect(patches(ctx)).toHaveLength(0);
    expect(await readStructuredQuestions(ctx)).toBeNull();
  });

  it('reads configs Codex accepts but TOML 0.5 parsers reject (BOM, local time, mixed arrays)', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const src = '\uFEFFwake = 07:32:00\nmixed = ["a", 1]\n';
    fs.writeFileSync(file, src);
    expect(await readStructuredQuestions(ctx)).toBe(false);
    await configureStructuredQuestions(ctx, true);
    expect(await readStructuredQuestions(ctx)).toBe(true);
    await configureStructuredQuestions(ctx, false);
    expect(fs.readFileSync(file, 'utf8')).toBe(src);
  });

  it.skipIf(process.getuid?.() === 0)('rolls back the restore record when the config write fails', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'model = "x"\n');
    fs.chmodSync(path.dirname(file), 0o500); // no new files (temp file) in ~/.codex
    try {
      await expect(configureStructuredQuestions(ctx, true)).rejects.toThrow();
    } finally {
      fs.chmodSync(path.dirname(file), 0o755);
    }
    expect(fs.readFileSync(file, 'utf8')).toBe('model = "x"\n');
    expect(patches(ctx)).toHaveLength(0);
  });
});
