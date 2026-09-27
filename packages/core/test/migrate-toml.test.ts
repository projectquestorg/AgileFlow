import { describe, expect, it } from 'vitest';
import toml from '@iarna/toml';
import { filterHooks } from '../src/migrate';
import { editTomlLines } from '../src/migrate-toml';

const isV4 = (command: string) => command.includes('agileflow hook');

function expected(removeHooks: boolean, keys: string[] = []) {
  return (parsed: Record<string, unknown>) => {
    const next = { ...parsed };
    if (removeHooks) {
      const { hooks } = filterHooks(next.hooks);
      if (hooks) next.hooks = hooks;
      else delete next.hooks;
    }
    for (const k of keys) delete next[k];
    return next;
  };
}

const V4_CONFIG = [
  '# my codex config',
  'model = "o4" # trailing comment',
  'approval_policy = "never"',
  'sandbox_mode = "danger-full-access"',
  '',
  '[features]',
  'hooks = true',
  '',
  '[[hooks.SessionStart]]',
  '[[hooks.SessionStart.hooks]]',
  'type = "command"',
  'command = "npx agileflow hook SessionStart"',
  'timeout = 30',
  '',
  '[[hooks.PreToolUse]]',
  'matcher = "Bash"',
  '',
  '  [[hooks.PreToolUse.hooks]]',
  '  type = "command"',
  '  command = "npx agileflow hook PreToolUse --matcher Bash"',
  '',
  '  [[hooks.PreToolUse.hooks]]',
  '  type = "command"',
  '  command = "./my-guard.sh"',
  '',
  '# notify me',
  '[[hooks.Stop]]',
  '[[hooks.Stop.hooks]]',
  'type = "command"',
  'command = "notify-send done"',
  '',
  '[profiles.fast]',
  'approval_policy = "never"',
  '',
].join('\n');

describe('editTomlLines', () => {
  it('removes only AgileFlow hook entries and keeps comments, order, and user hooks', () => {
    const res = editTomlLines(V4_CONFIG, { removeHookCommand: isV4 }, expected(true));
    expect(res.removedHooks).toBe(2);
    expect(res.text).toContain('# my codex config\nmodel = "o4" # trailing comment\n');
    expect(res.text).not.toContain('agileflow hook');
    expect(res.text).toContain('[[hooks.PreToolUse]]\nmatcher = "Bash"\n\n  [[hooks.PreToolUse.hooks]]\n  type = "command"\n  command = "./my-guard.sh"');
    expect(res.text).toContain('# notify me\n[[hooks.Stop]]');
    expect(res.text).not.toMatch(/\n\n\n/);
    const parsed = toml.parse(res.text) as Record<string, any>;
    expect(parsed.hooks.SessionStart).toBeUndefined();
    expect(parsed.hooks.PreToolUse).toEqual([{ matcher: 'Bash', hooks: [{ type: 'command', command: './my-guard.sh' }] }]);
    expect(parsed.approval_policy).toBe('never');
  });

  it('removes root keys but never the same key inside a table or a dotted key', () => {
    const text = [
      'approval_policy = "never"',
      'profiles.dotted.approval_policy = "never"',
      '"sandbox_mode" = "danger-full-access" # quoted key',
      '[profiles.fast]',
      'approval_policy = "never"',
      '',
    ].join('\n');
    const keys = ['approval_policy', 'sandbox_mode'];
    const res = editTomlLines(text, { removeRootKeys: keys }, expected(false, keys));
    expect(res.removedKeys.sort()).toEqual(keys);
    expect(res.text).toBe('profiles.dotted.approval_policy = "never"\n[profiles.fast]\napproval_policy = "never"\n');
  });

  it('preserves CRLF line endings and a missing final newline', () => {
    const crlf = V4_CONFIG.replace(/\n/g, '\r\n').replace(/\r\n$/, '');
    const res = editTomlLines(crlf, { removeHookCommand: isV4, removeRootKeys: ['approval_policy'] }, expected(true, ['approval_policy']));
    expect(res.text).not.toMatch(/[^\r]\n/);
    expect(res.text.endsWith('\n')).toBe(false);
    expect(res.text).toContain('# my codex config\r\nmodel = "o4" # trailing comment\r\nsandbox_mode');
  });

  it('ignores header-like lines inside multi-line strings and arrays', () => {
    const text = [
      'notes = """',
      '[[hooks.SessionStart]]',
      'command = "npx agileflow hook SessionStart"',
      '"""',
      'args = [',
      '  ["a"]',
      ']',
      '[[hooks.SessionStart]]',
      'command = "npx agileflow hook SessionStart"',
      '',
    ].join('\n');
    const res = editTomlLines(text, { removeHookCommand: isV4 }, expected(true));
    expect(res.removedHooks).toBe(1);
    expect(res.text).toBe(text.split('\n').slice(0, 7).join('\n') + '\n');
  });

  it('removes an emptied [hooks] table and handles quoted header keys', () => {
    const text = 'a = 1\n\n[hooks]\n\n[[hooks."Stop"]]\n[[ hooks.Stop.hooks ]]\ncommand = \'npx agileflow hook Stop\'\n';
    const res = editTomlLines(text, { removeHookCommand: isV4 }, expected(true));
    expect(res.text).toBe('a = 1\n');
  });

  it('refuses layouts it cannot edit line by line instead of rewriting the file', () => {
    const inline = 'hooks = { Stop = [ { hooks = [ { type = "command", command = "npx agileflow hook Stop" } ] } ] }\n';
    expect(() => editTomlLines(inline, { removeHookCommand: isV4 }, expected(true))).toThrow(/cannot be edited line by line/);
    const table = '[hooks]\nStop = [ { command = "npx agileflow hook Stop" } ]\n';
    expect(() => editTomlLines(table, { removeHookCommand: isV4 }, expected(true))).toThrow();
  });

  it('returns the original text when nothing matches', () => {
    const text = '# only mine\n[[hooks.Stop]]\ncommand = "notify-send"\n';
    const res = editTomlLines(text, { removeHookCommand: isV4 }, expected(true));
    expect(res.text).toBe(text);
    expect(res.removedHooks).toBe(0);
  });
});
