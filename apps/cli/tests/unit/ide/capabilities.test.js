/**
 * Unit tests for the IDE capability map.
 */
import { describe, it, expect } from 'vitest';

import capsModule from '../../../src/runtime/ide/capabilities.js';

const { IDE_CAPABILITIES, SUPPORTED_IDES, capabilitiesFor, supports } = capsModule;

describe('IDE_CAPABILITIES', () => {
  it('lists the four supported targets', () => {
    expect(SUPPORTED_IDES.sort()).toEqual(['claude-code', 'codex', 'cursor', 'windsurf']);
  });

  it('claude-code is the full-feature target', () => {
    const c = IDE_CAPABILITIES['claude-code'];
    expect(c.hooks).toBe(true);
    expect(c.skills).toBe(true);
    expect(c.commands).toBe(true);
    expect(c.agents).toBe(true);
    expect(c.mcp).toBe(true);
  });

  it('non-claude-code IDEs have hooks disabled (the v3 hook system is Claude-Code-specific)', () => {
    expect(IDE_CAPABILITIES.cursor.hooks).toBe(false);
    expect(IDE_CAPABILITIES.windsurf.hooks).toBe(false);
    expect(IDE_CAPABILITIES.codex.hooks).toBe(false);
  });

  it('every IDE has a settingsFile path that points inside its dotdir', () => {
    for (const id of SUPPORTED_IDES) {
      const caps = IDE_CAPABILITIES[id];
      expect(caps.settingsFile.startsWith(`.${id === 'claude-code' ? 'claude' : id}/`)).toBe(true);
    }
  });
});

describe('capabilitiesFor', () => {
  it('returns the same object as IDE_CAPABILITIES for a known id', () => {
    expect(capabilitiesFor('claude-code')).toBe(IDE_CAPABILITIES['claude-code']);
  });

  it('throws on an unknown id with the supported list in the message', () => {
    expect(() => capabilitiesFor('emacs')).toThrow(/Unknown IDE "emacs"/);
    expect(() => capabilitiesFor('emacs')).toThrow(/claude-code/);
  });
});

describe('supports', () => {
  it('returns the boolean value of the requested feature', () => {
    expect(supports('claude-code', 'hooks')).toBe(true);
    expect(supports('cursor', 'hooks')).toBe(false);
  });

  it('returns false for unknown ides without throwing', () => {
    expect(supports('emacs', 'hooks')).toBe(false);
  });
});
