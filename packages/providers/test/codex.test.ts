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
  // Windows has no POSIX modes and needs privileges for symlinks.
  it.skipIf(process.platform === 'win32')('keeps a 0600 config at 0600 through enable and disable', async () => {
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

  it.skipIf(process.platform === 'win32')('writes through a symlinked config.toml (dotfile managers) instead of replacing the link', async () => {
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

  it('expands ~ in $CODEX_HOME and resolves a relative value against the working directory', () => {
    const { ctx: tilde, home } = setup({ CODEX_HOME: '~/codex' });
    expect(codexConfigPath(tilde)).toBe(path.join(home, 'codex', 'config.toml'));
    const cwd = tmpdir();
    const rel = createContext({ cwd, homeDir: home, env: { CODEX_HOME: 'conf/codex' } });
    expect(codexConfigPath(rel)).toBe(path.join(cwd, 'conf', 'codex', 'config.toml'));
    expect(codexConfigPath(createContext({ cwd, homeDir: home, env: { CODEX_HOME: '' } }))).toBe(path.join(home, '.codex', 'config.toml'));
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

  it('refuses valid TOML it cannot edit safely (quoted key), leaving the file byte-identical and recording nothing', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const src = '[features]\n"default_mode_request_user_input" = false\n';
    fs.writeFileSync(file, src);
    await expect(configureStructuredQuestions(ctx, true)).rejects.toThrow(/Cannot change .*manually.*Nothing was written/);
    expect(fs.readFileSync(file, 'utf8')).toBe(src);
    expect(patches(ctx)).toHaveLength(0);
    expect(fs.existsSync(globalStatePath(ctx))).toBe(false);
  });

  it('refuses to restore once the user rewrote the table in a shape it cannot edit, and keeps the record for a retry', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'model = "x"\n');
    await configureStructuredQuestions(ctx, true);
    const inline = 'model = "x"\nfeatures = { default_mode_request_user_input = true }\n';
    fs.writeFileSync(file, inline);
    await expect(configureStructuredQuestions(ctx, false)).rejects.toThrow(/Cannot change .*Nothing was written/);
    expect(fs.readFileSync(file, 'utf8')).toBe(inline);
    expect(patches(ctx)).toHaveLength(1);
  });

  it('disable leaves the file alone when the user removed the value after enable', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'model = "x"\n');
    await configureStructuredQuestions(ctx, true);
    const edited = 'model = "y"\n';
    fs.writeFileSync(file, edited);
    const result = await configureStructuredQuestions(ctx, false);
    expect(result).toMatchObject({ changed: false, before: undefined, after: undefined });
    expect(result.note).toMatch(/changed since AgileFlow set it/);
    expect(fs.readFileSync(file, 'utf8')).toBe(edited);
    expect(patches(ctx)).toHaveLength(0);
  });

  it('disable removes only its own key and keeps everything the user added after enable', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'model = "x"\n');
    await configureStructuredQuestions(ctx, true);
    const enabled = fs.readFileSync(file, 'utf8');
    expect(enabled).toBe('model = "x"\n\n[features]\ndefault_mode_request_user_input = true\n');
    fs.writeFileSync(file, `${enabled}web_search_request = true\n\n[mcp_servers.y]\ncommand = "y"\n`);

    const result = await configureStructuredQuestions(ctx, false);
    expect(result).toMatchObject({ changed: true, before: true, after: undefined });
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toBe('model = "x"\n\n[features]\nweb_search_request = true\n\n[mcp_servers.y]\ncommand = "y"\n');
    expect(parse(text)).toEqual({ model: 'x', features: { web_search_request: true }, mcp_servers: { y: { command: 'y' } } });
    expect(patches(ctx)).toHaveLength(0);
  });

  it('re-reads config.toml right before writing and writes nothing when it changed since it was read', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'model = "a"\n');
    const edit = (text: string) => async () => fs.writeFileSync(file, text);
    // Enable: the user's concurrent edit wins; no record is left behind.
    const enable = await configureStructuredQuestions(ctx, true, { deps: { beforeWrite: edit('model = "b"\n') } });
    expect(enable).toMatchObject({ changed: false, note: expect.stringContaining('changed while AgileFlow was editing it') });
    expect(fs.readFileSync(file, 'utf8')).toBe('model = "b"\n');
    expect(patches(ctx)).toEqual([]);
    // Disable: restoring waits for a file that matches what was read; the record stays for a retry.
    expect((await configureStructuredQuestions(ctx, true)).changed).toBe(true);
    const applied = fs.readFileSync(file, 'utf8');
    const disable = await configureStructuredQuestions(ctx, false, { deps: { beforeWrite: edit(`${applied}# note\n`) } });
    expect(disable).toMatchObject({ changed: false, note: expect.stringContaining('changed while AgileFlow was editing it') });
    expect(fs.readFileSync(file, 'utf8')).toBe(`${applied}# note\n`);
    expect(patches(ctx)).toHaveLength(1);
    expect((await configureStructuredQuestions(ctx, false)).changed).toBe(true);
    expect(await readStructuredQuestions(ctx)).toBe(false);
  });

  it('disable deletes a config.toml AgileFlow created when nothing else was added', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    await configureStructuredQuestions(ctx, true);
    expect(fs.readFileSync(file, 'utf8')).toContain('default_mode_request_user_input = true');
    const result = await configureStructuredQuestions(ctx, false);
    expect(result.changed).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(patches(ctx)).toHaveLength(0);
  });

  it('disable keeps a config.toml AgileFlow created once the user added their own settings', async () => {
    const { ctx } = setup();
    const file = codexConfigPath(ctx);
    await configureStructuredQuestions(ctx, true);
    fs.writeFileSync(file, `model = "x"\n${fs.readFileSync(file, 'utf8')}`);
    await configureStructuredQuestions(ctx, false);
    expect(parse(fs.readFileSync(file, 'utf8'))).toEqual({ model: 'x' });
  });

  it.skipIf(process.platform === 'win32')('disable keeps a created config.toml that the user has since turned into a symlink', async () => {
    const { ctx, home } = setup();
    const file = codexConfigPath(ctx);
    await configureStructuredQuestions(ctx, true);
    const real = path.join(home, 'dotfiles', 'config.toml');
    fs.mkdirSync(path.dirname(real), { recursive: true });
    fs.renameSync(file, real);
    fs.symlinkSync(real, file);

    const result = await configureStructuredQuestions(ctx, false);
    expect(result.changed).toBe(true);
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(real)).toBe(true);
    expect(fs.readFileSync(real, 'utf8')).not.toContain('default_mode_request_user_input');
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
