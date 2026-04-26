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

  it.each(['SessionStart', 'PreCompact', 'Stop', 'PreToolUse:Bash', 'PreToolUse:Edit', 'PreToolUse:Write'])(
    'accepts known event %s',
    (event) => {
      const h = normalizeHook({ id: 'a', event, script: 'a.js' }, 0);
      expect(h.event).toBe(event);
    },
  );

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
  it('includes all six Claude Code hook entry points', () => {
    expect(VALID_EVENTS.size).toBe(6);
    expect(VALID_EVENTS.has('SessionStart')).toBe(true);
    expect(VALID_EVENTS.has('PreToolUse:Bash')).toBe(true);
    expect(VALID_EVENTS.has('PreToolUse:Edit')).toBe(true);
    expect(VALID_EVENTS.has('PreToolUse:Write')).toBe(true);
    expect(VALID_EVENTS.has('PreCompact')).toBe(true);
    expect(VALID_EVENTS.has('Stop')).toBe(true);
  });
});
