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

  describe('cleanup', () => {
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

      const agentPath = path.join(testDir, '.cursor', 'commands', 'AgileFlow', 'agents', 'test-agent.md');
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
});
