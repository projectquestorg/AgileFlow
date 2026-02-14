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
      expect(IdeRegistry.getDisplayName('codex')).toBe('OpenAI Codex');
    });

    it('returns original name for invalid IDE', () => {
      expect(IdeRegistry.getDisplayName('unknown')).toBe('unknown');
    });
  });

  describe('getPreferred', () => {
    it('returns only preferred IDEs', () => {
      const preferred = IdeRegistry.getPreferred();
      expect(preferred).toContain('claude-code');
      // Windsurf was changed to non-preferred in f058b90
      expect(preferred).not.toContain('windsurf');
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

  describe('getChoices', () => {
    it('returns array of IDE choices for UI', () => {
      const choices = IdeRegistry.getChoices();
      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBe(4);
    });

    it('includes all required properties', () => {
      const choices = IdeRegistry.getChoices();
      for (const choice of choices) {
        expect(choice).toHaveProperty('name');
        expect(choice).toHaveProperty('value');
        expect(choice).toHaveProperty('checked');
        expect(choice).toHaveProperty('configDir');
        expect(choice).toHaveProperty('description');
      }
    });

    it('sorts preferred IDEs first', () => {
      const choices = IdeRegistry.getChoices();
      // Find indices of preferred and non-preferred IDEs
      const claudeIndex = choices.findIndex(c => c.value === 'claude-code');
      const cursorIndex = choices.findIndex(c => c.value === 'cursor');
      // Claude Code (preferred) should come before Cursor (not preferred)
      expect(claudeIndex).toBeLessThan(cursorIndex);
    });

    it('includes configDir with commandsSubdir', () => {
      const choices = IdeRegistry.getChoices();
      const claudeChoice = choices.find(c => c.value === 'claude-code');
      expect(claudeChoice.configDir).toBe('.claude/commands');
    });
  });

  describe('hasFeature', () => {
    it('returns true for IDE with feature', () => {
      expect(IdeRegistry.hasFeature('claude-code', 'damageControl')).toBe(true);
      expect(IdeRegistry.hasFeature('claude-code', 'spawnableAgents')).toBe(true);
      expect(IdeRegistry.hasFeature('codex', 'skills')).toBe(true);
    });

    it('returns false for IDE without feature', () => {
      expect(IdeRegistry.hasFeature('cursor', 'damageControl')).toBe(false);
      expect(IdeRegistry.hasFeature('windsurf', 'spawnableAgents')).toBe(false);
    });

    it('returns false for invalid IDE', () => {
      expect(IdeRegistry.hasFeature('invalid', 'damageControl')).toBe(false);
    });

    it('returns false for non-existent feature', () => {
      expect(IdeRegistry.hasFeature('claude-code', 'nonExistent')).toBe(false);
    });
  });

  describe('getWithFeature', () => {
    it('returns IDEs with damageControl feature', () => {
      const ides = IdeRegistry.getWithFeature('damageControl');
      expect(ides).toContain('claude-code');
      expect(ides).not.toContain('cursor');
      expect(ides).not.toContain('windsurf');
    });

    it('returns IDEs with skills feature', () => {
      const ides = IdeRegistry.getWithFeature('skills');
      expect(ides).toContain('claude-code');
      expect(ides).toContain('codex');
      expect(ides).not.toContain('cursor');
    });

    it('returns empty array for non-existent feature', () => {
      const ides = IdeRegistry.getWithFeature('nonExistent');
      expect(ides).toEqual([]);
    });
  });

  describe('getLabels', () => {
    it('returns custom labels for windsurf', () => {
      const labels = IdeRegistry.getLabels('windsurf');
      expect(labels.commands).toBe('workflows');
      expect(labels.agents).toBe('agent workflows');
    });

    it('returns custom labels for codex', () => {
      const labels = IdeRegistry.getLabels('codex');
      expect(labels.commands).toBe('prompts');
      expect(labels.agents).toBe('skills');
    });

    it('returns default labels for claude-code', () => {
      const labels = IdeRegistry.getLabels('claude-code');
      expect(labels.commands).toBe('commands');
      expect(labels.agents).toBe('agents');
    });

    it('returns default labels for invalid IDE', () => {
      const labels = IdeRegistry.getLabels('invalid');
      expect(labels.commands).toBe('commands');
      expect(labels.agents).toBe('agents');
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
        expect(metadata).toHaveProperty('commandsSubdir');
        expect(metadata).toHaveProperty('agileflowFolder');
        expect(metadata).toHaveProperty('targetSubdir');
        expect(metadata).toHaveProperty('preferred');
        expect(metadata).toHaveProperty('description');
        expect(metadata).toHaveProperty('handler');
        expect(metadata).toHaveProperty('labels');
        expect(metadata).toHaveProperty('features');
        expect(metadata.name).toBe(name);
      }
    });

    it('has labels with commands and agents properties', () => {
      for (const metadata of Object.values(IDE_REGISTRY)) {
        expect(metadata.labels).toHaveProperty('commands');
        expect(metadata.labels).toHaveProperty('agents');
      }
    });

    it('has features object for all IDEs', () => {
      for (const metadata of Object.values(IDE_REGISTRY)) {
        expect(typeof metadata.features).toBe('object');
      }
    });
  });
});
