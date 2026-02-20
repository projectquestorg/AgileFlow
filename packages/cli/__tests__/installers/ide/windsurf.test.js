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
      expect(windsurfSetup.preferred).toBe(false); // Windsurf changed to non-preferred in f058b90
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

  describe('convertAgentToSkill', () => {
    it('converts agent to SKILL.md format with YAML frontmatter', () => {
      const agentContent = `---
name: test-agent
description: Test agent for database operations
---

# Test Agent

This is a test agent.`;

      const skillContent = windsurfSetup.convertAgentToSkill(agentContent, 'test-agent');

      expect(skillContent).toContain('name: agileflow-test-agent');
      expect(skillContent).toContain('description: Test agent for database operations');
      expect(skillContent).toContain('---');
      expect(skillContent).toContain('# AgileFlow: Test-agent Skill');
      expect(skillContent).toContain('@agileflow-test-agent');
    });

    it('replaces Claude-specific references', () => {
      const agentContent = `---
description: Test
---

Use Claude Code with the Task tool to delegate work.
Import .claude/agents/agileflow agents for coordination.`;

      const skillContent = windsurfSetup.convertAgentToSkill(agentContent, 'test');

      expect(skillContent).toContain('Windsurf');
      expect(skillContent).toContain('workflow chaining');
      expect(skillContent).toContain('.windsurf');
    });

    it('replaces /agileflow: slash commands for workflow chaining', () => {
      const agentContent = `---
description: Test
---

Use /agileflow:story:list to list stories.
Chain with /agileflow:status:update for status updates.`;

      const skillContent = windsurfSetup.convertAgentToSkill(agentContent, 'test');

      expect(skillContent).toContain('/agileflow-story-list');
      expect(skillContent).toContain('/agileflow-status-update');
    });

    it('strips YAML frontmatter from output', () => {
      const agentContent = `---
name: test
description: Test
internal: true
---

# Content`;

      const skillContent = windsurfSetup.convertAgentToSkill(agentContent, 'test');

      // Should have only one frontmatter section (the new one)
      const frontmatterMatches = skillContent.match(/^---/gm);
      expect(frontmatterMatches.length).toBe(2); // Opening and closing ---
    });

    it('warns when skill content exceeds 12,000 character limit', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Create large content
      const largeContent = `---
description: Very long agent
---

# Very Long Agent

${'Lorem ipsum dolor sit amet. '.repeat(500)}`;

      windsurfSetup.convertAgentToSkill(largeContent, 'large-agent');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeds 12,000 character limit')
      );

      consoleSpy.mockRestore();
    });

    it('handles default description when not provided', () => {
      const agentContent = `---
name: no-desc-agent
---

# No Description Agent`;

      const skillContent = windsurfSetup.convertAgentToSkill(agentContent, 'no-desc');

      expect(skillContent).toContain('description: AgileFlow no-desc agent');
    });
  });

  describe('installSkills', () => {
    let agileflowDir;

    beforeEach(async () => {
      agileflowDir = path.join(testDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'agents'));

      // Create sample agents
      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'database.md'),
        `---
name: database
description: Database operations
---

# Database Agent`
      );

      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'api.md'),
        `---
name: api
description: API operations
---

# API Agent`
      );
    });

    it('creates .windsurf/skills/agileflow-{name}/ directories', async () => {
      await windsurfSetup.installSkills(testDir, agileflowDir);

      const dbSkillDir = path.join(testDir, '.windsurf', 'skills', 'agileflow-database');
      const apiSkillDir = path.join(testDir, '.windsurf', 'skills', 'agileflow-api');

      expect(await fs.pathExists(dbSkillDir)).toBe(true);
      expect(await fs.pathExists(apiSkillDir)).toBe(true);
    });

    it('installs SKILL.md files in skill directories', async () => {
      await windsurfSetup.installSkills(testDir, agileflowDir);

      const dbSkillMd = path.join(testDir, '.windsurf', 'skills', 'agileflow-database', 'SKILL.md');
      const apiSkillMd = path.join(testDir, '.windsurf', 'skills', 'agileflow-api', 'SKILL.md');

      expect(await fs.pathExists(dbSkillMd)).toBe(true);
      expect(await fs.pathExists(apiSkillMd)).toBe(true);
    });

    it('returns correct skill count', async () => {
      const count = await windsurfSetup.installSkills(testDir, agileflowDir);

      expect(count).toBe(2);
    });

    it('returns 0 when agents directory does not exist', async () => {
      await fs.remove(path.join(agileflowDir, 'agents'));

      const count = await windsurfSetup.installSkills(testDir, agileflowDir);

      expect(count).toBe(0);
    });

    it('creates valid SKILL.md with YAML frontmatter', async () => {
      await windsurfSetup.installSkills(testDir, agileflowDir);

      const skillMd = path.join(testDir, '.windsurf', 'skills', 'agileflow-database', 'SKILL.md');
      const content = await fs.readFile(skillMd, 'utf8');

      expect(content).toMatch(/^---\nname: agileflow-database\n/);
      expect(content).toContain('# AgileFlow: Database Skill');
    });
  });

  describe('setupDamageControlHooks', () => {
    it('creates hooks.json with damage control hooks', async () => {
      const agileflowDir = path.join(testDir, '.agileflow');
      const windsurfDir = path.join(testDir, '.windsurf');
      await fs.ensureDir(windsurfDir);

      await windsurfSetup.setupDamageControlHooks(testDir, agileflowDir, windsurfDir, {
        skipDamageControl: false,
      });

      const hooksPath = path.join(windsurfDir, 'hooks.json');
      expect(await fs.pathExists(hooksPath)).toBe(true);

      const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
      expect(Array.isArray(hooks)).toBe(true);
      expect(hooks.length).toBeGreaterThan(0);
    });

    it('adds pre_run_command hook for bash damage control', async () => {
      const agileflowDir = path.join(testDir, '.agileflow');
      const windsurfDir = path.join(testDir, '.windsurf');
      await fs.ensureDir(windsurfDir);

      await windsurfSetup.setupDamageControlHooks(testDir, agileflowDir, windsurfDir, {
        skipDamageControl: false,
      });

      const hooksPath = path.join(windsurfDir, 'hooks.json');
      const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      const bashHook = hooks.find(h => h.event === 'pre_run_command');
      expect(bashHook).toBeDefined();
      expect(bashHook.command).toBe('node');
      expect(bashHook.args[0]).toContain('damage-control-bash.js');
    });

    it('adds post_write_code hook for edit damage control', async () => {
      const agileflowDir = path.join(testDir, '.agileflow');
      const windsurfDir = path.join(testDir, '.windsurf');
      await fs.ensureDir(windsurfDir);

      await windsurfSetup.setupDamageControlHooks(testDir, agileflowDir, windsurfDir, {
        skipDamageControl: false,
      });

      const hooksPath = path.join(windsurfDir, 'hooks.json');
      const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      const editHook = hooks.find(h => h.event === 'post_write_code');
      expect(editHook).toBeDefined();
      expect(editHook.command).toBe('node');
      expect(editHook.args[0]).toContain('damage-control-edit.js');
    });

    it('merges with existing hooks non-destructively', async () => {
      const agileflowDir = path.join(testDir, '.agileflow');
      const windsurfDir = path.join(testDir, '.windsurf');
      await fs.ensureDir(windsurfDir);

      // Create existing hooks with custom hook
      const existingHook = {
        event: 'pre_user_prompt',
        command: 'custom',
        args: ['custom-arg'],
      };
      const hooksPath = path.join(windsurfDir, 'hooks.json');
      await fs.writeFile(hooksPath, JSON.stringify([existingHook], null, 2));

      await windsurfSetup.setupDamageControlHooks(testDir, agileflowDir, windsurfDir, {
        skipDamageControl: false,
      });

      const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      expect(hooks.length).toBeGreaterThan(1);
      expect(hooks.some(h => h.event === 'pre_user_prompt')).toBe(true);
      expect(hooks.some(h => h.event === 'pre_run_command')).toBe(true);
    });

    it('does not duplicate hooks if already present', async () => {
      const agileflowDir = path.join(testDir, '.agileflow');
      const windsurfDir = path.join(testDir, '.windsurf');
      await fs.ensureDir(windsurfDir);

      // First setup
      await windsurfSetup.setupDamageControlHooks(testDir, agileflowDir, windsurfDir, {
        skipDamageControl: false,
      });

      const hooksPath = path.join(windsurfDir, 'hooks.json');
      const firstHooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      // Second setup (should not duplicate)
      await windsurfSetup.setupDamageControlHooks(testDir, agileflowDir, windsurfDir, {
        skipDamageControl: false,
      });

      const secondHooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));

      expect(secondHooks.length).toBe(firstHooks.length);
    });

    it('skips hook setup when skipDamageControl is true', async () => {
      const agileflowDir = path.join(testDir, '.agileflow');
      const windsurfDir = path.join(testDir, '.windsurf');
      await fs.ensureDir(windsurfDir);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await windsurfSetup.setupDamageControlHooks(testDir, agileflowDir, windsurfDir, {
        skipDamageControl: true,
      });

      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('hooks enabled'));

      consoleSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    let agileflowDir;

    beforeEach(async () => {
      agileflowDir = path.join(testDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'workflows'));
      await fs.ensureDir(path.join(agileflowDir, 'agents'));
    });

    it('removes AgileFlow workflows directory', async () => {
      const workflowsPath = path.join(testDir, '.windsurf', 'workflows', 'agileflow');
      await fs.ensureDir(workflowsPath);
      await fs.writeFile(path.join(workflowsPath, 'test.md'), 'test');

      await windsurfSetup.cleanup(testDir);

      expect(await fs.pathExists(workflowsPath)).toBe(false);
    });

    it('removes old skills directories', async () => {
      const skillsDir = path.join(testDir, '.windsurf', 'skills');
      await fs.ensureDir(path.join(skillsDir, 'agileflow-database'));
      await fs.writeFile(path.join(skillsDir, 'agileflow-database', 'SKILL.md'), 'test');

      await windsurfSetup.cleanup(testDir);

      expect(await fs.pathExists(path.join(skillsDir, 'agileflow-database'))).toBe(false);
    });

    it('does not remove non-agileflow skills', async () => {
      const skillsDir = path.join(testDir, '.windsurf', 'skills');
      const customSkillDir = path.join(skillsDir, 'custom-skill');
      await fs.ensureDir(customSkillDir);
      await fs.writeFile(path.join(customSkillDir, 'SKILL.md'), 'custom');

      await windsurfSetup.cleanup(testDir);

      expect(await fs.pathExists(customSkillDir)).toBe(true);
      expect(await fs.pathExists(path.join(customSkillDir, 'SKILL.md'))).toBe(true);
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
      await windsurfSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

      const targetDir = path.join(testDir, '.windsurf', 'workflows', 'agileflow');
      expect(await fs.pathExists(targetDir)).toBe(true);
    });

    it('installs workflows to correct location', async () => {
      const result = await windsurfSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

      expect(result.success).toBe(true);
      expect(result.commands).toBeGreaterThanOrEqual(1);

      const workflowPath = path.join(
        testDir,
        '.windsurf',
        'workflows',
        'agileflow',
        'test-workflow.md'
      );
      expect(await fs.pathExists(workflowPath)).toBe(true);
    });

    it('installs agents to agents subdirectory', async () => {
      const result = await windsurfSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

      expect(result.agents).toBeGreaterThanOrEqual(1);

      const agentPath = path.join(
        testDir,
        '.windsurf',
        'workflows',
        'agileflow',
        'agents',
        'test-agent.md'
      );
      expect(await fs.pathExists(agentPath)).toBe(true);
    });

    it('installs agents as skills', async () => {
      const result = await windsurfSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

      expect(result.agents).toBeGreaterThanOrEqual(1);
      expect(result.skills).toBeGreaterThanOrEqual(1);

      const skillPath = path.join(
        testDir,
        '.windsurf',
        'skills',
        'agileflow-test-agent',
        'SKILL.md'
      );
      expect(await fs.pathExists(skillPath)).toBe(true);
    });

    it('generates hooks.json with damage control hooks', async () => {
      const result = await windsurfSetup.setup(testDir, agileflowDir, { skipDamageControl: false });

      const hooksPath = path.join(testDir, '.windsurf', 'hooks.json');
      expect(await fs.pathExists(hooksPath)).toBe(true);

      const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
      expect(Array.isArray(hooks)).toBe(true);
    });

    it('returns correct counts', async () => {
      const result = await windsurfSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

      expect(result).toMatchObject({
        success: true,
        commands: expect.any(Number),
        agents: expect.any(Number),
        skills: expect.any(Number),
      });
    });

    it('uses correct folder name (agileflow lowercase)', async () => {
      await windsurfSetup.setup(testDir, agileflowDir, { skipDamageControl: true });

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
