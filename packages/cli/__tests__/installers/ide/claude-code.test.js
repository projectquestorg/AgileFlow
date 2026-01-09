/**
 * Tests for claude-code.js
 *
 * Tests the ClaudeCodeSetup class functionality
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const { ClaudeCodeSetup } = require('../../../tools/cli/installers/ide/claude-code');

describe('ClaudeCodeSetup', () => {
  let tempDir;
  let agileflowDir;
  let claudeSetup;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-code-test-'));
    agileflowDir = path.join(tempDir, '.agileflow');
    claudeSetup = new ClaudeCodeSetup();

    // Create mock agileflow installation structure
    await fs.ensureDir(path.join(agileflowDir, 'commands'));
    await fs.ensureDir(path.join(agileflowDir, 'agents'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('sets correct name and displayName', () => {
      expect(claudeSetup.name).toBe('claude-code');
      expect(claudeSetup.displayName).toBe('Claude Code');
      expect(claudeSetup.preferred).toBe(true);
    });

    it('sets correct config directory', () => {
      expect(claudeSetup.configDir).toBe('.claude');
      expect(claudeSetup.commandsDir).toBe('commands');
    });
  });

  describe('setup', () => {
    beforeEach(async () => {
      // Create some test commands and agents
      await fs.writeFile(
        path.join(agileflowDir, 'commands', 'help.md'),
        '# Help Command\nThis is the help command.'
      );
      await fs.writeFile(
        path.join(agileflowDir, 'commands', 'status.md'),
        '# Status Command\nThis shows status.'
      );
      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'ui.md'),
        '---\nname: ui\ndescription: UI agent\ntools:\n  - Read\n---\n# UI Agent'
      );
    });

    it('creates .claude directory structure', async () => {
      const result = await claudeSetup.setup(tempDir, agileflowDir, { skipDamageControl: true });

      expect(result.success).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '.claude'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '.claude', 'commands', 'agileflow'))).toBe(
        true
      );
    });

    it('installs commands from agileflow directory', async () => {
      await claudeSetup.setup(tempDir, agileflowDir, { skipDamageControl: true });

      const commandsDir = path.join(tempDir, '.claude', 'commands', 'agileflow');
      expect(await fs.pathExists(path.join(commandsDir, 'help.md'))).toBe(true);
      expect(await fs.pathExists(path.join(commandsDir, 'status.md'))).toBe(true);
    });

    it('installs agents as slash commands', async () => {
      await claudeSetup.setup(tempDir, agileflowDir, { skipDamageControl: true });

      const agentsDir = path.join(tempDir, '.claude', 'commands', 'agileflow', 'agents');
      expect(await fs.pathExists(path.join(agentsDir, 'ui.md'))).toBe(true);
    });

    it('installs agents as spawnable subagents', async () => {
      await claudeSetup.setup(tempDir, agileflowDir, { skipDamageControl: true });

      const spawnableDir = path.join(tempDir, '.claude', 'agents', 'agileflow');
      expect(await fs.pathExists(path.join(spawnableDir, 'ui.md'))).toBe(true);
    });

    it('creates skills directory', async () => {
      await claudeSetup.setup(tempDir, agileflowDir, { skipDamageControl: true });

      expect(await fs.pathExists(path.join(tempDir, '.claude', 'skills'))).toBe(true);
    });

    it('returns command counts', async () => {
      const result = await claudeSetup.setup(tempDir, agileflowDir, { skipDamageControl: true });

      expect(result.commands).toBeGreaterThanOrEqual(3); // 2 commands + 1 agent
    });

    it('handles nested command directories', async () => {
      // Create nested command structure
      await fs.ensureDir(path.join(agileflowDir, 'commands', 'session'));
      await fs.writeFile(path.join(agileflowDir, 'commands', 'session', 'new.md'), '# Session New');

      await claudeSetup.setup(tempDir, agileflowDir, { skipDamageControl: true });

      const nestedPath = path.join(
        tempDir,
        '.claude',
        'commands',
        'agileflow',
        'session',
        'new.md'
      );
      expect(await fs.pathExists(nestedPath)).toBe(true);
    });
  });

  describe('setupDamageControl', () => {
    beforeEach(async () => {
      // Create mock damage-control scripts
      const damageControlDir = path.join(agileflowDir, 'scripts', 'damage-control');
      await fs.ensureDir(damageControlDir);
      await fs.writeFile(
        path.join(damageControlDir, 'bash-tool-damage-control.js'),
        '// bash damage control'
      );
      await fs.writeFile(
        path.join(damageControlDir, 'edit-tool-damage-control.js'),
        '// edit damage control'
      );
      await fs.writeFile(
        path.join(damageControlDir, 'write-tool-damage-control.js'),
        '// write damage control'
      );
      await fs.writeFile(path.join(damageControlDir, 'patterns.yaml'), 'bashToolPatterns: []');
    });

    it('copies damage control scripts to .claude/hooks', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.ensureDir(claudeDir);

      await claudeSetup.setupDamageControl(tempDir, agileflowDir, claudeDir, {});

      const hooksDir = path.join(claudeDir, 'hooks', 'damage-control');
      expect(await fs.pathExists(path.join(hooksDir, 'bash-tool-damage-control.js'))).toBe(true);
      expect(await fs.pathExists(path.join(hooksDir, 'edit-tool-damage-control.js'))).toBe(true);
      expect(await fs.pathExists(path.join(hooksDir, 'write-tool-damage-control.js'))).toBe(true);
    });

    it('copies patterns.yaml when not existing', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.ensureDir(claudeDir);

      await claudeSetup.setupDamageControl(tempDir, agileflowDir, claudeDir, {});

      const patternsPath = path.join(claudeDir, 'hooks', 'damage-control', 'patterns.yaml');
      expect(await fs.pathExists(patternsPath)).toBe(true);
    });

    it('preserves existing patterns.yaml', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const hooksDir = path.join(claudeDir, 'hooks', 'damage-control');
      await fs.ensureDir(hooksDir);
      await fs.writeFile(path.join(hooksDir, 'patterns.yaml'), 'custom: true');

      await claudeSetup.setupDamageControl(tempDir, agileflowDir, claudeDir, {});

      const content = await fs.readFile(path.join(hooksDir, 'patterns.yaml'), 'utf8');
      expect(content).toBe('custom: true');
    });

    it('handles missing source directory gracefully', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.ensureDir(claudeDir);

      // Remove damage-control directory
      await fs.remove(path.join(agileflowDir, 'scripts', 'damage-control'));

      // Should not throw
      await expect(
        claudeSetup.setupDamageControl(tempDir, agileflowDir, claudeDir, {})
      ).resolves.not.toThrow();
    });
  });

  describe('setupDamageControlHooks', () => {
    it('creates settings.json with hooks', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.ensureDir(claudeDir);

      await claudeSetup.setupDamageControlHooks(claudeDir);

      const settingsPath = path.join(claudeDir, 'settings.json');
      expect(await fs.pathExists(settingsPath)).toBe(true);

      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PreToolUse).toBeInstanceOf(Array);
    });

    it('adds Bash, Edit, and Write hooks', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.ensureDir(claudeDir);

      await claudeSetup.setupDamageControlHooks(claudeDir);

      const settings = JSON.parse(await fs.readFile(path.join(claudeDir, 'settings.json'), 'utf8'));

      const matchers = settings.hooks.PreToolUse.map(h => h.matcher);
      expect(matchers).toContain('Bash');
      expect(matchers).toContain('Edit');
      expect(matchers).toContain('Write');
    });

    it('merges with existing settings', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.ensureDir(claudeDir);
      await fs.writeFile(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({ existingKey: 'value' })
      );

      await claudeSetup.setupDamageControlHooks(claudeDir);

      const settings = JSON.parse(await fs.readFile(path.join(claudeDir, 'settings.json'), 'utf8'));
      expect(settings.existingKey).toBe('value');
      expect(settings.hooks).toBeDefined();
    });

    it('does not duplicate existing damage control hooks', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.ensureDir(claudeDir);

      // Run twice
      await claudeSetup.setupDamageControlHooks(claudeDir);
      await claudeSetup.setupDamageControlHooks(claudeDir);

      const settings = JSON.parse(await fs.readFile(path.join(claudeDir, 'settings.json'), 'utf8'));

      // Should only have 3 PreToolUse entries, not 6
      expect(settings.hooks.PreToolUse).toHaveLength(3);
    });

    it('handles invalid JSON in existing settings', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.ensureDir(claudeDir);
      await fs.writeFile(path.join(claudeDir, 'settings.json'), 'invalid json');

      // Should not throw, should create valid settings
      await expect(claudeSetup.setupDamageControlHooks(claudeDir)).resolves.not.toThrow();

      const settings = JSON.parse(await fs.readFile(path.join(claudeDir, 'settings.json'), 'utf8'));
      expect(settings.hooks).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('removes agileflow and AgileFlow directories', async () => {
      // Create old installation
      await fs.ensureDir(path.join(tempDir, '.claude', 'commands', 'agileflow'));
      await fs.ensureDir(path.join(tempDir, '.claude', 'commands', 'AgileFlow'));

      await claudeSetup.cleanup(tempDir);

      expect(await fs.pathExists(path.join(tempDir, '.claude', 'commands', 'agileflow'))).toBe(
        false
      );
      expect(await fs.pathExists(path.join(tempDir, '.claude', 'commands', 'AgileFlow'))).toBe(
        false
      );
    });
  });

  describe('detect', () => {
    it('returns true when .claude directory exists', async () => {
      await fs.ensureDir(path.join(tempDir, '.claude'));

      const detected = await claudeSetup.detect(tempDir);
      expect(detected).toBe(true);
    });

    it('returns false when .claude directory does not exist', async () => {
      const detected = await claudeSetup.detect(tempDir);
      expect(detected).toBe(false);
    });
  });
});
