/**
 * Tests for Windsurf IDE installer
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { WindsurfSetup } = require('../../../tools/cli/installers/ide/windsurf');

describe('WindsurfSetup', () => {
  let testDir;
  let windsurfSetup;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-test-'));
    windsurfSetup = new WindsurfSetup();
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('constructor', () => {
    it('initializes with correct name and configDir', () => {
      expect(windsurfSetup.name).toBe('windsurf');
      expect(windsurfSetup.displayName).toBe('Windsurf');
      expect(windsurfSetup.preferred).toBe(true); // Windsurf is preferred
      expect(windsurfSetup.configDir).toBe('.windsurf');
      expect(windsurfSetup.workflowsDir).toBe('workflows');
    });
  });

  describe('detect', () => {
    it('returns false when .windsurf does not exist', async () => {
      const result = await windsurfSetup.detect(testDir);
      expect(result).toBe(false);
    });

    it('returns true when .windsurf exists', async () => {
      await fs.ensureDir(path.join(testDir, '.windsurf'));
      const result = await windsurfSetup.detect(testDir);
      expect(result).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('removes AgileFlow workflows directory', async () => {
      const workflowsPath = path.join(testDir, '.windsurf', 'workflows', 'agileflow');
      await fs.ensureDir(workflowsPath);
      await fs.writeFile(path.join(workflowsPath, 'test.md'), 'test');

      await windsurfSetup.cleanup(testDir);

      expect(await fs.pathExists(workflowsPath)).toBe(false);
    });

    it('handles non-existent directories gracefully', async () => {
      // Should not throw
      await expect(windsurfSetup.cleanup(testDir)).resolves.not.toThrow();
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
        path.join(agileflowDir, 'commands', 'test-workflow.md'),
        `---
description: Test workflow
---

# Test Workflow

This is a test workflow.`
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

    it('creates .windsurf/workflows/agileflow directory', async () => {
      await windsurfSetup.setup(testDir, agileflowDir);

      const targetDir = path.join(testDir, '.windsurf', 'workflows', 'agileflow');
      expect(await fs.pathExists(targetDir)).toBe(true);
    });

    it('installs workflows to correct location', async () => {
      const result = await windsurfSetup.setup(testDir, agileflowDir);

      expect(result.success).toBe(true);
      expect(result.commands).toBeGreaterThanOrEqual(1);

      const workflowPath = path.join(testDir, '.windsurf', 'workflows', 'agileflow', 'test-workflow.md');
      expect(await fs.pathExists(workflowPath)).toBe(true);
    });

    it('installs agents to agents subdirectory', async () => {
      const result = await windsurfSetup.setup(testDir, agileflowDir);

      expect(result.agents).toBeGreaterThanOrEqual(1);

      const agentPath = path.join(testDir, '.windsurf', 'workflows', 'agileflow', 'agents', 'test-agent.md');
      expect(await fs.pathExists(agentPath)).toBe(true);
    });

    it('returns correct counts', async () => {
      const result = await windsurfSetup.setup(testDir, agileflowDir);

      expect(result).toMatchObject({
        success: true,
        commands: expect.any(Number),
        agents: expect.any(Number),
      });
    });

    it('uses correct folder name (agileflow lowercase)', async () => {
      await windsurfSetup.setup(testDir, agileflowDir);

      // Should be lowercase 'agileflow' not 'AgileFlow'
      const targetDir = path.join(testDir, '.windsurf', 'workflows', 'agileflow');
      expect(await fs.pathExists(targetDir)).toBe(true);

      const wrongCaseDir = path.join(testDir, '.windsurf', 'workflows', 'AgileFlow');
      expect(await fs.pathExists(wrongCaseDir)).toBe(false);
    });
  });

  describe('setAgileflowFolder', () => {
    it('sets the agileflow folder name', () => {
      windsurfSetup.setAgileflowFolder('custom-agileflow');
      expect(windsurfSetup.agileflowFolder).toBe('custom-agileflow');
    });
  });

  describe('setDocsFolder', () => {
    it('sets the docs folder name', () => {
      windsurfSetup.setDocsFolder('documentation');
      expect(windsurfSetup.docsFolder).toBe('documentation');
    });
  });
});
