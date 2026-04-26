/**
 * Unit tests for the hook manifest loader.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import manifestModule from '../../../src/runtime/hooks/manifest-loader.js';

const {
  loadHookManifest,
  normalizeManifest,
  normalizeHook,
  VALID_EVENTS,
  MANIFEST_VERSION,
  DEFAULT_TIMEOUT_MS,
} = manifestModule;

describe('normalizeHook', () => {
  it('accepts a fully-specified hook entry', () => {
    const h = normalizeHook(
      {
        id: 'a',
        event: 'SessionStart',
        script: 'hooks/a.js',
        runAfter: ['b'],
        timeout: 3000,
        skipOnError: false,
        enabled: true,
      },
      0,
    );
    expect(h).toEqual({
      id: 'a',
      event: 'SessionStart',
      matcher: null,
      script: 'hooks/a.js',
      runAfter: ['b'],
      timeout: 3000,
      skipOnError: false,
      enabled: true,
    });
  });

  it('applies defaults for optional fields', () => {
    const h = normalizeHook(
      { id: 'a', event: 'SessionStart', script: 'hooks/a.js' },
      0,
    );
    expect(h.runAfter).toEqual([]);
    expect(h.timeout).toBe(DEFAULT_TIMEOUT_MS);
    expect(h.skipOnError).toBe(true);
    expect(h.enabled).toBe(true);
  });

  it('rejects non-object entries', () => {
    expect(() => normalizeHook(null, 0)).toThrow(/must be an object/);
    expect(() => normalizeHook('string', 0)).toThrow(/must be an object/);
    expect(() => normalizeHook([1, 2], 0)).toThrow(/must be an object/);
  });

  it('rejects entries with no id', () => {
    expect(() => normalizeHook({ event: 'SessionStart', script: 'a.js' }, 0))
      .toThrow(/id must be a non-empty string/);
  });

  it('rejects unknown events', () => {
    expect(() =>
      normalizeHook({ id: 'a', event: 'NotAnEvent', script: 'a.js' }, 0),
    ).toThrow(/event must be one of/);
  });

  it.each([
    'SessionStart',
    'SessionEnd',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PreCompact',
    'PostCompact',
    'Stop',
    'SubagentStop',
    'TaskCreated',
    'FileChanged',
    'Notification',
  ])('accepts known event %s', (event) => {
    const h = normalizeHook({ id: 'a', event, script: 'a.js' }, 0);
    expect(h.event).toBe(event);
  });

  describe('matcher field', () => {
    it('accepts a matcher on PreToolUse', () => {
      const h = normalizeHook(
        { id: 'a', event: 'PreToolUse', matcher: 'Bash', script: 'a.js' },
        0,
      );
      expect(h.matcher).toBe('Bash');
    });

    it('accepts a matcher on PostToolUse', () => {
      const h = normalizeHook(
        { id: 'a', event: 'PostToolUse', matcher: 'Bash|Edit', script: 'a.js' },
        0,
      );
      expect(h.matcher).toBe('Bash|Edit');
    });

    it('rejects a matcher on non-tool events', () => {
      expect(() =>
        normalizeHook(
          { id: 'a', event: 'SessionStart', matcher: 'Bash', script: 'a.js' },
          0,
        ),
      ).toThrow(/matcher is not allowed on event "SessionStart"/);
    });

    it('rejects non-string matcher', () => {
      expect(() =>
        normalizeHook(
          { id: 'a', event: 'PreToolUse', matcher: 42, script: 'a.js' },
          0,
        ),
      ).toThrow(/matcher must be a string/);
    });

    it('defaults matcher to null when omitted', () => {
      const h = normalizeHook({ id: 'a', event: 'PreToolUse', script: 'a.js' }, 0);
      expect(h.matcher).toBeNull();
    });
  });

  it('rejects non-array runAfter', () => {
    expect(() =>
      normalizeHook({ id: 'a', event: 'Stop', script: 'a.js', runAfter: 'b' }, 0),
    ).toThrow(/runAfter must be an array/);
  });

  it('rejects negative timeouts', () => {
    expect(() =>
      normalizeHook({ id: 'a', event: 'Stop', script: 'a.js', timeout: -1 }, 0),
    ).toThrow(/non-negative number/);
  });

  it('rejects non-boolean enabled / skipOnError', () => {
    expect(() =>
      normalizeHook({ id: 'a', event: 'Stop', script: 'a.js', enabled: 'yes' }, 0),
    ).toThrow(/enabled must be a boolean/);
    expect(() =>
      normalizeHook({ id: 'a', event: 'Stop', script: 'a.js', skipOnError: 1 }, 0),
    ).toThrow(/skipOnError must be a boolean/);
  });
});

describe('normalizeManifest', () => {
  it('rejects wrong version', () => {
    expect(() => normalizeManifest({ version: 2, hooks: [] })).toThrow(
      /version must be 1/,
    );
  });

  it('rejects missing hooks array', () => {
    expect(() => normalizeManifest({ version: 1 })).toThrow(/`hooks` must be an array/);
  });

  it('rejects duplicate hook ids', () => {
    expect(() =>
      normalizeManifest({
        version: 1,
        hooks: [
          { id: 'a', event: 'Stop', script: 'a.js' },
          { id: 'a', event: 'SessionStart', script: 'a.js' },
        ],
      }),
    ).toThrow(/duplicate hook id: a/);
  });

  it('returns a normalized manifest with defaults filled in', () => {
    const m = normalizeManifest({
      version: 1,
      hooks: [{ id: 'a', event: 'Stop', script: 'a.js' }],
    });
    expect(m.version).toBe(MANIFEST_VERSION);
    expect(m.hooks[0].timeout).toBe(DEFAULT_TIMEOUT_MS);
  });
});

describe('loadHookManifest', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-hook-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('returns null when the file is missing', async () => {
    expect(await loadHookManifest(path.join(scratch, 'no-such.yaml'))).toBeNull();
  });

  it('throws on invalid YAML with the path in the message', async () => {
    const p = path.join(scratch, 'bad.yaml');
    fs.writeFileSync(p, 'version: 1\nhooks: [unclosed');
    await expect(loadHookManifest(p)).rejects.toThrow(/Invalid YAML/);
    await expect(loadHookManifest(p)).rejects.toThrow(p);
  });

  it('parses a valid manifest', async () => {
    const p = path.join(scratch, 'manifest.yaml');
    fs.writeFileSync(
      p,
      'version: 1\nhooks:\n  - id: welcome\n    event: SessionStart\n    script: .agileflow/plugins/core/hooks/welcome.js\n',
    );
    const m = await loadHookManifest(p);
    expect(m.hooks).toHaveLength(1);
    expect(m.hooks[0].id).toBe('welcome');
    expect(m.hooks[0].event).toBe('SessionStart');
  });
});

describe('VALID_EVENTS', () => {
  it('matches the official Claude Code hooks reference (28 events)', () => {
    expect(VALID_EVENTS.size).toBe(28);
    expect(VALID_EVENTS.has('SessionStart')).toBe(true);
    expect(VALID_EVENTS.has('SessionEnd')).toBe(true);
    expect(VALID_EVENTS.has('UserPromptSubmit')).toBe(true);
    expect(VALID_EVENTS.has('PreToolUse')).toBe(true);
    expect(VALID_EVENTS.has('PostToolUse')).toBe(true);
    expect(VALID_EVENTS.has('PreCompact')).toBe(true);
    expect(VALID_EVENTS.has('Stop')).toBe(true);
    expect(VALID_EVENTS.has('SubagentStop')).toBe(true);
    expect(VALID_EVENTS.has('TaskCreated')).toBe(true);
    expect(VALID_EVENTS.has('FileChanged')).toBe(true);
    // Synthetic event names from the previous schema must be rejected.
    expect(VALID_EVENTS.has('PreToolUse:Bash')).toBe(false);
  });
});
