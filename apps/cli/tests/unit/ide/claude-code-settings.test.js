/**
 * Unit tests for the Claude Code settings.json writer.
 *
 * Critical correctness property: AgileFlow must NOT clobber the user's
 * other settings.json content (permissions, env, non-managed hooks).
 * Every merge/unmerge case is exercised here.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import settingsModule from '../../../src/runtime/ide/claude-code-settings.js';

const {
  writeClaudeCodeSettings,
  removeClaudeCodeSettings,
  mergeManagedHooks,
  unmanageHooks,
  isAgileflowEntry,
  MANAGED_HOOKS,
  MANAGED_EVENTS,
  HOOK_COMMAND_MARKER,
} = settingsModule;

describe('isAgileflowEntry', () => {
  it('detects a command containing the marker', () => {
    expect(
      isAgileflowEntry({ hooks: [{ type: 'command', command: 'npx --no-install agileflow hook SessionStart' }] }),
    ).toBe(true);
  });

  it('does not detect unrelated user entries', () => {
    expect(
      isAgileflowEntry({ hooks: [{ type: 'command', command: 'echo hello' }] }),
    ).toBe(false);
  });

  it('handles malformed entries safely', () => {
    expect(isAgileflowEntry(null)).toBe(false);
    expect(isAgileflowEntry({})).toBe(false);
    expect(isAgileflowEntry({ hooks: null })).toBe(false);
    expect(isAgileflowEntry({ hooks: [{ type: 'http', url: 'agileflow hook' }] })).toBe(false);
  });
});

describe('mergeManagedHooks', () => {
  it('returns a settings object with all 4 events we manage populated', () => {
    const merged = mergeManagedHooks({});
    expect(Object.keys(merged.hooks).sort()).toEqual(
      [...MANAGED_EVENTS].sort(),
    );
  });

  it('registers 3 PreToolUse entries (Bash / Edit / Write)', () => {
    const merged = mergeManagedHooks({});
    const matchers = merged.hooks.PreToolUse.map((e) => e.matcher);
    expect(matchers.sort()).toEqual(['Bash', 'Edit', 'Write']);
  });

  it('preserves user entries on managed events', () => {
    const existing = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Notebook',
            hooks: [{ type: 'command', command: 'echo notebook hook' }],
          },
        ],
      },
    };
    const merged = mergeManagedHooks(existing);
    const userEntry = merged.hooks.PreToolUse.find((e) => e.matcher === 'Notebook');
    expect(userEntry).toBeDefined();
    expect(userEntry.hooks[0].command).toBe('echo notebook hook');
  });

  it('replaces (does not duplicate) prior AgileFlow entries', () => {
    // Simulate a settings.json from a previous install: it already has
    // our entries. A re-install should not double them.
    const first = mergeManagedHooks({});
    const second = mergeManagedHooks(first);
    expect(second.hooks.PreToolUse).toHaveLength(3);
    expect(second.hooks.SessionStart).toHaveLength(1);
  });

  it('treats hooks=[] (array) as missing instead of spreading garbage keys', () => {
    const merged = mergeManagedHooks({ hooks: [] });
    // Plain object with our managed events; no numeric keys.
    expect(Array.isArray(merged.hooks)).toBe(false);
    expect(Object.keys(merged.hooks).sort()).toEqual([...MANAGED_EVENTS].sort());
    for (const k of Object.keys(merged.hooks)) {
      expect(/^\d+$/.test(k)).toBe(false);
    }
  });

  it('preserves non-hook fields (permissions, env, etc.)', () => {
    const existing = {
      permissions: { allow: ['Bash(npm test)'] },
      env: { FOO: 'bar' },
    };
    const merged = mergeManagedHooks(existing);
    expect(merged.permissions).toEqual({ allow: ['Bash(npm test)'] });
    expect(merged.env).toEqual({ FOO: 'bar' });
  });

  it('preserves entries on events we DO NOT manage', () => {
    const existing = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: 'echo user-hook' }] },
        ],
      },
    };
    const merged = mergeManagedHooks(existing);
    expect(merged.hooks.UserPromptSubmit).toEqual(existing.hooks.UserPromptSubmit);
  });

  it('every managed entry references the agileflow hook command', () => {
    const merged = mergeManagedHooks({});
    for (const event of MANAGED_EVENTS) {
      for (const entry of merged.hooks[event]) {
        expect(isAgileflowEntry(entry)).toBe(true);
      }
    }
  });
});

describe('unmanageHooks', () => {
  it('strips AgileFlow entries from managed events', () => {
    const merged = mergeManagedHooks({});
    const stripped = unmanageHooks(merged);
    expect(stripped.hooks).toBeUndefined();
  });

  it('preserves user entries on managed events', () => {
    const existing = mergeManagedHooks({
      hooks: {
        PreToolUse: [
          { matcher: 'Notebook', hooks: [{ type: 'command', command: 'echo nb' }] },
        ],
      },
    });
    const stripped = unmanageHooks(existing);
    expect(stripped.hooks.PreToolUse).toHaveLength(1);
    expect(stripped.hooks.PreToolUse[0].matcher).toBe('Notebook');
  });

  it('treats hooks=[] (array) as no-op input (no garbage keys)', () => {
    const stripped = unmanageHooks({ hooks: [] });
    expect(stripped.hooks).toEqual([]);
  });

  it('preserves entries on unmanaged events', () => {
    const existing = mergeManagedHooks({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo u' }] }],
      },
    });
    const stripped = unmanageHooks(existing);
    expect(stripped.hooks.UserPromptSubmit).toBeDefined();
  });

  it('preserves non-hook fields', () => {
    const existing = mergeManagedHooks({ permissions: { allow: ['Bash(*)'] } });
    const stripped = unmanageHooks(existing);
    expect(stripped.permissions).toEqual({ allow: ['Bash(*)'] });
  });
});

describe('writeClaudeCodeSettings + removeClaudeCodeSettings', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cc-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('creates .claude/settings.json with the 6 hook registrations', async () => {
    const out = await writeClaudeCodeSettings(scratch);
    expect(out).toBe(path.join(scratch, '.claude', 'settings.json'));
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(Object.keys(parsed.hooks).sort()).toEqual([...MANAGED_EVENTS].sort());
    expect(parsed.hooks.PreToolUse).toHaveLength(3);
    for (const event of MANAGED_EVENTS) {
      for (const entry of parsed.hooks[event]) {
        expect(entry.hooks[0].command).toContain(HOOK_COMMAND_MARKER);
      }
    }
  });

  it('removes our entries while preserving user entries on a switch-away', async () => {
    // Existing settings.json has both AgileFlow and user entries.
    const settingsPath = path.join(scratch, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath));
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'npx --no-install agileflow hook PreToolUse --matcher Bash' }] },
            { matcher: 'Notebook', hooks: [{ type: 'command', command: 'echo notebook' }] },
          ],
        },
        permissions: { allow: ['Bash(npm test)'] },
      }, null, 2),
    );

    await removeClaudeCodeSettings(scratch);
    const reloaded = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(reloaded.hooks.PreToolUse).toHaveLength(1);
    expect(reloaded.hooks.PreToolUse[0].matcher).toBe('Notebook');
    expect(reloaded.permissions).toEqual({ allow: ['Bash(npm test)'] });
  });

  it('deletes settings.json when removing leaves it empty', async () => {
    await writeClaudeCodeSettings(scratch);
    expect(fs.existsSync(path.join(scratch, '.claude', 'settings.json'))).toBe(true);
    await removeClaudeCodeSettings(scratch);
    expect(fs.existsSync(path.join(scratch, '.claude', 'settings.json'))).toBe(false);
  });

  it('is idempotent (write twice produces the same file content)', async () => {
    await writeClaudeCodeSettings(scratch);
    const first = fs.readFileSync(path.join(scratch, '.claude', 'settings.json'), 'utf8');
    await writeClaudeCodeSettings(scratch);
    const second = fs.readFileSync(path.join(scratch, '.claude', 'settings.json'), 'utf8');
    expect(first).toBe(second);
  });

  it('atomically writes (no .tmp- artifacts on success)', async () => {
    await writeClaudeCodeSettings(scratch);
    const claudeDir = path.join(scratch, '.claude');
    const siblings = fs.readdirSync(claudeDir);
    expect(siblings.filter((s) => s.startsWith('.settings.json.tmp-'))).toEqual([]);
    expect(siblings).toContain('settings.json');
  });

  it('handles existing malformed settings.json by treating as empty', async () => {
    const settingsPath = path.join(scratch, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, '{ not json');
    await writeClaudeCodeSettings(scratch);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(parsed.hooks.SessionStart).toHaveLength(1);
  });
});

describe('MANAGED_HOOKS structure', () => {
  it('all 6 entries reference the unified agileflow hook command', () => {
    expect(MANAGED_HOOKS).toHaveLength(6);
    for (const h of MANAGED_HOOKS) {
      expect(h.command).toContain('agileflow hook');
    }
  });

  it('PreToolUse has 3 matcher-distinguished entries', () => {
    const ptu = MANAGED_HOOKS.filter((h) => h.event === 'PreToolUse');
    expect(ptu.map((h) => h.matcher).sort()).toEqual(['Bash', 'Edit', 'Write']);
  });
});
