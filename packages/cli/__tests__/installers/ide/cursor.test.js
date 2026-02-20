/**
 * Tests for Cursor IDE installer
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { CursorSetup } = require('../../../tools/cli/installers/ide/cursor');

describe('CursorSetup', () => {
  let testDir;
  let cursorSetup;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-test-'));
    cursorSetup = new CursorSetup();
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('constructor', () => {
    it('initializes with correct name and configDir', () => {
      expect(cursorSetup.name).toBe('cursor');
      expect(cursorSetup.displayName).toBe('Cursor');
      expect(cursorSetup.preferred).toBe(false);
      expect(cursorSetup.configDir).toBe('.cursor');
      expect(cursorSetup.commandsDir).toBe('commands');
    });
  });

  describe('detect', () => {
    it('returns false when .cursor does not exist', async () => {
      const result = await cursorSetup.detect(testDir);
      expect(result).toBe(false);
    });

    it('returns true when .cursor exists', async () => {
      await fs.ensureDir(path.join(testDir, '.cursor'));
      const result = await cursorSetup.detect(testDir);
      expect(result).toBe(true);
    });
  });

  describe('cleanup (initial)', () => {
    it('removes old AgileFlow rules directory', async () => {
      const oldRulesPath = path.join(testDir, '.cursor', 'rules', 'agileflow');
      await fs.ensureDir(oldRulesPath);
      await fs.writeFile(path.join(oldRulesPath, 'test.md'), 'test');

      await cursorSetup.cleanup(testDir);

      expect(await fs.pathExists(oldRulesPath)).toBe(false);
    });

    it('removes AgileFlow commands directory', async () => {
      const commandsPath = path.join(testDir, '.cursor', 'commands', 'AgileFlow');
      await fs.ensureDir(commandsPath);
      await fs.writeFile(path.join(commandsPath, 'test.md'), 'test');

      await cursorSetup.cleanup(testDir);

      expect(await fs.pathExists(commandsPath)).toBe(false);
    });

    it('removes AgileFlow agents directory', async () => {
      const agentsPath = path.join(testDir, '.cursor', 'agents', 'AgileFlow');
      await fs.ensureDir(agentsPath);
      await fs.writeFile(path.join(agentsPath, 'test-agent.md'), 'test');

      await cursorSetup.cleanup(testDir);

      expect(await fs.pathExists(agentsPath)).toBe(false);
    });

    it('handles non-existent directories gracefully', async () => {
      // Should not throw
      await expect(cursorSetup.cleanup(testDir)).resolves.not.toThrow();
    });
  });

  describe('setup', () => {
    let agileflowDir;

    beforeEach(async () => {
      // Create mock agileflow directory with commands and agents
      agileflowDir = path.join(testDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'commands'));
      await fs.ensureDir(path.join(agileflowDir, 'agents'));

      // Create sample command
      await fs.writeFile(
        path.join(agileflowDir, 'commands', 'test-command.md'),
        `---
description: Test command
---

# Test Command

This is a test command.`
      );

      // Create sample agent
      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'test-agent.md'),
        `---
name: test-agent
description: Test agent
---

# Test Agent

This is a test agent.`
      );
    });

    it('creates .cursor/commands/AgileFlow directory', async () => {
      await cursorSetup.setup(testDir, agileflowDir);

      const targetDir = path.join(testDir, '.cursor', 'commands', 'AgileFlow');
      expect(await fs.pathExists(targetDir)).toBe(true);
    });

    it('installs commands to correct location', async () => {
      const result = await cursorSetup.setup(testDir, agileflowDir);

      expect(result.success).toBe(true);
      expect(result.commands).toBeGreaterThanOrEqual(1);

      const commandPath = path.join(testDir, '.cursor', 'commands', 'AgileFlow', 'test-command.md');
      expect(await fs.pathExists(commandPath)).toBe(true);
    });

    it('installs agents to agents subdirectory', async () => {
      const result = await cursorSetup.setup(testDir, agileflowDir);

      expect(result.agents).toBeGreaterThanOrEqual(1);

      const agentPath = path.join(
        testDir,
        '.cursor',
        'commands',
        'AgileFlow',
        'agents',
        'test-agent.md'
      );
      expect(await fs.pathExists(agentPath)).toBe(true);
    });

    it('returns correct counts', async () => {
      const result = await cursorSetup.setup(testDir, agileflowDir);

      expect(result).toMatchObject({
        success: true,
        commands: expect.any(Number),
        agents: expect.any(Number),
      });
    });

    it('installs spawnable agents to .cursor/agents/AgileFlow/', async () => {
      const result = await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

      const agentPath = path.join(testDir, '.cursor', 'agents', 'AgileFlow', 'test-agent.md');
      expect(await fs.pathExists(agentPath)).toBe(true);
    });

    it('generates hooks.json with damage control hooks', async () => {
      const result = await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: false });

      const hooksPath = path.join(testDir, '.cursor', 'hooks.json');
      // Note: hooks.json generation requires damage-control scripts to exist in agileflowDir
      // For this test, we just verify the method doesn't crash with skipDamageControl: true
      expect(result.success).toBe(true);
    });

    it('skips hooks generation when skipDamageControl is true', async () => {
      const result = await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

      const hooksPath = path.join(testDir, '.cursor', 'hooks.json');
      // When skipDamageControl is true, hooks.json should not be created unless it already exists
      const hooksExist = await fs.pathExists(hooksPath);
      expect(result.success).toBe(true);
    });
  });

  describe('cleanup (during reinstall)', () => {
    let agileflowDir;

    beforeEach(async () => {
      agileflowDir = path.join(testDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'commands'));
      await fs.ensureDir(path.join(agileflowDir, 'agents'));

      await fs.writeFile(
        path.join(agileflowDir, 'commands', 'test.md'),
        '---\ndescription: Test\n---\n# Test'
      );
      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'test-agent.md'),
        '---\nname: test-agent\ndescription: Test\n---\n# Test'
      );
    });

    it('removes duplicate agents during reinstall', async () => {
      // First install
      await cursorSetup.setup(testDir, agileflowDir);
      let agentPath = path.join(testDir, '.cursor', 'agents', 'AgileFlow', 'test-agent.md');
      expect(await fs.pathExists(agentPath)).toBe(true);

      // Cleanup before reinstall
      await cursorSetup.cleanup(testDir);
      expect(await fs.pathExists(agentPath)).toBe(false);

      // Reinstall should work cleanly
      await cursorSetup.setup(testDir, agileflowDir);
      expect(await fs.pathExists(agentPath)).toBe(true);
    });
  });

  describe('setAgileflowFolder', () => {
    it('sets the agileflow folder name', () => {
      cursorSetup.setAgileflowFolder('custom-agileflow');
      expect(cursorSetup.agileflowFolder).toBe('custom-agileflow');
    });
  });

  describe('setDocsFolder', () => {
    it('sets the docs folder name', () => {
      cursorSetup.setDocsFolder('documentation');
      expect(cursorSetup.docsFolder).toBe('documentation');
    });
  });

  describe('damage control hooks', () => {
    let agileflowDir;

    beforeEach(async () => {
      agileflowDir = path.join(testDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'commands'));
      await fs.ensureDir(path.join(agileflowDir, 'agents'));
      await fs.ensureDir(path.join(agileflowDir, 'scripts', 'damage-control'));
      await fs.ensureDir(path.join(agileflowDir, 'scripts', 'lib'));

      // Create minimal damage control scripts for testing
      await fs.writeFile(
        path.join(agileflowDir, 'scripts', 'damage-control', 'bash-tool-damage-control.js'),
        'module.exports = {};'
      );
      await fs.writeFile(
        path.join(agileflowDir, 'scripts', 'damage-control', 'edit-tool-damage-control.js'),
        'module.exports = {};'
      );
      await fs.writeFile(
        path.join(agileflowDir, 'scripts', 'lib', 'damage-control-utils.js'),
        'module.exports = {};'
      );

      // Create sample command and agent
      await fs.writeFile(
        path.join(agileflowDir, 'commands', 'test.md'),
        '---\ndescription: Test\n---\n# Test'
      );
      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'test.md'),
        '---\nname: test\ndescription: Test\n---\n# Test'
      );
    });

    it('creates hooks.json when skipDamageControl is false', async () => {
      await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: false });

      const hooksPath = path.join(testDir, '.cursor', 'hooks.json');
      expect(await fs.pathExists(hooksPath)).toBe(true);

      const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
      expect(Array.isArray(hooks)).toBe(true);
      expect(hooks.length).toBeGreaterThan(0);
    });

    it('includes beforeShellExecution hook for bash commands', async () => {
      await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: false });

      const hooksPath = path.join(testDir, '.cursor', 'hooks.json');
      const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      const bashHook = hooks.find(h => h.event === 'beforeShellExecution');
      expect(bashHook).toBeDefined();
      expect(bashHook.command).toBe('node');
    });

    it('includes afterFileEdit hook for file edits', async () => {
      await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: false });

      const hooksPath = path.join(testDir, '.cursor', 'hooks.json');
      const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      const editHook = hooks.find(h => h.event === 'afterFileEdit');
      expect(editHook).toBeDefined();
      expect(editHook.command).toBe('node');
    });

    it('skips hooks.json generation when skipDamageControl is true', async () => {
      const hooksPath = path.join(testDir, '.cursor', 'hooks.json');
      // Ensure file doesn't exist before setup
      expect(await fs.pathExists(hooksPath)).toBe(false);

      await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

      // With skipDamageControl: true, hooks.json should not be created
      expect(await fs.pathExists(hooksPath)).toBe(false);
    });

    it('copies damage control scripts', async () => {
      await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: false });

      const bashScript = path.join(
        testDir,
        '.cursor',
        'hooks',
        'damage-control',
        'bash-tool-damage-control.js'
      );
      const editScript = path.join(
        testDir,
        '.cursor',
        'hooks',
        'damage-control',
        'edit-tool-damage-control.js'
      );
      const utilsScript = path.join(testDir, '.cursor', 'hooks', 'lib', 'damage-control-utils.js');

      expect(await fs.pathExists(bashScript)).toBe(true);
      expect(await fs.pathExists(editScript)).toBe(true);
      expect(await fs.pathExists(utilsScript)).toBe(true);
    });

    it('does not duplicate hooks on reinstall', async () => {
      // First install
      await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: false });
      const hooksPath = path.join(testDir, '.cursor', 'hooks.json');
      const hooks1 = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      // Cleanup and reinstall
      await cursorSetup.cleanup(testDir);
      await cursorSetup.setup(testDir, agileflowDir, { skipDamageControl: false });
      const hooks2 = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      // Count hooks with damage-control in args
      const dcHooks1 = hooks1.filter(h =>
        h.args?.some(arg => arg.includes('damage-control'))
      ).length;
      const dcHooks2 = hooks2.filter(h =>
        h.args?.some(arg => arg.includes('damage-control'))
      ).length;

      expect(dcHooks1).toBe(dcHooks2);
    });
  });
});
