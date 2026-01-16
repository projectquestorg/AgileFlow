/**
 * Tests for IDE Registry
 */

const path = require('path');
const { IdeRegistry, IDE_REGISTRY } = require('../../tools/cli/lib/ide-registry');

describe('IdeRegistry', () => {
  describe('getAll', () => {
    it('returns all registered IDE names', () => {
      const ides = IdeRegistry.getAll();
      expect(ides).toContain('claude-code');
      expect(ides).toContain('cursor');
      expect(ides).toContain('windsurf');
      expect(ides).toContain('codex');
      expect(ides).toHaveLength(4);
    });
  });

  describe('getAllMetadata', () => {
    it('returns all IDE metadata', () => {
      const metadata = IdeRegistry.getAllMetadata();
      expect(metadata).toHaveProperty('claude-code');
      expect(metadata).toHaveProperty('cursor');
      expect(metadata).toHaveProperty('windsurf');
      expect(metadata).toHaveProperty('codex');
    });

    it('returns a copy (not the original)', () => {
      const metadata = IdeRegistry.getAllMetadata();
      metadata['test'] = { name: 'test' };
      expect(IdeRegistry.getAllMetadata()).not.toHaveProperty('test');
    });
  });

  describe('get', () => {
    it('returns metadata for valid IDE', () => {
      const metadata = IdeRegistry.get('claude-code');
      expect(metadata).toMatchObject({
        name: 'claude-code',
        displayName: 'Claude Code',
        configDir: '.claude',
        preferred: true,
      });
    });

    it('returns null for invalid IDE', () => {
      expect(IdeRegistry.get('invalid')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(IdeRegistry.get('')).toBeNull();
    });
  });

  describe('exists', () => {
    it('returns true for valid IDE', () => {
      expect(IdeRegistry.exists('claude-code')).toBe(true);
      expect(IdeRegistry.exists('cursor')).toBe(true);
      expect(IdeRegistry.exists('windsurf')).toBe(true);
      expect(IdeRegistry.exists('codex')).toBe(true);
    });

    it('returns false for invalid IDE', () => {
      expect(IdeRegistry.exists('invalid')).toBe(false);
      expect(IdeRegistry.exists('')).toBe(false);
    });
  });

  describe('getConfigPath', () => {
    const projectDir = '/test/project';

    it('returns correct path for claude-code', () => {
      const expected = path.join(projectDir, '.claude', 'commands/agileflow');
      expect(IdeRegistry.getConfigPath('claude-code', projectDir)).toBe(expected);
    });

    it('returns correct path for cursor', () => {
      const expected = path.join(projectDir, '.cursor', 'commands/AgileFlow');
      expect(IdeRegistry.getConfigPath('cursor', projectDir)).toBe(expected);
    });

    it('returns correct path for windsurf', () => {
      const expected = path.join(projectDir, '.windsurf', 'workflows/agileflow');
      expect(IdeRegistry.getConfigPath('windsurf', projectDir)).toBe(expected);
    });

    it('returns correct path for codex', () => {
      const expected = path.join(projectDir, '.codex', 'skills');
      expect(IdeRegistry.getConfigPath('codex', projectDir)).toBe(expected);
    });

    it('returns empty string for invalid IDE', () => {
      expect(IdeRegistry.getConfigPath('invalid', projectDir)).toBe('');
    });
  });

  describe('getBaseDir', () => {
    const projectDir = '/test/project';

    it('returns correct base dir for claude-code', () => {
      expect(IdeRegistry.getBaseDir('claude-code', projectDir)).toBe(
        path.join(projectDir, '.claude')
      );
    });

    it('returns correct base dir for cursor', () => {
      expect(IdeRegistry.getBaseDir('cursor', projectDir)).toBe(path.join(projectDir, '.cursor'));
    });

    it('returns empty string for invalid IDE', () => {
      expect(IdeRegistry.getBaseDir('invalid', projectDir)).toBe('');
    });
  });

  describe('getDisplayName', () => {
    it('returns display name for valid IDE', () => {
      expect(IdeRegistry.getDisplayName('claude-code')).toBe('Claude Code');
      expect(IdeRegistry.getDisplayName('cursor')).toBe('Cursor');
      expect(IdeRegistry.getDisplayName('windsurf')).toBe('Windsurf');
      expect(IdeRegistry.getDisplayName('codex')).toBe('OpenAI Codex CLI');
    });

    it('returns original name for invalid IDE', () => {
      expect(IdeRegistry.getDisplayName('unknown')).toBe('unknown');
    });
  });

  describe('getPreferred', () => {
    it('returns only preferred IDEs', () => {
      const preferred = IdeRegistry.getPreferred();
      expect(preferred).toContain('claude-code');
      expect(preferred).toContain('windsurf');
      expect(preferred).not.toContain('cursor');
      expect(preferred).not.toContain('codex');
    });
  });

  describe('validate', () => {
    it('returns ok for valid IDE', () => {
      expect(IdeRegistry.validate('claude-code')).toEqual({ ok: true });
      expect(IdeRegistry.validate('cursor')).toEqual({ ok: true });
    });

    it('returns error for invalid IDE', () => {
      const result = IdeRegistry.validate('invalid');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unknown IDE');
      expect(result.error).toContain('invalid');
    });

    it('returns error for empty string', () => {
      const result = IdeRegistry.validate('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('returns error for null', () => {
      const result = IdeRegistry.validate(null);
      expect(result.ok).toBe(false);
    });

    it('returns error for non-string', () => {
      const result = IdeRegistry.validate(123);
      expect(result.ok).toBe(false);
    });
  });

  describe('getHandler', () => {
    it('returns handler class name for valid IDE', () => {
      expect(IdeRegistry.getHandler('claude-code')).toBe('ClaudeCodeSetup');
      expect(IdeRegistry.getHandler('cursor')).toBe('CursorSetup');
      expect(IdeRegistry.getHandler('windsurf')).toBe('WindsurfSetup');
      expect(IdeRegistry.getHandler('codex')).toBe('CodexSetup');
    });

    it('returns null for invalid IDE', () => {
      expect(IdeRegistry.getHandler('invalid')).toBeNull();
    });
  });

  describe('IDE_REGISTRY constant', () => {
    it('exports the registry object', () => {
      expect(IDE_REGISTRY).toHaveProperty('claude-code');
      expect(IDE_REGISTRY).toHaveProperty('cursor');
      expect(IDE_REGISTRY).toHaveProperty('windsurf');
      expect(IDE_REGISTRY).toHaveProperty('codex');
    });

    it('has consistent structure for all IDEs', () => {
      for (const [name, metadata] of Object.entries(IDE_REGISTRY)) {
        expect(metadata).toHaveProperty('name');
        expect(metadata).toHaveProperty('displayName');
        expect(metadata).toHaveProperty('configDir');
        expect(metadata).toHaveProperty('targetSubdir');
        expect(metadata).toHaveProperty('preferred');
        expect(metadata).toHaveProperty('handler');
        expect(metadata.name).toBe(name);
      }
    });
  });
});
